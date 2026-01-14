import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';
import { createKnowledge, reinforceKnowledge } from "../_shared/knowledge-crud.ts";
import { isPlaceholderPhone } from '../_shared/healthcare-mappings.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }
    
    const supabase = createAdminClient();
    
    console.log('🔍 Fetching unprocessed system events...');
    
    // Haal onverwerkte events op (max 50 per run)
    // IMPORTANT: Filter out test data to prevent AI learning from test entities
    const { data: events, error: eventsError } = await supabase
      .from('system_events')
      .select('*')
      .is('processed_at', null)
      .eq('is_test_data', false) // Filter out test data
      .order('created_at', { ascending: true })
      .limit(50);
    
    console.log('🛡️ Test data filter active - only learning from production data');
    
    if (eventsError) {
      console.error('❌ Error fetching events:', eventsError);
      return new Response(JSON.stringify({ error: eventsError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (!events || events.length === 0) {
      console.log('✅ No unprocessed events found');
      return new Response(JSON.stringify({ 
        processed: 0,
        message: 'No events to process' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log(`📊 Processing ${events.length} events...`);
    
    let processedCount = 0;
    let knowledgeCreatedCount = 0;
    let errors: string[] = [];
    
    for (const event of events) {
      try {
        console.log(`🔄 Processing event ${event.id} (${event.event_type})...`);
        
        let analysis;
        
        // Specialized handling for evaluation events - direct knowledge creation
        if (event.event_type === 'assignment_evaluation_created') {
          analysis = await analyzeEvaluationEvent(event, supabase, LOVABLE_API_KEY);
        } else {
          // General AI analysis for other events
          analysis = await analyzeEventWithAI(event, LOVABLE_API_KEY);
        }
        
        // Creëer knowledge items als nodig
        if (analysis.shouldCreateKnowledge) {
          console.log(`✨ Creating knowledge from event ${event.id}...`);
          
          // Bepaal org_id met fallback strategie
          let orgId = event.org_id;
          
          // Fallback 1: probeer org_id uit event_data
          if (!orgId && event.event_data?.org_id) {
            orgId = event.event_data.org_id;
            console.log(`📋 Using org_id from event_data: ${orgId}`);
          }
          
          // Fallback 2: probeer org_id uit metadata
          if (!orgId && event.metadata?.org_id) {
            orgId = event.metadata.org_id;
            console.log(`📋 Using org_id from metadata: ${orgId}`);
          }
          
          // Skip knowledge creation als org_id niet beschikbaar
          if (!orgId) {
            console.warn(`⚠️ Skipping knowledge creation for event ${event.id}: org_id not available`);
            errors.push(`Event ${event.id}: Cannot create knowledge without org_id`);
          } else {
            try {
              // Use unified createKnowledge which handles:
              // - PII redaction automatically
              // - Conflict detection
              // - Reinforcement of existing items (exact matches)
              // - org_id validation
              // Cast to any to avoid SupabaseClient version mismatch between npm: and esm.sh imports
              const result = await createKnowledge(supabase as any, {
                org_id: orgId,
                user_id: event.user_id,
                category: analysis.category,
                key: analysis.key,
                value: analysis.value,
                confidence_score: analysis.confidence,
                source: `system_event:${event.event_type}`,
                source_reference: event.id,
                role_tags: analysis.role_tags || [],
                validation_status: 'pending',
                needs_review: true,
              }, { skipPIIRedaction: false });
              
              if (result.wasReinforced) {
                knowledgeCreatedCount++;
                console.log(`🔄 Knowledge reinforced via unified CRUD: ${result.existingId}`);
              } else {
                knowledgeCreatedCount++;
                console.log(`✅ Knowledge created via unified CRUD: ${result.id}`);
              }
              
              // For evaluation events, also create correlation knowledge
              if (event.event_type === 'assignment_evaluation_created' && analysis.correlationKnowledge) {
                for (const corrKnowledge of analysis.correlationKnowledge) {
                  try {
                    const corrResult = await createKnowledge(supabase as any, {
                      org_id: orgId,
                      user_id: event.user_id,
                      category: corrKnowledge.category,
                      key: corrKnowledge.key,
                      value: corrKnowledge.value,
                      confidence_score: corrKnowledge.confidence,
                      source: `system_event:${event.event_type}:correlation`,
                      source_reference: event.id,
                      role_tags: corrKnowledge.role_tags || ['admin', 'manager'],
                      validation_status: 'pending',
                      needs_review: true,
                    });
                    
                    knowledgeCreatedCount++;
                    console.log(`✅ Correlation knowledge created: ${corrKnowledge.key} (${corrResult.id})`);
                  } catch (corrError) {
                    console.error(`❌ Failed to create correlation knowledge:`, corrError);
                    errors.push(`Correlation ${corrKnowledge.key}: ${corrError instanceof Error ? corrError.message : 'Unknown error'}`);
                  }
                }
              }
            } catch (knowledgeError) {
              console.error(`❌ Failed to create knowledge for event ${event.id}:`, knowledgeError);
              errors.push(`Event ${event.id}: ${knowledgeError instanceof Error ? knowledgeError.message : 'Unknown error'}`);
            }
          }
        }
        
        // Markeer als verwerkt
        const { error: updateError } = await supabase
          .from('system_events')
          .update({
            processed_at: new Date().toISOString(),
            learning_outcome: analysis
          })
          .eq('id', event.id);
        
        if (updateError) {
          console.error(`❌ Failed to mark event ${event.id} as processed:`, updateError);
          errors.push(`Event ${event.id}: ${updateError.message}`);
        } else {
          processedCount++;
        }
        
        // ============================================================
        // AUTOMATISCHE AGENT GOAL CREATIE VOOR NIEUWE SOLLICITATIES
        // NOTE: Goal creatie is nu geconsolideerd in database trigger
        // trigger_single_welcome_intake_goal() maakt automatisch een
        // send_welcome_and_intake goal aan bij nieuwe sollicitaties.
        // Dit voorkomt dubbele emails en race conditions.
        // ============================================================
        if (event.event_type === 'application_created') {
          const eventData = event.event_data || {};
          const completenessScore = eventData.completeness_score || 0;
          const candidateName = eventData.extracted_data?.naam || eventData.extracted_data?.name;
          
          // Log alleen - goal wordt door database trigger aangemaakt
          console.log(`📋 Application event: completeness=${completenessScore}%, name=${candidateName}`);
          console.log(`⏭️ Goal creation handled by database trigger (trigger_single_welcome_intake_goal)`);
        }
        
        // ============================================================
        // PHASE 3: PROFESSIONAL CREATION ON APPROVAL
        // ============================================================
        if (event.event_type === 'application_approved_for_professional_creation') {
          const eventData = event.event_data || {};
          const applicationId = eventData.application_id;
          const candidateName = eventData.candidate_name;
          
          console.log(`🎓 [Phase 3] Processing professional creation for ${candidateName} (${applicationId})...`);
          
          if (applicationId) {
            try {
              // Call the create-professional-from-application edge function
              const { data: createResult, error: createError } = await supabase.functions.invoke(
                'create-professional-from-application',
                {
                  body: {
                    application_id: applicationId,
                    trigger_source: 'database_trigger'
                  }
                }
              );
              
              if (createError) {
                console.error(`❌ [Phase 3] Failed to create professional:`, createError);
                errors.push(`Professional creation failed for ${applicationId}: ${createError.message}`);
              } else if (createResult?.success) {
                console.log(`✅ [Phase 3] Professional created: ${createResult.professional_id} (${createResult.professional_name})`);
                
                if (createResult.documents_requested) {
                  console.log(`📄 [Phase 3] Document request goal created for: ${createResult.missing_documents?.join(', ')}`);
                }
              } else if (createResult?.error === 'already_converted') {
                console.log(`⏭️ [Phase 3] Application already converted to professional: ${createResult.professional_id}`);
              } else if (createResult?.error === 'duplicate_professional') {
                console.log(`⏭️ [Phase 3] Linked to existing professional: ${createResult.professional_id}`);
              } else {
                console.error(`❌ [Phase 3] Unexpected result:`, createResult);
                errors.push(`Professional creation returned: ${JSON.stringify(createResult)}`);
              }
            } catch (invokeError) {
              console.error(`❌ [Phase 3] Failed to invoke create-professional:`, invokeError);
              errors.push(`Invoke error: ${invokeError instanceof Error ? invokeError.message : 'Unknown'}`);
            }
          }
        }
      } catch (eventError) {
        console.error(`❌ Error processing event ${event.id}:`, eventError);
        errors.push(`Event ${event.id}: ${eventError instanceof Error ? eventError.message : 'Unknown error'}`);
      }
    }
    
    console.log(`✅ Processing complete: ${processedCount}/${events.length} events, ${knowledgeCreatedCount} knowledge items created`);
    
    // Log function call for dashboard monitoring
    try {
      await supabase.from('function_call_logs').insert({
        function_name: 'process-system-events',
        org_id: '550e8400-e29b-41d4-a716-446655440000',
        success: true,
        execution_time_ms: Date.now() - startTime,
        metadata: {
          processed: processedCount,
          total: events.length,
          knowledge_created: knowledgeCreatedCount,
          errors_count: errors.length
        }
      });
    } catch (logErr) {
      console.warn('⚠️ Failed to log function call:', logErr);
    }
    
    return new Response(JSON.stringify({
      processed: processedCount,
      total: events.length,
      knowledgeCreated: knowledgeCreatedCount,
      errors: errors.length > 0 ? errors : undefined
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('❌ Process system events error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Specialized analysis for evaluation events - extracts placement success patterns
async function analyzeEvaluationEvent(event: any, supabase: any, lovableApiKey: string): Promise<any> {
  const metadata = event.metadata || {};
  const eventData = event.event_data || {};
  
  const rating = eventData.rating;
  const wouldRehire = eventData.would_rehire;
  const matchScore = metadata.ai_match_score;
  const isSuccessful = metadata.is_successful_placement;
  const isFailed = metadata.is_failed_placement;
  const matchPredictedCorrectly = metadata.match_score_predicted_correctly;
  
  console.log(`📊 Analyzing evaluation: rating=${rating}, match_score=${matchScore}, success=${isSuccessful}`);
  
  // Build primary knowledge item about this placement
  const primaryKnowledge = {
    shouldCreateKnowledge: true,
    category: 'placement_success',
    key: `placement_evaluation_${metadata.client_name?.toLowerCase().replace(/\s+/g, '_') || 'unknown'}_${metadata.functie_niveau?.toLowerCase().replace(/\s+/g, '_') || 'unknown'}`,
    value: {
      rating,
      would_rehire: wouldRehire,
      ai_match_score: matchScore,
      match_prediction_accurate: matchPredictedCorrectly,
      professional_name: metadata.professional_name,
      client_name: metadata.client_name,
      sublocation_name: metadata.sublocation_name,
      functie_niveau: metadata.functie_niveau,
      werkvorm: metadata.werkvorm,
      duration_days: metadata.assignment_duration_days,
      success_status: isSuccessful ? 'successful' : (isFailed ? 'failed' : 'neutral'),
      correlation_delta: metadata.rating_vs_match_correlation
    },
    confidence: rating >= 4 ? 0.9 : (rating <= 2 ? 0.85 : 0.75),
    reasoning: `Plaatsing evaluatie: ${metadata.professional_name} bij ${metadata.client_name} (${rating}/5 sterren, ${wouldRehire ? 'zou opnieuw plaatsen' : 'zou niet opnieuw plaatsen'})`,
    role_tags: ['admin', 'manager', 'recruiter'],
    stability_score: 0.85,
    correlationKnowledge: [] as any[]
  };
  
  // Generate correlation knowledge if match_score available
  if (matchScore !== null && matchScore !== undefined) {
    // Correlation pattern knowledge
    primaryKnowledge.correlationKnowledge.push({
      category: 'matching_accuracy',
      key: `match_score_correlation_${matchScore >= 70 ? 'high' : (matchScore >= 50 ? 'medium' : 'low')}_score`,
      value: {
        match_score_range: matchScore >= 70 ? '70-100' : (matchScore >= 50 ? '50-69' : '0-49'),
        actual_rating: rating,
        expected_rating_range: matchScore >= 70 ? '4-5' : (matchScore >= 50 ? '3-4' : '1-3'),
        prediction_accurate: matchPredictedCorrectly,
        correlation_delta: metadata.rating_vs_match_correlation,
        insight: matchPredictedCorrectly 
          ? `Match score ${matchScore}% voorspelde rating ${rating}/5 correct`
          : `Match score ${matchScore}% voorspelde rating incorrect (werkelijk: ${rating}/5)`,
        functie_niveau: metadata.functie_niveau,
        werkvorm: metadata.werkvorm
      },
      confidence: matchPredictedCorrectly ? 0.9 : 0.7,
      stability_score: 0.75,
      role_tags: ['admin', 'manager']
    });
    
    // Success pattern by functie_niveau
    if (isSuccessful && metadata.functie_niveau) {
      primaryKnowledge.correlationKnowledge.push({
        category: 'success_patterns',
        key: `successful_placement_pattern_${metadata.functie_niveau.toLowerCase().replace(/\s+/g, '_')}`,
        value: {
          functie_niveau: metadata.functie_niveau,
          client_type: metadata.client_name,
          werkvorm: metadata.werkvorm,
          match_score: matchScore,
          rating: rating,
          duration_days: metadata.assignment_duration_days,
          factors: [
            matchScore >= 70 ? 'high_match_score' : null,
            metadata.assignment_duration_days > 30 ? 'long_duration' : null,
            wouldRehire ? 'would_rehire' : null
          ].filter(Boolean),
          insight: `Succesvolle plaatsing ${metadata.functie_niveau} met match score ${matchScore}% en rating ${rating}/5`
        },
        confidence: 0.85,
        stability_score: 0.8,
        role_tags: ['admin', 'manager', 'recruiter']
      });
    }
    
    // Failure pattern learning
    if (isFailed && metadata.functie_niveau) {
      primaryKnowledge.correlationKnowledge.push({
        category: 'improvement_areas',
        key: `placement_improvement_${metadata.functie_niveau.toLowerCase().replace(/\s+/g, '_')}_${metadata.client_name?.toLowerCase().replace(/\s+/g, '_') || 'unknown'}`,
        value: {
          functie_niveau: metadata.functie_niveau,
          client_name: metadata.client_name,
          werkvorm: metadata.werkvorm,
          match_score: matchScore,
          rating: rating,
          would_rehire: wouldRehire,
          potential_issues: [
            matchScore < 50 ? 'low_initial_match_score' : null,
            metadata.assignment_duration_days < 14 ? 'very_short_duration' : null,
            !wouldRehire ? 'would_not_rehire' : null,
            matchScore >= 70 && rating <= 2 ? 'match_score_overestimated' : null
          ].filter(Boolean),
          recommendation: matchScore >= 70 && rating <= 2 
            ? 'Matching algoritme overschatte fit - review sector/doelgroep weging'
            : 'Review kandidaat selectie criteria voor dit type plaatsing'
        },
        confidence: 0.8,
        stability_score: 0.7,
        role_tags: ['admin', 'manager']
      });
    }
  }
  
  // Use AI for additional insight extraction if there's feedback
  if (eventData.has_feedback && eventData.feedback_length > 50) {
    try {
      const aiInsight = await extractFeedbackInsights(event, lovableApiKey);
      if (aiInsight) {
        primaryKnowledge.correlationKnowledge.push(aiInsight);
      }
    } catch (e) {
      console.warn('⚠️ Failed to extract AI feedback insights:', e);
    }
  }
  
  return primaryKnowledge;
}

// Extract insights from feedback text using AI
async function extractFeedbackInsights(event: any, lovableApiKey: string): Promise<any | null> {
  const prompt = `Analyseer deze plaatsings-evaluatie feedback en extraheer actionable insights:

CONTEXT:
- Professional: ${event.metadata?.professional_name}
- Klant: ${event.metadata?.client_name}
- Functie: ${event.metadata?.functie_niveau}
- Rating: ${event.event_data?.rating}/5
- Zou opnieuw plaatsen: ${event.event_data?.would_rehire ? 'Ja' : 'Nee'}
- Match Score: ${event.metadata?.ai_match_score}%

Return ALLEEN een JSON object:
{
  "key_insight": "belangrijkste conclusie in 1 zin",
  "improvement_suggestion": "concrete verbetering voor matching",
  "success_factor": "wat ging goed" of null,
  "risk_factor": "wat ging minder" of null,
  "confidence": 0.0-1.0
}`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        category: 'feedback_insights',
        key: `feedback_insight_${event.metadata?.client_name?.toLowerCase().replace(/\s+/g, '_') || 'unknown'}`,
        value: {
          ...parsed,
          source_rating: event.event_data?.rating,
          functie_niveau: event.metadata?.functie_niveau,
          client_name: event.metadata?.client_name
        },
        confidence: parsed.confidence || 0.7,
        stability_score: 0.6,
        role_tags: ['admin', 'manager']
      };
    }
  } catch (e) {
    console.warn('⚠️ AI feedback analysis failed:', e);
  }
  
  return null;
}

// General AI analysis for other event types
async function analyzeEventWithAI(event: any, lovableApiKey: string): Promise<any> {
  const prompt = `Analyseer dit systeem event en bepaal of er kennis moet worden geleerd:

EVENT TYPE: ${event.event_type}
ENTITY TYPE: ${event.entity_type}
DATA: ${JSON.stringify(event.event_data, null, 2)}
METADATA: ${JSON.stringify(event.metadata, null, 2)}

ANALYSE:
1. Is dit een significante gebeurtenis waarvan geleerd moet worden?
2. Wat is het patroon of de inzicht?
3. Welke kennis moet worden opgeslagen?

Voorbeelden van wat WEL moet worden geleerd:
- Taak tijdig afgerond door een specifieke professional (team performance)
- Specifieke werkwijze of proces gevolgd (workflow patterns)
- Tijd besteed aan bepaald type taak (productivity insights)
- Consistent gedrag van een gebruiker (user patterns)
- Sollicitant succesvol door pipeline naar plaatsing (recruitment_pipeline)
- Kandidaat kwaliteit per bron (candidate_quality)
- Plaatsing succesvol afgerond voor organisatie (placement_success)
- Recruitment acties effectief uitgevoerd (recruitment_effectiveness)

Voorbeelden van wat NIET moet worden geleerd:
- Incidentele, eenmalige acties zonder patroon
- Simpele CRUD operaties zonder context
- Test data of oefeningen

Return ALLEEN een JSON object (geen andere tekst):
{
  "shouldCreateKnowledge": true/false,
  "category": "workflow_patterns" / "team_performance" / "task_history" / "productivity_insights" / "recruitment_pipeline" / "candidate_quality" / "placement_success" / "recruitment_effectiveness",
  "key": "beschrijvende_key_zoals_professional_X_completion_time",
  "value": { "detailed": "structured data object" },
  "confidence": 0.0-1.0,
  "reasoning": "Waarom dit belangrijk is om te leren",
  "role_tags": ["admin", "manager"] / null,
  "stability_score": 0.0-1.0
}`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error(`❌ AI analysis failed: ${response.status}`);
      return {
        shouldCreateKnowledge: false,
        reasoning: 'AI analysis failed'
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Parse JSON uit response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`🤖 AI analysis result: shouldCreate=${parsed.shouldCreateKnowledge}, confidence=${parsed.confidence}`);
      return parsed;
    }
    
    console.warn('⚠️ Failed to parse AI response, skipping knowledge creation');
    return {
      shouldCreateKnowledge: false,
      reasoning: 'Failed to parse AI response'
    };
  } catch (error) {
    console.error('❌ AI analysis error:', error);
    return {
      shouldCreateKnowledge: false,
      reasoning: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// ============================================================
// HR SPECIALIST SMART VALIDATION FUNCTIONS
// Note: isPlaceholderPhone is now imported from healthcare-mappings.ts
// ============================================================

/**
 * Generate missing info like an HR Specialist would
 * Detects placeholder phones, ZZP-specific requirements, and night/weekend availability
 */
function generateSmartMissingInfo(extractedData: Record<string, unknown>): string[] {
  const missing: string[] = [];
  
  // Basic required fields
  if (!extractedData.naam && !extractedData.full_name) missing.push('naam');
  if (!extractedData.functie_niveau) missing.push('functie_niveau');
  if (!extractedData.werkvorm) missing.push('werkvorm');
  if (!extractedData.regio) missing.push('regio');
  
  // 🧠 Smart phone validation - detect placeholders using centralized isPlaceholderPhone
  const phone = (extractedData.telefoonnummer || extractedData.telefoon) as string;
  if (!phone || isPlaceholderPhone(phone)) {
    missing.push('telefoonnummer');
    console.log(`🔍 HR Smart: Detected invalid/placeholder phone: "${phone}"`);
  }
  
  // 💼 ZZP-specific required fields (kritiek voor facturatie)
  // NOTE: uurtarief is OPTIONEEL - niet als missing markeren
  const werkvorm = extractedData.werkvorm as string;
  if (werkvorm === 'ZZP') {
    if (!extractedData.kvk_nummer) {
      missing.push('kvk_nummer');
      console.log('🔍 HR Smart: ZZP profile missing KvK-nummer');
    }
    if (!extractedData.btw_nummer) {
      missing.push('btw_nummer');
      console.log('🔍 HR Smart: ZZP profile missing BTW-nummer');
    }
    if (!extractedData.vog_date && !extractedData.vog) {
      missing.push('vog');
      console.log('🔍 HR Smart: ZZP profile missing VOG');
    }
  }
  
  // 🌙 Night/weekend availability (belangrijk voor zorg matching)
  if (extractedData.nachtdienst_bereid === null || extractedData.nachtdienst_bereid === undefined) {
    missing.push('nachtdienst_bereid');
  }
  if (extractedData.weekenddienst_bereid === null || extractedData.weekenddienst_bereid === undefined) {
    missing.push('weekenddienst_bereid');
  }
  
  return missing;
}
