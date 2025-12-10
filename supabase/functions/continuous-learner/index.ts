import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getFullInstructions, detectRoleFromCategory } from "../_shared/abczorg-instructions.ts";
import { 
  corsHeaders, 
  createSmartClient, 
  fetchWithRetry, 
  handleCors, 
  jsonResponse, 
  errorResponse 
} from "../_shared/core.ts";
import { anonymizePII, createLearningEvent, logLearningEvent, logFunctionCall } from "../_shared/telemetry.ts";

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();

  try {
    // Use smart client from shared core module (handles auth fallback automatically)
    const authHeader = req.headers.get('Authorization');
    const { client: supabase, userId, orgId, isAuthenticated } = await createSmartClient(authHeader);
    
    console.log(`🎓 Continuous Learner - Mode: ${isAuthenticated ? 'authenticated' : 'autonomous'}`)

    const { 
      user_question, 
      ai_response, 
      knowledge_used,
      user_feedback,
      auto_apply = true  // ✅ NIEUW: backward compatible, default TRUE
    } = await req.json();

    // ✅ Early validation: require both user_question and ai_response
    if (!user_question || !ai_response) {
      console.log('⚠️ Missing required fields - skipping analysis');
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Missing required fields: user_question and ai_response are required',
        processed: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    console.log('🎓 Continuous Learner analyzing interaction...');

    // Analyze the chat interaction with AI (with retry for transient failures)
    const analysisResponse = await fetchWithRetry('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `${getFullInstructions(`
⚠️ SPECIFIEKE INSTRUCTIES VOOR CONTINUOUS LEARNER:
Je rol is nu om als learning expert te fungeren. Je analyseert chat interacties om de kennisbank continu te verbeteren volgens de ABCzorg & CitoZorg standaarden. Al je suggesties moeten passen binnen de organisatiecultuur en professionele richtlijnen zoals beschreven in de hoofdinstructies.`)}

ANALYSE OPDRACHT:
Analyseer deze chat interactie en bepaal:
1. Was het antwoord volledig? (yes/no)
2. Was het antwoord accuraat? (yes/no)
3. Welke kennis ontbreekt? (list missing topics)
4. Welke kennis moet worden geüpdatet? (list knowledge_ids met nieuwe confidence scores)
5. Zijn er tegenstrijdigheden gedetecteerd? (yes/no)
6. Suggesties voor nieuwe kennisitems (list max 3)

VOOR ELKE NIEUWE KNOWLEDGE SUGGESTION, VOEG TOE:
- category: Gebruik correcte categorie (bedrijfsgegevens, tarieven, contracten, processen, compliance, zzp_vereisten, klantinfo, hr_verlof, hr_arbeidsvoorwaarden, hr_onboarding, hr_evaluatie)
- role_tags: Array met 1+ tags uit: ["HR", "Planning", "Facturatie", "Compliance", "Sales", "Directie", "Klantenservice", "Media", "IT", "Juridisch"]
- confidentiality: "intern" (default voor algemene info) of "vertrouwelijk" (voor HR/gevoelige data)
- valid_from: Startdatum (YYYY-MM-DD) of null voor vandaag
- jurisdiction: Altijd "NL" voor Nederland

⚠️ BELANGRIJK: Voor HR-categorieën (hr_*), stel ALTIJD:
- confidentiality: "vertrouwelijk"
- acl: ["admin", "manager"]
- role_tags: moet minimaal ["HR"] bevatten

Output ALLEEN valid JSON object met deze keys:
{
  "completeness": "yes/no",
  "accuracy": "yes/no/uncertain",
  "missing_knowledge": ["topic1", "topic2"],
  "confidence_updates": [{"knowledge_id": "uuid", "new_confidence": 0.0-1.0, "reason": "text"}],
  "contradictions_found": true/false,
  "new_knowledge_suggestions": [{
    "category": "x", 
    "key": "y", 
    "value": {}, 
    "confidence": 0.8,
    "role_tags": ["HR"],
    "confidentiality": "vertrouwelijk",
    "valid_from": null,
    "jurisdiction": "NL"
  }],
  "learning_score": 0.0-1.0
}`
          },
          {
            role: 'user',
            content: `Analyseer deze chat interactie:

VRAAG: ${anonymizePII(user_question)}

AI ANTWOORD: ${anonymizePII(ai_response)}

GEBRUIKTE KENNIS: ${JSON.stringify(knowledge_used || [])}

USER FEEDBACK: ${user_feedback || 'none'}`
          }
        ],
        temperature: 0.2,
      }),
    });

    if (!analysisResponse.ok) {
      if (analysisResponse.status === 429) {
        throw new Error('Rate limit exceeded');
      }
      if (analysisResponse.status === 402) {
        throw new Error('AI credits exhausted');
      }
      throw new Error(`AI API error: ${analysisResponse.status}`);
    }

    const analysisData = await analysisResponse.json();
    const analysisContent = analysisData.choices[0].message.content;

    console.log('📊 Analysis received, processing results...');

    let analysis;
    try {
      const jsonMatch = analysisContent.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(analysisContent);
    } catch {
      analysis = {
        completeness: 'uncertain',
        accuracy: 'uncertain',
        learning_score: 0.5,
        missing_knowledge: [],
        confidence_updates: [],
        contradictions_found: false,
        new_knowledge_suggestions: []
      };
    }

    // ✅ INTELLIGENT LEARNING: Auto-create with conflict detection
    let suggestionsCreated = 0;
    let suggestionsRejected = 0;
    let suggestionsReinforced = 0;
    
    if (auto_apply && analysis.new_knowledge_suggestions?.length > 0) {
      console.log(`💡 Processing ${analysis.new_knowledge_suggestions.length} knowledge suggestions with conflict detection...`);
      
      for (const suggestion of analysis.new_knowledge_suggestions) {
        // Threshold check
        if (suggestion.confidence >= 0.80) {
          // ✅ STEP 1: Conflict detection before creating
          const conflictCheckResponse = await supabase.functions.invoke('detect-and-resolve-conflicts', {
            body: {
              suggestion: {
                ...suggestion,
                source_type: 'ai_generated'
              },
              org_id: orgId
            }
          });

          if (conflictCheckResponse.error) {
            console.error('❌ Conflict check failed:', conflictCheckResponse.error);
            continue;
          }

          const conflictResult = conflictCheckResponse.data;
          
          if (conflictResult.shouldReject) {
            suggestionsRejected++;
            console.log(`🚫 REJECTED suggestion "${suggestion.key}": ${conflictResult.reason}`);
            continue;
          }

          if (conflictResult.hasConflict) {
            console.log(`⚠️ Conflict detected for "${suggestion.key}" but allowing: ${conflictResult.reason}`);
          }

          // ✅ STEP 2: Check for existing similar knowledge - BOOST or CREATE
          const { data: existingSimilar, error: existingError } = await supabase
            .from('ai_knowledge_base')
            .select('id, stability_score, observation_count')
            .eq('key', suggestion.key)
            .eq('org_id', orgId)
            .is('deleted_at', null)
            .maybeSingle();

          if (existingError) {
            console.warn('⚠️ Failed to check existing knowledge for reinforcement:', existingError);
          }

          if (existingSimilar) {
            const currentStability = typeof existingSimilar.stability_score === 'number'
              ? existingSimilar.stability_score
              : 0.5;
            const newStability = Math.min(1.0, currentStability + 0.1);
            const newObservationCount = (existingSimilar.observation_count ?? 1) + 1;

            const { error: updateError } = await supabase
              .from('ai_knowledge_base')
              .update({
                stability_score: newStability,
                observation_count: newObservationCount,
                updated_at: new Date().toISOString(),
                auto_reviewed_at: new Date().toISOString()
              })
              .eq('id', existingSimilar.id)
              .eq('org_id', orgId);

            if (updateError) {
              console.error(`❌ Failed to reinforce knowledge "${suggestion.key}":`, updateError);
            } else {
              suggestionsReinforced++;
              console.log(
                `🔄 Reinforced knowledge "${suggestion.key}": stability ${currentStability.toFixed(2)} → ${newStability.toFixed(2)}, observations: ${newObservationCount}`
              );
            }

            continue;
          }

          // ✅ NO EXISTING ITEM: create new knowledge with initial observation_count
          // ✅ P2-3 ENHANCED: PII REDACTION with improved error handling
          let redactedValue = suggestion.value;
          let originalText = '';
          
          if (typeof redactedValue === 'object') {
            originalText = JSON.stringify(redactedValue);
          } else {
            originalText = String(redactedValue);
          }
          
          const { data: redactedResult, error: redactError } = await supabase.rpc('redact_pii', {
            input_text: originalText
          });
          
          if (redactError) {
            console.warn('⚠️ PII redaction failed, using original value:', redactError);
          } else if (redactedResult && redactedResult !== originalText) {
            console.log('🔒 PII redacted in suggestion:', suggestion.key);
            try {
              if (typeof redactedValue === 'object') {
                redactedValue = JSON.parse(redactedResult);
              } else {
                redactedValue = redactedResult;
              }
            } catch {
              redactedValue = { redacted_content: redactedResult };
            }
          }
          
          // Detect role tags from category if not provided
          const roleTags = suggestion.role_tags || detectRoleFromCategory(suggestion.category);
          
          // Auto-set confidentiality for HR categories
          let confidentiality = suggestion.confidentiality || 'intern';
          let acl = suggestion.acl || [];
          
          if (suggestion.category?.startsWith('hr_')) {
            confidentiality = 'vertrouwelijk';
            acl = ['admin', 'manager'];
          }
          
          // ✅ STEP 3: Determine stability score based on category
          let stabilityScore = 0.5; // default
          const category = suggestion.category || 'learned_from_chat';
          
          if (category.includes('adres') || category === 'bedrijfsgegevens') {
            stabilityScore = 0.95; // Addresses rarely change
          } else if (category.includes('kvk') || category.includes('btw')) {
            stabilityScore = 0.99; // Legal registration numbers almost never change
          } else if (category.includes('tarief') || category.includes('prijs')) {
            stabilityScore = 0.60; // Prices change periodically
          } else if (category.includes('contact')) {
            stabilityScore = 0.40; // Contact persons change frequently
          }

          const { error: insertError } = await supabase
            .from('ai_knowledge_base')
            .insert({
              user_id: userId,
              org_id: orgId,
              category: suggestion.category || 'learned_from_chat',
              key: suggestion.key,
              value: redactedValue,
              confidence_score: suggestion.confidence,
              source: 'continuous_learner_auto_suggestion',
              auto_reviewed_at: new Date().toISOString(),
              review_count: 1,
              // Week 1-2: Metadata fields
              role_tags: roleTags,
              confidentiality: confidentiality,
              valid_from: suggestion.valid_from || new Date().toISOString().split('T')[0],
              jurisdiction: suggestion.jurisdiction || 'NL',
              acl: acl,
              // ✅ NEW: Source tracking & stability
              source_type: 'ai_generated',
              source_reference: `continuous-learner:auto-suggestion`,
              requires_verification: suggestion.confidence < 0.95,
              stability_score: stabilityScore,
              observation_count: 1,
              correction_count: 0
            });
          
          if (!insertError) {
            suggestionsCreated++;
            console.log(`✅ Created new knowledge: ${suggestion.key}`);
          } else {
            console.error(`❌ Failed to create knowledge "${suggestion.key}":`, insertError);
            console.error('❌ Insert data was:', {
              user_id: userId,
              org_id: orgId,
              category: suggestion.category,
              key: suggestion.key,
              confidence: suggestion.confidence,
              value: redactedValue,
              source: 'continuous_learner_auto_suggestion'
            });
          }
        }
      }
    }

    // Apply confidence updates (✅ VERBETERD: met validatie en safety checks)
    let updatesApplied = 0;
    let feedbackProcessed = 0;
    let itemsPruned = 0;
    
    if (auto_apply && analysis.confidence_updates?.length > 0) {
      console.log(`🔄 Applying ${analysis.confidence_updates.length} confidence updates...`);
      
      for (const update of analysis.confidence_updates) {
        // ✅ VALIDATION: Check if knowledge_id exists
        const { data: existingKb } = await supabase
          .from('ai_knowledge_base')
          .select('id, confidence_score, review_count')
          .eq('id', update.knowledge_id)
          .eq('org_id', orgId)
          .is('deleted_at', null)
          .maybeSingle();
        
        if (!existingKb) {
          console.warn(`⚠️ Knowledge ${update.knowledge_id} not found, skipping update`);
          continue;
        }
        
        // ✅ SAFETY: Cap confidence between 0.3 and 1.0
        const newConfidence = Math.max(0.3, Math.min(1.0, update.new_confidence));
        
        const { error } = await supabase
          .from('ai_knowledge_base')
          .update({ 
            confidence_score: newConfidence,
            updated_at: new Date().toISOString(),
            auto_reviewed_at: new Date().toISOString(),
            review_count: (existingKb.review_count || 0) + 1,
            last_validation_error: null
          })
          .eq('id', update.knowledge_id)
          .eq('org_id', orgId);

        if (!error) {
          updatesApplied++;
          console.log(`✅ Updated ${update.knowledge_id}: ${existingKb.confidence_score} → ${newConfidence}`);
        } else {
          console.error(`❌ Failed to update ${update.knowledge_id}:`, error);
        }
      }
    }

    // Store learning event
    const { data: learningEvent } = await supabase
      .from('ai_learning_events')
      .insert({
        user_id: userId,
        org_id: orgId,
        event_type: 'chat_analysis',
        context: {
          question: user_question,
          response: ai_response,
          knowledge_used: knowledge_used,
          user_feedback: user_feedback
        },
        ai_response: analysis,
        outcome: analysis.completeness === 'yes' && analysis.accuracy === 'yes' ? 'success' : 'needs_improvement',
        learning_score: analysis.learning_score,
        applied_to_knowledge_base: auto_apply && (updatesApplied > 0 || suggestionsCreated > 0 || suggestionsReinforced > 0)  // ✅ DYNAMISCH: ook TRUE bij reinforcement-updates
      })
      .select()
      .single();

    // Mark contradictions for review
    if (analysis.contradictions_found) {
      for (const knowledge of knowledge_used || []) {
        await supabase
          .from('ai_knowledge_base')
          .update({ needs_review: true })
          .eq('id', knowledge.id)
          .eq('org_id', orgId);
      }
    }

    console.log(`✅ Learning analysis complete. ${updatesApplied} confidence scores updated, ${suggestionsCreated} created, ${suggestionsRejected} rejected by conflict detection.`);

    // ✅ ACE PHASE 1: Process user feedback (helpful/harmful)
    // Process user feedback if applicable
    if (user_feedback === 'helpful' || user_feedback === 'harmful') {
      const feedbackColumn = user_feedback === 'helpful' ? 'helpful_count' : 'harmful_count';
      console.log(`📊 Processing ${user_feedback} feedback for ${knowledge_used?.length || 0} knowledge items`);
      
      for (const knowledgeId of (knowledge_used || [])) {
        // First get current value, then increment - select both columns to satisfy TypeScript
        const { data: currentItem } = await supabase
          .from('ai_knowledge_base')
          .select('helpful_count, harmful_count')
          .eq('id', knowledgeId)
          .eq('org_id', orgId)
          .maybeSingle();
        
        const currentValue = feedbackColumn === 'helpful_count' 
          ? (currentItem?.helpful_count || 0)
          : (currentItem?.harmful_count || 0);
        
        const { error: feedbackError } = await supabase
          .from('ai_knowledge_base')
          .update({ 
            [feedbackColumn]: currentValue + 1,
            last_used_at: new Date().toISOString()
          })
          .eq('id', knowledgeId)
          .eq('org_id', orgId);
        
        if (feedbackError) {
          console.error(`❌ Failed to update ${feedbackColumn} for ${knowledgeId}:`, feedbackError);
        } else {
          feedbackProcessed++;
          console.log(`✅ ${user_feedback} feedback recorded for knowledge ${knowledgeId}`);
        }
      }
      
      // ✅ ACE PRUNING: Auto-delete harmful knowledge (harmful ratio ≥ 70%)
      const { data: allItems, error: queryError } = await supabase
        .from('ai_knowledge_base')
        .select('id, key, helpful_count, harmful_count')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .gte('harmful_count', 3);  // Minimaal 3 harmful votes voor betrouwbaarheid
      
      if (queryError) {
        console.error('❌ Failed to query harmful items:', queryError);
      } else if (allItems && allItems.length > 0) {
        // Filter in-memory (omdat Postgres geen computed columns in WHERE ondersteunt)
        const harmfulItems = allItems.filter((item: any) => {
          const total = item.helpful_count + item.harmful_count;
          const harmfulRatio = item.harmful_count / total;
          return harmfulRatio >= 0.70;
        });
        
        if (harmfulItems.length > 0) {
          const prunedIds = harmfulItems.map((item: any) => item.id);
          
          const { error: pruneError } = await supabase
            .from('ai_knowledge_base')
            .update({
              deleted_at: new Date().toISOString(),
              deleted_by: 'ACE_AUTO_PRUNER',
              deletion_reason: {
                trigger: 'harmful_ratio_threshold',
                threshold: 0.70,
                items: harmfulItems.map((item: any) => ({
                  key: item.key,
                  harmful_count: item.harmful_count,
                  helpful_count: item.helpful_count,
                  harmful_ratio: (item.harmful_count / (item.helpful_count + item.harmful_count) * 100).toFixed(1) + '%'
                })),
                pruned_at: new Date().toISOString()
              }
            })
            .in('id', prunedIds);
          
          if (pruneError) {
            console.error('❌ Failed to prune harmful items:', pruneError);
          } else {
            itemsPruned = prunedIds.length;
            console.log(`🗑️ ACE PRUNED ${itemsPruned} harmful knowledge items:`, prunedIds);
          }
        }
      }
    }

    // Log function call with enhanced metrics (after all processing)
    const executionTime = Date.now() - startTime;
    // ✅ Safe null-checks for token calculation
    const inputTokens = Math.ceil(((user_question || '').length + (ai_response || '').length) / 4);
    const outputTokens = Math.ceil((analysisContent || '').length / 4);

    await supabase.from('function_call_logs').insert({
      user_id: userId,
      org_id: orgId,
      function_name: 'continuous-learner',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      estimated_cost_eur: 0,
      model_used: 'gemini-2.5-flash',
      success: true,
      execution_time_ms: executionTime,
      metadata: {
        suggestions_created: suggestionsCreated,
        suggestions_rejected: suggestionsRejected,
        updates_applied: updatesApplied,
        feedback_processed: feedbackProcessed,
        items_pruned: itemsPruned,
        learning_score: analysis.learning_score
      }
    });

    return new Response(JSON.stringify({
      success: true,
      analysis: analysis,
      learning_event_id: learningEvent?.id,
      confidence_updates_applied: updatesApplied,
      suggestions_created: suggestionsCreated,
      suggestions_rejected: suggestionsRejected,
      contradictions_marked: analysis.contradictions_found,
      auto_apply_enabled: auto_apply,
      feedback_processed: feedbackProcessed,
      items_pruned: itemsPruned,
      execution_time_ms: executionTime
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Continuous Learner error:', error);
    
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});