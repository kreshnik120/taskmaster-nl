import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { getFullInstructions, detectRoleFromQuestion } from "../_shared/abczorg-instructions.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// SHA256 HASH HELPER FOR CACHE KEYS
// ============================================
async function sha256Hash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============================================
// RETRY HELPER WITH EXPONENTIAL BACKOFF
// ============================================
async function persistMessage(
  supabase: any,
  message: { user_id: string; org_id: string; conversation_id: string; role: string; content: string; metadata?: any },
  retries: number = 3
): Promise<{ success: boolean; messageId?: string }> {
  // ✅ NIEUWE STAP: Normaliseer content (trim whitespace voor consistent hashing)
  const normalizedMessage = {
    ...message,
    content: message.content.trim()
  };
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert(normalizedMessage)
      .select('id')
      .single();
    
    if (!error && data) {
      console.log(`✅ ${normalizedMessage.role} message persisted (attempt ${attempt}/${retries}), id: ${data.id}`);
      return { success: true, messageId: data.id };
    }
    
    // ✅ NIEUWE LOGICA: Check of het een duplicate constraint error is
    if (error?.code === '23505') { // PostgreSQL unique violation
      console.log(`ℹ️ ${normalizedMessage.role} message already exists (deduplicated), fetching existing ID...`);
      
      // Haal bestaande message ID op
      const { data: existing } = await supabase
        .from('chat_messages')
        .select('id')
        .eq('user_id', normalizedMessage.user_id)
        .eq('conversation_id', normalizedMessage.conversation_id)
        .eq('role', normalizedMessage.role)
        .eq('content', normalizedMessage.content)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (existing?.id) {
        console.log(`✅ Found existing message ID: ${existing.id}`);
        return { success: true, messageId: existing.id };
      }
      
      // Fallback zonder ID (edge case)
      console.warn(`⚠️ Duplicate detected but could not fetch existing ID`);
      return { success: true };
    }
    
    console.warn(`⚠️ Persist retry ${attempt}/${retries}:`, error);
    if (attempt < retries) {
      await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt - 1)));
    }
  }
  
  console.error(`❌ Failed to persist ${normalizedMessage.role} message after ${retries} attempts`);
  return { success: false };
}

// =============================================================================
// FASE 1: CONFIDENCE CALCULATION FUNCTION (MET CLIENTS DATA BOOST)
// =============================================================================
function calculateAnswerConfidence(
  knowledgeItems: any[],
  queryKeywords: string[],
  questionText: string,
  clientsContext: any[] = []
): { confidence: number; reasoning: string; gaps: string[] } {
  if (knowledgeItems.length === 0 && clientsContext.length === 0) {
    return {
      confidence: 0,
      reasoning: "Geen relevante bronnen gevonden in de knowledge base",
      gaps: ["Geen geldige bronnen beschikbaar voor deze vraag"]
    };
  }

  let score = 0;
  const gaps: string[] = [];
  const reasons: string[] = [];
  
  // ✅ NIEUWE SCORING: Bron-gebaseerd, geen keyword bias
  
  // 1. SOURCE QUALITY (0-40 punten)
  const sourceCount = knowledgeItems.length + clientsContext.length;
  const sourceScore = Math.min((sourceCount / 3) * 40, 40);
  score += sourceScore;
  
  if (sourceCount === 0) {
    gaps.push("❌ Geen bronnen gevonden");
  } else if (sourceCount === 1) {
    gaps.push("⚠️ Slechts 1 bron - niet gevalideerd");
    reasons.push(`1 bron beschikbaar`);
  } else {
    reasons.push(`${sourceCount} bronnen geraadpleegd`);
  }

  // 2. CONFIDENCE SCORE van bronnen (0-40 punten)
  const avgConfidence = knowledgeItems.length > 0 
    ? knowledgeItems.reduce((sum, kb) => sum + (kb.confidence_score || 0.5), 0) / knowledgeItems.length 
    : 0.75;
  const confidenceScore = avgConfidence * 40;
  score += confidenceScore;
  
  if (avgConfidence < 0.6) {
    gaps.push("⚠️ Lage betrouwbaarheid van bronnen");
  } else if (avgConfidence >= 0.8) {
    reasons.push(`Hoge bronbetrouwbaarheid (${(avgConfidence * 100).toFixed(0)}%)`);
  }

  // 3. RECENCY (0-10 punten)
  const now = Date.now();
  const avgAge = knowledgeItems.length > 0
    ? knowledgeItems.reduce((sum, kb) => {
        const age = (now - new Date(kb.updated_at || kb.created_at || now).getTime()) / (1000 * 60 * 60 * 24);
        return sum + age;
      }, 0) / knowledgeItems.length
    : 0;
  
  let recencyScore = 0;
  if (avgAge < 7) recencyScore = 10;
  else if (avgAge < 30) recencyScore = 7;
  else if (avgAge < 90) recencyScore = 4;
  
  score += recencyScore;
  if (avgAge > 90) {
    gaps.push("⚠️ Bronnen mogelijk verouderd (>90 dagen)");
  }

  // 4. CLIENTS DATA BOOST (0-10 punten)
  const clientsRelatedKeywords = ['tarief', 'prijs', 'kostprijs', 'contract', 'overeenkomst'];
  const isClientsQuery = queryKeywords.some(kw => 
    clientsRelatedKeywords.some(ct => kw.toLowerCase().includes(ct))
  );
  
  if (clientsContext.length > 0 && isClientsQuery) {
    score += 10;
    reasons.push(`📋 Relevante cliëntdata beschikbaar`);
  }

  // Convert to 0-1 scale (max 100 punten)
  const confidence = Math.min(score / 100, 1.0);
  
  return {
    confidence,
    reasoning: reasons.length > 0 ? reasons.join(', ') : `Confidence: ${(confidence * 100).toFixed(0)}%`,
    gaps: gaps.length > 0 ? gaps : []
  };
}

// Helper: Extract client name from knowledge item
function extractClientFromKnowledge(kb: any): string | null {
  // Check kb.value.client_name first (most direct)
  if (kb.value?.client_name) {
    const clientLower = kb.value.client_name.toLowerCase();
    if (clientLower.includes('swz') || clientLower.includes('stichting swz') || clientLower.includes('citozorg')) return 'swz';
    if (clientLower.includes('prisma')) return 'prisma';
    if (clientLower.includes('lunet')) return 'lunet';
    if (clientLower.includes('evb')) return 'evb';
  }
  
  // Check source (document names)
  if (kb.source) {
    const sourceLower = kb.source.toLowerCase();
    if (sourceLower.includes('swz') || sourceLower.includes('citozorg') || sourceLower.includes('stichting_swz')) return 'swz';
    if (sourceLower.includes('prisma')) return 'prisma';
    if (sourceLower.includes('lunet')) return 'lunet';
    if (sourceLower.includes('evb')) return 'evb';
  }
  
  // Check key
  const keyLower = kb.key.toLowerCase();
  if (keyLower.includes('swz') || keyLower.includes('stichting_swz') || keyLower.includes('citozorg')) return 'swz';
  if (keyLower.includes('prisma')) return 'prisma';
  if (keyLower.includes('lunet')) return 'lunet';
  if (keyLower.includes('evb')) return 'evb';
  
  // Check value (last resort)
  const valueStr = JSON.stringify(kb.value).toLowerCase();
  if (valueStr.includes('stichting swz') || valueStr.includes('citozorg') || valueStr.includes('swz')) return 'swz';
  if (valueStr.includes('prisma')) return 'prisma';
  if (valueStr.includes('lunet')) return 'lunet';
  if (valueStr.includes('evb')) return 'evb';
  
  return null;
}

// PHASE 2: Get suggested source documents for conflicting knowledge items
async function getSuggestedDocuments(
  conflictedKnowledgeIds: string[],
  supabase: any
): Promise<{ document_name: string; kb_count: number }[]> {
  const { data: knowledgeItems } = await supabase
    .from('ai_knowledge_base')
    .select('source, key')
    .in('id', conflictedKnowledgeIds)
    .is('deleted_at', null);
  
  // Extract and count source documents
  const documentCounts: { [doc: string]: number } = {};
  
  knowledgeItems?.forEach((kb: any) => {
    if (kb.source?.startsWith('document:')) {
      const docName = kb.source.replace('document:', '');
      documentCounts[docName] = (documentCounts[docName] || 0) + 1;
    }
  });
  
  return Object.entries(documentCounts)
    .map(([name, count]) => ({ document_name: name, kb_count: count }))
    .sort((a, b) => b.kb_count - a.kb_count); // Most relevant first
}

// SPRINT 2: Semantic duplicate detection with AI
async function findSemanticDuplicates(
  newItem: { key: string; value: any; category: string },
  existingItems: any[],
  lovableApiKey: string
): Promise<Array<{ id: string; similarity: number; reason: string }>> {
  // Filter op zelfde category (performance optimization)
  const sameCategoryItems = existingItems.filter(item => item.category === newItem.category);
  
  if (sameCategoryItems.length === 0) return [];
  
  const semanticMatches: Array<{ id: string; similarity: number; reason: string }> = [];
  
  // Check elk item met AI
  for (const existingItem of sameCategoryItems) {
    const prompt = `Vergelijk deze twee knowledge items semantisch:

NIEUW ITEM:
Key: ${newItem.key}
Value: ${JSON.stringify(newItem.value, null, 2)}

BESTAAND ITEM:
Key: ${existingItem.key}
Value: ${JSON.stringify(existingItem.value, null, 2)}

Analyseer:
1. Betekenen ze hetzelfde? (synoniemen, taalvariaties)
2. Is het dezelfde informatie in andere woorden?
3. Overlappen ze qua context (client, contractperiode)?

Return ALLEEN een JSON object:
{
  "similarity": 0.0-1.0,
  "reason": "kort waarom wel/niet duplicate"
}`;

    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) continue;

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      
      // Parse JSON uit response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.similarity >= 0.85) {
          semanticMatches.push({
            id: existingItem.id,
            similarity: parsed.similarity,
            reason: parsed.reason || "Semantisch vergelijkbaar"
          });
        }
      }
    } catch (error) {
      console.error(`[SEMANTIC] Error comparing with ${existingItem.id}:`, error);
    }
  }
  
  return semanticMatches.sort((a, b) => b.similarity - a.similarity);
}

// SPRINT 2: Deep conflict analysis with 3-tier system
async function deepConflictAnalysis(
  items: any[],
  lovableApiKey: string
): Promise<{
  recommended_id: string | null;
  confidence: number;
  tier: 'auto_resolve' | 'suggestion' | 'preserve_all';
  reason: string;
  actions?: { item_id: string; action: 'keep' | 'delete' }[];
}> {
  // STEP 1: Heuristic checks (basis score)
  let baseConfidence = 0;
  let heuristicWinner: string | null = null;
  
  const scores = items.map(item => {
    let score = 0;
    
    // Recency check
    const ageInDays = (Date.now() - new Date(item.created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (ageInDays < 7) score += 30;
    else if (ageInDays < 30) score += 20;
    else if (ageInDays > 90) score -= 10; // Penalty voor oude items
    
    // Confidence score
    score += (item.confidence_score || 0.5) * 40;
    
    // Usage count
    if ((item.usage_count || 0) > 10) score += 20;
    else if ((item.usage_count || 0) > 0) score += 10;
    
    // Source
    if (item.source?.includes('document')) score += 10;
    
    return { id: item.id, key: item.key, score, item };
  });
  
  scores.sort((a, b) => b.score - a.score);
  heuristicWinner = scores[0].id;
  baseConfidence = scores[0].score / 100;
  
  // STEP 2: AI Deep Analysis
  const prompt = `Analyseer dit kennisconflict:

ITEMS:
${items.map((item, i) => `
Item ${i + 1} (ID: ${item.id}):
- Key: ${item.key}
- Value: ${JSON.stringify(item.value, null, 2)}
- Created: ${new Date(item.created_at).toLocaleDateString('nl-NL')}
- Usage: ${item.usage_count || 0} keer gebruikt
- Confidence: ${((item.confidence_score || 0.5) * 100).toFixed(0)}%
- Source: ${item.source || 'unknown'}
`).join('\n')}

VRAAG: Welk item is het meest betrouwbaar? Waarom?

Return ALLEEN een JSON object:
{
  "winner_id": "uuid of null als onduidelijk",
  "confidence": 0.0-1.0,
  "reasoning": "Max 2 zinnen waarom dit de beste keuze is",
  "should_delete_others": true/false
}`;

  let aiConfidence = 0;
  let aiWinnerId: string | null = null;
  let aiReasoning = "";
  
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        aiWinnerId = parsed.winner_id;
        aiConfidence = parsed.confidence || 0;
        aiReasoning = parsed.reasoning || "";
      }
    }
  } catch (error) {
    console.error('[DEEP-ANALYSIS] AI call failed:', error);
  }
  
  // STEP 3: Combine scores
  const finalConfidence = (baseConfidence * 0.4) + (aiConfidence * 0.6);
  const winnerId = aiWinnerId || heuristicWinner;
  
  // STEP 4: Tier assignment
  let tier: 'auto_resolve' | 'suggestion' | 'preserve_all';
  if (finalConfidence >= 0.95) {
    tier = 'auto_resolve';
  } else if (finalConfidence >= 0.70) {
    tier = 'suggestion';
  } else {
    tier = 'preserve_all';
  }
  
  // Build reason
  const reasons = [];
  if (aiReasoning) reasons.push(aiReasoning);
  const winnerItem = items.find(i => i.id === winnerId);
  if (winnerItem) {
    const ageInDays = (Date.now() - new Date(winnerItem.created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (ageInDays < 7) reasons.push('nieuwste data');
    if ((winnerItem.usage_count || 0) > 5) reasons.push('meest gebruikt');
  }
  
  const finalReason = reasons.length > 0 
    ? reasons.join(', ') 
    : `Analyse score: ${(finalConfidence * 100).toFixed(0)}%`;
  
  // Build actions
  const actions = winnerId 
    ? items.map(item => ({
        item_id: item.id,
        action: (item.id === winnerId ? 'keep' : 'delete') as 'keep' | 'delete'
      }))
    : [];
  
  return {
    recommended_id: winnerId,
    confidence: finalConfidence,
    tier,
    reason: finalReason,
    actions
  };
}

// Detect conflicts between knowledge items with SPRINT 2 deep analysis
async function detectKnowledgeConflicts(
  knowledgeBase: any[],
  supabase: any,
  orgId: string,
  lovableApiKey: string
): Promise<void> {
  // Group by category + client
  const grouped: { [key: string]: any[] } = {};
  
  knowledgeBase.forEach(kb => {
    const client = extractClientFromKnowledge(kb) || 'unknown';
    const groupKey = `${kb.category}_${client}`;
    
    if (!grouped[groupKey]) grouped[groupKey] = [];
    grouped[groupKey].push(kb);
  });
  
  // Check for conflicts within each group
  for (const [groupKey, items] of Object.entries(grouped)) {
    if (items.length > 1) {
      // Extract tariff values for comparison
      const tariffs = items.map(kb => {
        const val = kb.value;
        return val?.werkdagen_dagtarief?.all_in_tarief || 
               val?.overdag || 
               val?.helpende_niveau_2?.overdag ||
               val?.verzorgende_ig_niveau_3?.overdag ||
               JSON.stringify(val);
      }).filter(Boolean);
      
      const uniqueTariffs = [...new Set(tariffs.map(t => typeof t === 'number' ? t : JSON.stringify(t)))];
      
      if (uniqueTariffs.length > 1) {
        console.error(`🚨 CONFLICT DETECTED in ${groupKey}:`, uniqueTariffs);
        
        // Get suggested documents
        const suggestedDocs = await getSuggestedDocuments(
          items.map(kb => kb.id),
          supabase
        );
        
        // SPRINT 2: Deep conflict analysis with 3-tier system
        const aiRecommendation = await deepConflictAnalysis(items, lovableApiKey);
        
        // TIER 1: Auto-resolve (≥95% confidence)
        if (aiRecommendation.tier === 'auto_resolve' && aiRecommendation.recommended_id) {
          console.log(`🤖 AUTO-RESOLVE (Tier 1): ${groupKey} (${(aiRecommendation.confidence * 100).toFixed(0)}%)`);
          
          const losers = items.filter(kb => kb.id !== aiRecommendation.recommended_id);
          const loserIds = losers.map(kb => kb.id);
          
          await supabase
            .from('ai_knowledge_base')
            .update({
              deleted_at: new Date().toISOString(),
              deleted_by: 'AI_AUTO_RESOLVE',
              deletion_reason: {
                conflict_group: groupKey,
                reason: aiRecommendation.reason,
                winner_id: aiRecommendation.recommended_id,
                confidence: aiRecommendation.confidence,
                tier: 'auto_resolve',
                deleted_items: losers.map(kb => ({
                  id: kb.id,
                  key: kb.key,
                  value: kb.value,
                  confidence_score: kb.confidence_score
                }))
              }
            })
            .in('id', loserIds);
          
          await supabase.from('business_intelligence').insert({
            org_id: orgId,
            intelligence_type: 'auto_cleanup',
            type: 'knowledge',
            severity: 'low',
            priority: 'low',
            title: `Auto-resolved: ${groupKey}`,
            description: `AI heeft ${losers.length} item(s) verwijderd (${(aiRecommendation.confidence * 100).toFixed(0)}% zekerheid)`,
            data: {
              winner_id: aiRecommendation.recommended_id,
              deleted_ids: loserIds,
              reason: aiRecommendation.reason,
              restore_available_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            },
            impact_score: 0.3
          });
          
          continue;
        }
        
        // TIER 2: Suggestion (70-94% confidence)
        if (aiRecommendation.tier === 'suggestion') {
          console.log(`💡 SUGGESTION (Tier 2): ${groupKey} (${(aiRecommendation.confidence * 100).toFixed(0)}%)`);
          
          await supabase.from('business_intelligence').insert({
            org_id: orgId,
            intelligence_type: 'ai_suggestion',
            type: 'knowledge',
            severity: 'medium',
            priority: 'medium',
            title: `AI Suggestie: ${groupKey}`,
            description: `AI stelt voor om ${aiRecommendation.actions?.filter(a => a.action === 'delete').length} item(s) te verwijderen (${(aiRecommendation.confidence * 100).toFixed(0)}% zekerheid)`,
            data: {
              recommended_actions: aiRecommendation.actions,
              reasoning: aiRecommendation.reason,
              confidence: aiRecommendation.confidence,
              requires_approval: true,
              conflicting_items: items.map(kb => ({
                id: kb.id,
                key: kb.key,
                value: kb.value,
                confidence: kb.confidence_score,
                usage_count: kb.usage_count,
                created_at: kb.created_at
              })),
              suggested_documents: suggestedDocs
            },
            impact_score: 0.6
          });
          
          continue;
        }
        
        // TIER 3: Preserve all (<70% confidence)
        if (aiRecommendation.tier === 'preserve_all') {
          console.log(`⚠️ PRESERVE ALL (Tier 3): ${groupKey} (${(aiRecommendation.confidence * 100).toFixed(0)}%)`);
          
          // Mark all items as needing review
          await supabase
            .from('ai_knowledge_base')
            .update({ needs_review: true })
            .in('id', items.map(kb => kb.id));
          
          await supabase.from('business_intelligence').insert({
            org_id: orgId,
            intelligence_type: 'data_quality',
            type: 'data_quality',
            severity: 'high',
            priority: 'high',
            title: `Complex conflict: ${groupKey}`,
            description: `AI kan niet met zekerheid bepalen welk item correct is (${(aiRecommendation.confidence * 100).toFixed(0)}%). Menselijke review vereist.`,
            data: {
              conflicting_items: items.map(kb => ({
                id: kb.id,
                key: kb.key,
                value: kb.value,
                confidence: kb.confidence_score,
                usage_count: kb.usage_count,
                created_at: kb.created_at
              })),
              unique_values: uniqueTariffs,
              ai_reasoning: aiRecommendation.reason,
              suggested_documents: suggestedDocs
            },
            impact_score: 0.9
          });
        }
      }
    }
  }
}

// Track knowledge usage based on AI response content with CLIENT VALIDATION
async function trackKnowledgeUsage(
  responseText: string,
  availableKnowledge: any[],
  supabase: any,
  userId: string,
  messages: any[]
): Promise<string[]> {
  const usedKnowledgeIds: string[] = [];
  const responseLower = responseText.toLowerCase();
  
  // Extract client name from user's question
  const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';
  const clientMentions = ['swz', 'stichting swz', 'prisma', 'lunet', 'evb'];
  let questionClient: string | null = null;
  for (const client of clientMentions) {
    if (lastMessage.includes(client)) {
      questionClient = client.includes('stichting') ? 'swz' : client;
      break;
    }
  }
  
  for (const kb of availableKnowledge) {
    let matchScore = 0;
    
    // Match 1: Direct key match in response
    const keyLower = kb.key.toLowerCase();
    if (responseLower.includes(keyLower.replace(/_/g, ' ')) || responseLower.includes(keyLower)) {
      matchScore += 3;
    }
    
    // Match 2: Category context match
    const categoryKeywords = kb.category.toLowerCase().split('_');
    categoryKeywords.forEach((keyword: string) => {
      if (keyword.length > 3 && responseLower.includes(keyword)) {
        matchScore += 1;
      }
    });
    
    // Match 3: Value content match (for string values or object fields)
    if (kb.value) {
      const valueStr = typeof kb.value === 'string' 
        ? kb.value.toLowerCase() 
        : JSON.stringify(kb.value).toLowerCase();
      
      // Extract meaningful words (>3 chars) from value
      const valueWords = valueStr.match(/\b\w{4,}\b/g) || [];
      valueWords.slice(0, 5).forEach((word: string) => {
        if (responseLower.includes(word)) {
          matchScore += 2;
        }
      });
    }
    
    // If sufficient match, validate client context
    if (matchScore >= 3) {
      const kbClient = extractClientFromKnowledge(kb);
      
      // CLIENT VALIDATION - Only penalize EXPLICIT mismatches
      // Accept knowledge if:
      // - kbClient is null (general knowledge)
      // - questionClient is null (no client filter in question)
      // - Both match
      // Only skip if BOTH are known AND different
      if (questionClient && kbClient && kbClient !== questionClient) {
        console.warn(`⚠️ Explicit client mismatch: KB="${kbClient}", Question="${questionClient}"`);
        
        // Lower confidence and flag for review
        await supabase
          .from('ai_knowledge_base')
          .update({
            confidence_score: Math.max(0.3, (kb.confidence_score || 0.5) - 0.3),
            needs_review: true,
            validation_failures: (kb.validation_failures || 0) + 1,
            last_validation_error: `Client mismatch: KB claims ${kbClient}, but used for ${questionClient} query`
          })
          .eq('id', kb.id);
        
        // Create business intelligence alert
        await supabase.from('business_intelligence').insert({
          org_id: kb.org_id,
          intelligence_type: 'knowledge_quality',
          type: 'knowledge',
          severity: 'high',
          priority: 'high',
          title: `Kennisfout: ${kb.key}`,
          description: `Knowledge item "${kb.key}" bevat ${kbClient} data maar werd gebruikt voor ${questionClient} vraag`,
          data: { 
            kb_id: kb.id, 
            expected_client: questionClient, 
            actual_client: kbClient,
            response_snippet: responseText.substring(0, 200)
          },
          impact_score: 0.8
        });
        
        continue; // Skip usage increment for explicit mismatches
      }
      
      // Valid usage: accept and track
      // This now includes:
      // - General knowledge (kbClient = null)
      // - Client-specific knowledge matching the question
      // - Knowledge used in non-client-specific questions
      usedKnowledgeIds.push(kb.id);
      
      const { error } = await supabase
        .from('ai_knowledge_base')
        .update({
          usage_count: (kb.usage_count || 0) + 1,
          last_used_at: new Date().toISOString()
        })
        .eq('id', kb.id);
      
      if (error) {
        console.error(`Failed to update knowledge ${kb.id}:`, error);
      }
    }
  }
  
  if (usedKnowledgeIds.length > 0) {
    console.log(`🎯 Knowledge used in response: ${usedKnowledgeIds.length} items`, usedKnowledgeIds.slice(0, 5));
  }
  
  return usedKnowledgeIds;
}

serve(async (req) => {
  const startTime = Date.now(); // Track execution time
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    const { messages, conversation_id } = requestBody; // ✅ Ontvang conversation_id
    
    // ✅ CRITICAL: Validate conversation_id BEFORE any processing or stream creation
    if (!conversation_id) {
      console.error('❌ Missing conversation_id in request body');
      return new Response(
        JSON.stringify({ 
          error: 'conversation_id is vereist. Start een nieuwe chat door de pagina te verversen.' 
        }), 
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    console.log(`🔑 Processing conversation: ${conversation_id}`);
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      return new Response(JSON.stringify({ error: 'Authenticatie vereist' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract the access token from the Authorization header
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase environment variables');
      throw new Error('Server configuration error');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { 
        headers: { 
          Authorization: authHeader 
        } 
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    });

    // Service role client for background persistence (bypasses RLS)
    const supabaseServiceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      }
    );

    // Get user context with timeout protection (5 seconds)
    let authResult;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Auth timeout')), 5000)
      );
      
      const authPromise = supabaseClient.auth.getUser(accessToken);
      
      authResult = await Promise.race([
        authPromise,
        timeoutPromise
      ]);
    } catch (authTimeoutError) {
      console.error('⚠️ Auth timeout na 5 seconden - mogelijk netwerk probleem');
      return new Response(
        JSON.stringify({ 
          error: 'Authenticatie timeout - probeer het opnieuw',
          details: 'De authenticatie service reageert niet binnen 5 seconden'
        }), 
        {
          status: 408, // Request Timeout
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: { user }, error: userError } = authResult;
    
    if (userError) {
      console.error('Auth error:', userError);
      return new Response(JSON.stringify({ error: 'Authenticatie gefaald' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (!user) {
      console.error('No user found');
      return new Response(JSON.stringify({ error: 'Gebruiker niet gevonden' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('User authenticated:', user.id);

    // ⏱️ Performance tracking
    const perfTimers = {
      start: Date.now(),
      embedding: 0,
      semanticSearch: 0,
      aiCall: 0,
      total: 0
    };

    // Get user's org_id
    const { data: userOrg } = await supabaseClient
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user.id)
      .single();
    
    const userOrgId = userOrg?.org_id;
    
    if (!userOrgId) {
      console.error('❌ No organization associated with user');
      return new Response(JSON.stringify({ error: 'Geen organisatie gekoppeld aan dit account' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============================================
    // FASE 1: CACHE LOOKUP (SHA256 HASH)
    // ============================================
    const lastUserMessageForCache = messages[messages.length - 1]?.content || '';
    const cacheKey = await sha256Hash(`${userOrgId}|${lastUserMessageForCache.trim()}`);
    
    const { data: cachedResponse } = await supabaseServiceClient
      .from('ai_response_cache')
      .select('response, knowledge_ids, hit_count, id')
      .eq('org_id', userOrgId)
      .eq('question_hash', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    
    if (cachedResponse) {
      console.log('💰 CACHE HIT - Token saving!');
      
      // Update hit count
      await supabaseServiceClient
        .from('ai_response_cache')
        .update({ hit_count: cachedResponse.hit_count + 1 })
        .eq('id', cachedResponse.id);
      
      // Return cached response immediately
      return new Response(cachedResponse.response, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' }
      });
    }
    
    console.log('⚡ CACHE MISS - Calling AI');

    // Smart context filtering - alleen relevante data
    const [
      tasksResult,
      profileResult,
      clientsResult,
      projectsResult,
      subtasksResult,
      commentsResult,
      timeEntriesResult,
      activeTimeResult,
      chatHistoryResult,
      deletedTasksResult,
      knowledgeBaseResult,
      learningEventsResult,
      businessIntelResult,
      conversationContextResult
    ] = await Promise.all([
      // Top 10 recente actieve taken
      supabaseClient
        .from('tasks')
        .select('id, title, priority, due_at, start_at, next_action, description, estimate_min, completed_at, revenue_impact_eur, transition_related, client_id, assignee_id')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10),
      
      // User profile
      supabaseClient
        .from('profiles')
        .select('name, email')
        .eq('id', user.id)
        .single(),
      
      // Top 10 clients
      supabaseClient
        .from('clients')
        .select('id, name, company, tier, weekly_hours, revenue_per_hour')
        .limit(10),
      
      // Top 5 projecten
      supabaseClient
        .from('projects')
        .select('id, name, description')
        .limit(5),
      
      // Top 10 actieve subtaken
      supabaseClient
        .from('subtasks')
        .select('id, title, status, due_at, task_id')
        .eq('status', 'active')
        .limit(10),
      
      // 5 meest recente comments
      supabaseClient
        .from('comments')
        .select('body, created_at, task_id')
        .order('created_at', { ascending: false })
        .limit(5),
      
      // Time entries laatste 7 dagen (max 20)
      supabaseClient
        .from('time_entries')
        .select('duration_min, start, task_id')
        .gte('start', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .limit(20),
      
      // Check for active time tracking
      supabaseClient
        .from('time_entries')
        .select('task_id, start')
        .is('end', null)
        .eq('user_id', user.id)
        .maybeSingle(),
      
      // 5 meest recente chat berichten - ALLEEN als conversation_id bestaat
      supabaseClient
        .from('chat_messages')
        .select('role, content, created_at')
        .eq('user_id', user.id)
        .eq('conversation_id', conversation_id || '__NEVER_MATCH__') // ✅ Fallback naar unmatchable ID
        .order('created_at', { ascending: false })
        .limit(5),
      
      // Count deleted tasks for context awareness
      supabaseClient
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .not('deleted_at', 'is', null),
      
      // Top 10 kennis items
      supabaseClient
        .from('ai_knowledge_base')
        .select('*')
        .eq('user_id', user.id)
        .order('confidence_score', { ascending: false })
        .order('usage_count', { ascending: false })
        .limit(10),
      
      // 5 meest recente learning events
      supabaseClient
        .from('ai_learning_events')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5),
      
      // Top 5 business intelligence insights
      userOrgId ? supabaseClient
        .from('business_intelligence')
        .select('*')
        .eq('org_id', userOrgId)
        .eq('status', 'active')
        .order('impact_score', { ascending: false })
        .limit(5) : Promise.resolve({ data: [], error: null }),
      
      // 3 meest recente conversatie contexten
      supabaseClient
        .from('conversation_context')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3)
    ]);

    const tasks = tasksResult.data;
    const profile = profileResult.data;
    const clients = clientsResult.data;
    const projects = projectsResult.data;
    const subtasks = subtasksResult.data;
    const recentComments = commentsResult.data;
    const timeEntries = timeEntriesResult.data;
    const activeTimeEntry = activeTimeResult.data;
    const chatHistory = chatHistoryResult.data;
    const deletedTasksCount = deletedTasksResult.count || 0;
    const knowledgeBase = knowledgeBaseResult.data || [];
    const learningEvents = learningEventsResult.data || [];
    const businessIntel = businessIntelResult.data || [];
    const conversationContext = conversationContextResult.data || [];

    // Analyze patterns and build rich context
    const activeTasks = tasks?.filter(t => !t.completed_at) || [];
    const completedTasks = tasks?.filter(t => t.completed_at) || [];
    const overdueTasks = activeTasks.filter(t => t.due_at && new Date(t.due_at) < new Date());
    const highPriorityTasks = activeTasks.filter(t => t.priority === 'HIGH' || t.priority === 'CRITICAL');
    const revenueImpactTasks = activeTasks.filter(t => t.revenue_impact_eur && t.revenue_impact_eur > 0);
    
    // 🤖 FASE 3: Smart Context Builder - Gebruik Meta-Orchestrator categorieën
    const lastUserMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';
    const messageKeywords = lastUserMessage.split(' ').filter((w: string) => w.length > 3); // Voor confidence calc
    
    console.log('🤖 Smart Context Builder: Zoek relevante categorieën...');
    
    // Detect user's role from the question for role-based knowledge filtering
    const detectedRole = detectRoleFromQuestion(lastUserMessage);
    
    // 🎯 CLIENT-VRAAG DETECTIE
    const isClientQuestion = /\b(klant|client|opdrachtgever|customer|organisatie)\b/i.test(lastUserMessage);
    
    // 🛡️ ORG-PROFILE VRAAG DETECTIE & GUARDRAIL (UITGEBREID)
    const isOrgProfileQuestion = /(kvk|kvk-nummer|kvk nummer|kamer van koophandel|wat voor (organisatie|bedrijf|type)|bedrijfstype|diensten|domein|domeinnaam|abczorg|citozorg|bemiddeling|zorginstelling)/i.test(lastUserMessage);
    let guardrailTriggered = false;
    let answerSource = 'ai_knowledge_base';
    let orgProfileUsed = false;
    
    // Haal relevante AI categorieën op via Meta-Orchestrator
    const { data: relevantCategories } = await supabaseClient
      .rpc('get_relevant_categories', { 
        user_question: lastUserMessage,
        org_id_param: userOrgId 
      });

    console.log(`📂 Gevonden categorieën: ${relevantCategories?.length || 0}`);

    // FASE 2: Graph Traversal Helper Function (Neural Brain)
    async function expandViaRelationships(coreItems: any[], maxDepth = 2) {
      if (coreItems.length === 0) return coreItems;
      
      let expanded = [...coreItems];
      let currentIds = coreItems.map((i: any) => i.id);
      
      for (let depth = 0; depth < maxDepth; depth++) {
        // Fetch relationships where source is one of our current items
        const { data: connectedRels } = await supabaseClient
          .from('knowledge_relationships')
          .select(`
            id, 
            target_knowledge_id, 
            relationship_type, 
            confidence_score,
            usage_count
          `)
          .in('source_knowledge_id', currentIds)
          .gte('usage_count', 3)
          .order('usage_count', { ascending: false })
          .limit(20);
        
        if (!connectedRels || connectedRels.length === 0) break;
        
        // Fetch the actual target knowledge items
        const targetIds = connectedRels.map((r: any) => r.target_knowledge_id);
        const { data: targetItems } = await supabaseClient
          .from('ai_knowledge_base')
          .select('id, category, key, value, confidence_score, usage_count, source, created_at, role_tags, valid_from, valid_to')
          .in('id', targetIds)
          .is('deleted_at', null);
        
        if (!targetItems || targetItems.length === 0) break;
        
        // Filter out items we already have
        const newItems = targetItems.filter((t: any) => 
          !expanded.some((e: any) => e.id === t.id)
        );
        
        if (newItems.length === 0) break;
        
        expanded.push(...newItems);
        currentIds = newItems.map((i: any) => i.id);
        
        console.log(`🔗 Graph depth ${depth + 1}: Added ${newItems.length} related items via neural connections`);
      }
      
      return expanded;
    }

    let fullKnowledgeBase: any[] = [];
    let semanticKnowledge: any[] = [];

    if (relevantCategories && relevantCategories.length > 0) {
      // Haal ALLE items uit relevante categorieën (geen limit!)
      const categoryNames = relevantCategories.map((c: any) => c.category_name);
      
      const { data: categoryItems } = await supabaseClient
        .from('ai_knowledge_base')
        .select('id, category, key, value, confidence_score, usage_count, source, created_at, updated_at, role_tags, valid_from, valid_to, validation_status')
        .eq('org_id', userOrgId)
        .eq('validation_status', 'verified')
        .is('deleted_at', null)
        .in('category', categoryNames)
        .order('confidence_score', { ascending: false })
        .order('updated_at', { ascending: false });

      if (categoryItems) {
        // 🛡️ FASE 5: OPTIMIZED RETRIEVAL RANKING
        // Split org_profile vs rest
        const orgProfileItems = categoryItems.filter((item: any) => item.category === 'org_profile');
        const otherItems = categoryItems.filter((item: any) => item.category !== 'org_profile');
        
        console.log(`🏢 Org-profile items: ${orgProfileItems.length}`);
        console.log(`📚 Other items: ${otherItems.length}`);
        
        // Sort each group independently
        orgProfileItems.sort((a: any, b: any) => {
          if (a.confidence_score !== b.confidence_score) {
            return (b.confidence_score || 0) - (a.confidence_score || 0);
          }
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
        
        otherItems.sort((a: any, b: any) => {
          if (a.confidence_score !== b.confidence_score) {
            return (b.confidence_score || 0) - (a.confidence_score || 0);
          }
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
        
        // Recombine: org_profile items FIRST
        const maxContextItems = 15;
        fullKnowledgeBase = [
          ...orgProfileItems,
          ...otherItems.slice(0, Math.max(0, maxContextItems - orgProfileItems.length))
        ];
        
        console.log(`✅ Smart Context: ${fullKnowledgeBase.length} items (${orgProfileItems.length} org-profiles) uit ${categoryNames.length} categorieën`);
        
        // FASE 2: Expand via relationships (Neural Graph Traversal)
        fullKnowledgeBase = await expandViaRelationships(fullKnowledgeBase, 2);
        console.log(`🧠 After neural graph expansion: ${fullKnowledgeBase.length} total items`);
      }
    }

    // Fallback: Als geen categorieën gevonden, gebruik standaard query met verhoogd limit
    if (fullKnowledgeBase.length === 0) {
      console.log('⚠️ Geen categorieën gevonden, fallback naar standaard query (300 items)...');
      const { data: fallbackKnowledge } = await supabaseClient
        .from('ai_knowledge_base')
        .select('id, category, key, value, confidence_score, usage_count, source, created_at, updated_at, role_tags, valid_from, valid_to, validation_status')
        .eq('org_id', userOrgId)
        .eq('validation_status', 'verified')
        .is('deleted_at', null)
        .gte('confidence_score', 0.3)
        .order('usage_count', { ascending: false })
        .order('confidence_score', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(300);

      if (fallbackKnowledge) {
        // 🛡️ FASE 5: OPTIMIZED RETRIEVAL RANKING (fallback)
        const orgProfileItems = fallbackKnowledge.filter((item: any) => item.category === 'org_profile');
        const otherItems = fallbackKnowledge.filter((item: any) => item.category !== 'org_profile');
        
        orgProfileItems.sort((a: any, b: any) => {
          if (a.confidence_score !== b.confidence_score) {
            return (b.confidence_score || 0) - (a.confidence_score || 0);
          }
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
        
        otherItems.sort((a: any, b: any) => {
          if (a.confidence_score !== b.confidence_score) {
            return (b.confidence_score || 0) - (a.confidence_score || 0);
          }
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
        
        const maxContextItems = 300;
        fullKnowledgeBase = [
          ...orgProfileItems,
          ...otherItems.slice(0, Math.max(0, maxContextItems - orgProfileItems.length))
        ];
        
        console.log(`✅ Fallback: ${fullKnowledgeBase.length} items (${orgProfileItems.length} org-profiles)`);
      }
    }
    
    // 🎯 MERGE SEMANTIC + CATEGORY RESULTS
    if (semanticKnowledge.length > 0) {
      // Deduplicate: semantic results hebben voorrang
      const existingIds = new Set(fullKnowledgeBase.map((kb: any) => kb.id));
      const newSemanticItems = semanticKnowledge.filter((kb: any) => !existingIds.has(kb.id));
      
      // Voeg nieuwe semantic items toe aan het begin (hoogste prioriteit)
      fullKnowledgeBase = [...semanticKnowledge, ...fullKnowledgeBase];
      
      console.log(`🎯 Final knowledge base: ${fullKnowledgeBase.length} items (${semanticKnowledge.length} from semantic search, ${fullKnowledgeBase.length - semanticKnowledge.length} from categories)`);
    } else {
      console.log(`📚 Using category-based search only: ${fullKnowledgeBase.length} items`);
    }

    // FASE 1: Track which relationships were used (Synaptic Reinforcement)
    if (fullKnowledgeBase.length > 0) {
      const relevantIds = fullKnowledgeBase.map((i: any) => i.id);
      
      // Fetch relationships that involve any of our knowledge items (with current usage_count)
      const { data: usedRelationships } = await supabaseClient
        .from('knowledge_relationships')
        .select('id, usage_count')
        .or(`source_knowledge_id.in.(${relevantIds.join(',')}),target_knowledge_id.in.(${relevantIds.join(',')})`)
        .limit(100);
      
      if (usedRelationships && usedRelationships.length > 0) {
        // Update each relationship with incremented usage_count
        const updatePromises = usedRelationships.map((rel: any) => 
          supabaseClient
            .from('knowledge_relationships')
            .update({ 
              usage_count: (rel.usage_count || 0) + 1,
              last_used_at: new Date().toISOString()
            })
            .eq('id', rel.id)
        );
        
        await Promise.all(updatePromises);
        console.log(`✅ Strengthened ${usedRelationships.length} synaptic connections`);
      }
    }
    
    // Get API Keys for AI operations
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }
    
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    
    // 🧠 SEMANTIC SEARCH: Generate embedding and find relevant knowledge
    if (OPENAI_API_KEY && lastUserMessage.length > 0) {
      console.log('🧠 Generating embedding for semantic search...');
      
      try {
        const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: lastUserMessage,
          }),
        });

        if (embeddingResponse.ok) {
          const embeddingData = await embeddingResponse.json();
          const queryEmbedding = embeddingData.data[0].embedding;
          
          console.log('✅ Embedding generated, calling match_knowledge...');
          
          perfTimers.embedding = Date.now() - perfTimers.start;
          console.log(`⏱️ Embedding generated in ${perfTimers.embedding}ms`);
          
          // Call match_knowledge function with validation filter
          const { data: semanticMatches, error: matchError } = await supabaseClient
            .rpc('match_knowledge', {
              query_embedding: queryEmbedding,
              match_threshold: 0.75,  // Verhoogd voor betere kwaliteit
              match_count: 20,  // Verlaagd voor snelheid
              filter_org_id: userOrgId,
              filter_role_tags: [detectedRole],
              filter_jurisdiction: 'NL',
              require_verified: true  // ✨ NIEUW - alleen verified items voor betere kwaliteit
            });

          if (matchError) {
            console.error('❌ match_knowledge error:', matchError);
          } else if (semanticMatches && semanticMatches.length > 0) {
            semanticKnowledge = semanticMatches.map((m: any) => ({
              id: m.knowledge_id,
              category: m.category,
              key: m.key,
              value: m.value,
              confidence_score: m.confidence_score,
              similarity: m.similarity,
              role_tags: m.role_tags,
              valid_from: m.valid_from,
              valid_to: m.valid_to,
              usage_count: 0,
              source: 'semantic_search',
              created_at: new Date().toISOString()
            }));
            
            perfTimers.semanticSearch = Date.now() - perfTimers.start - perfTimers.embedding;
            console.log(`✅ Found ${semanticKnowledge.length} items via semantic search in ${perfTimers.semanticSearch}ms`);
            console.log(`   Top 3 similarities: ${semanticMatches.slice(0,3).map((m: any) => m.similarity.toFixed(3)).join(', ')}`);
          }
        } else {
          console.log('⚠️ Embedding generation failed:', await embeddingResponse.text());
        }
      } catch (error) {
        console.error('❌ Semantic search error:', error);
      }
    } else {
      console.log('⚠️ OPENAI_API_KEY not configured or empty message - falling back to category-based search only');
    }
    
    // PHASE 1.5: Detect knowledge conflicts before using (with SPRINT 2 deep analysis)
    await detectKnowledgeConflicts(fullKnowledgeBase, supabaseClient, userOrgId, LOVABLE_API_KEY);
    
    // Organize knowledge by category for structured presentation
    const knowledgeByCategory: { [key: string]: any[] } = {};
    fullKnowledgeBase.forEach((kb: any) => {
      if (!knowledgeByCategory[kb.category]) {
        knowledgeByCategory[kb.category] = [];
      }
      knowledgeByCategory[kb.category].push(kb);
    });
    
    // Format knowledge base for AI consumption
    const formatKnowledgeBase = () => {
      if (fullKnowledgeBase.length === 0) return "Geen kennis beschikbaar.";
      
      let formatted = "";
      const categoryLabels: { [key: string]: string } = {
        bedrijfsgegevens: "📋 BEDRIJFSGEGEVENS",
        tarieven: "💰 TARIEVEN & PRIJZEN",
        contracten: "📝 CONTRACTEN & AFSPRAKEN",
        processen: "⚙️ PROCESSEN & WORKFLOWS",
        compliance: "✅ COMPLIANCE & REGELGEVING",
        zzp_vereisten: "👤 ZZP VEREISTEN",
        user_preference: "⭐ GEBRUIKER VOORKEUREN",
        business_rule: "📏 BEDRIJFSREGELS",
        workflow_pattern: "🔄 WORKFLOW PATRONEN",
        decision_context: "🎯 BESLISSING CONTEXT"
      };
      
      // Priority order for categories
      const priorityCategories = [
        "contracten", "tarieven", "zzp_vereisten", "compliance", 
        "processen", "bedrijfsgegevens", "user_preference", "business_rule", 
        "workflow_pattern", "decision_context"
      ];
      
      priorityCategories.forEach(category => {
        if (knowledgeByCategory[category] && knowledgeByCategory[category].length > 0) {
          formatted += `\n${categoryLabels[category] || category.toUpperCase()}:\n`;
          knowledgeByCategory[category].forEach((kb: any) => {
            const value = typeof kb.value === 'string' ? kb.value : JSON.stringify(kb.value, null, 2);
            formatted += `  • [ID: ${kb.id}] ${kb.key}: ${value}`;
            if (kb.confidence_score) formatted += ` [Zekerheid: ${(kb.confidence_score * 100).toFixed(0)}%]`;
            if (kb.source) formatted += ` [Bron: ${kb.source}]`;
            formatted += `\n`;
          });
        }
      });
      
      return formatted;
    };
    
    // Analyze knowledge base for user preferences and patterns (keep for backward compatibility)
    const userPreferences = fullKnowledgeBase.filter((kb: any) => kb.category === 'user_preference');
    const businessRules = fullKnowledgeBase.filter((kb: any) => kb.category === 'business_rule');
    const workflowPatterns = fullKnowledgeBase.filter((kb: any) => kb.category === 'workflow_pattern');
    const decisionContexts = fullKnowledgeBase.filter((kb: any) => kb.category === 'decision_context');
    
    // Analyze learning events for patterns
    const successfulPatterns = learningEvents.filter((le: any) => le.outcome === 'success' && le.learning_score > 0.7);
    const rejectedSuggestions = learningEvents.filter((le: any) => le.event_type === 'suggestion_rejected');
    const acceptedSuggestions = learningEvents.filter((le: any) => le.event_type === 'suggestion_accepted');
    
    // Calculate workload metrics
    const totalTimeThisWeek = timeEntries?.reduce((sum, e) => sum + (e.duration_min || 0), 0) || 0;
    const avgTasksPerDay = activeTasks.length / 7;
    
    // Client insights
    const clientMap = new Map(clients?.map(c => [c.id, c]) || []);
    const tasksWithClients = activeTasks.filter(t => t.client_id);
    
    // Compacte context summary
    const contextSummary = `
GEBRUIKER: ${profile?.name || 'Gebruiker'}

STATUS:
- Actief: ${activeTasks.length} | Afgerond: ${completedTasks.length} | Verlopen: ${overdueTasks.length}
${activeTimeEntry ? `🟢 Bezig: Taak ${activeTimeEntry.task_id}` : ''}

CLIENTS (${clients?.length || 0}):
${clients?.map(c => `${c.company}: ${c.weekly_hours || 0}h/week, €${c.revenue_per_hour || 0}/u`).join(' | ') || 'Geen'}

TOP TAKEN:
${activeTasks.slice(0, 5).map((t, i) => `${i + 1}. [${t.priority}] ${t.title}${t.due_at ? ` (${new Date(t.due_at).toLocaleDateString('nl-NL')})` : ''}`).join('\n')}

KENNIS: ${fullKnowledgeBase.length} items | INSIGHTS: ${businessIntel.length}
`;

    // Get current Dutch date/time
    const dutchDateTime = new Date().toLocaleString('nl-NL', { 
      timeZone: 'Europe/Amsterdam',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const dutchDate = new Date().toLocaleDateString('nl-NL', {
      timeZone: 'Europe/Amsterdam',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });

    // Extract key facts from conversation history
    const extractKeyFacts = (history: any[]): string | null => {
      if (!history || history.length === 0) return null;
      
      const facts: string[] = [];
      const recentMessages = [...history].reverse().slice(0, 10);
      
      recentMessages.forEach(msg => {
        if (msg.role === 'user') {
          const content = msg.content.toLowerCase();
          
          // Detect preferences
          if (content.includes('mijn voorkeur') || content.includes('ik wil altijd') || content.includes('standaard')) {
            facts.push(`👤 Voorkeur: ${msg.content.substring(0, 150)}`);
          }
          
          // Detect context switches (client/project names)
          if (content.includes('klant') || content.includes('client')) {
            const clientMatch = msg.content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/);
            if (clientMatch) {
              facts.push(`🏢 Context: Bezig met ${clientMatch[0]}`);
            }
          }
          
          // Detect important facts
          if (content.includes('belangrijk') || content.includes('let op') || content.includes('onthoud')) {
            facts.push(`⚠️ ${msg.content.substring(0, 150)}`);
          }
        }
      });
      
      const uniqueFacts = [...new Set(facts)].slice(0, 5);
      return uniqueFacts.length > 0 ? uniqueFacts.join('\n') : null;
    };

    const keyFacts = extractKeyFacts(chatHistory || []);
    const conversationSummary = keyFacts 
      ? `\n📋 BELANGRIJKE CONTEXT UIT EERDERE GESPREKKEN:\n${keyFacts}\n`
      : '';

    // ✅ STAP 3: Haal org_profiles op voor ground truth context
    const { data: orgProfiles } = await supabaseClient
      .from('org_profiles')
      .select('*')
      .eq('org_id', userOrgId);
    
    // 🛡️ FASE 4: UITGEBREIDE ORG-PROFILE GUARDRAIL
    if (isOrgProfileQuestion && orgProfiles && orgProfiles.length > 0) {
      console.log('🛡️ Org-profile guardrail activated:', { question: lastUserMessage });
      guardrailTriggered = true;
      answerSource = 'org_profile';
      orgProfileUsed = true;
      
      // Detect wat wordt gevraagd
      const askingKvK = /(kvk|kamer van koophandel)/i.test(lastUserMessage);
      const askingType = /(type|soort|organisatie|bedrijf)/i.test(lastUserMessage);
      const askingDomain = /(domein|domeinnaam|website)/i.test(lastUserMessage);
      const askingServices = /(diensten|service|wat doen|wat doet)/i.test(lastUserMessage);
      
      // Detecteer welke organisatie
      const askingABC = /abczorg/i.test(lastUserMessage);
      const askingCito = /citozorg/i.test(lastUserMessage);
      
      // Build targeted answer
      let guardrailAnswer = '';
      
      const orgsToAnswer = askingABC ? orgProfiles.filter((p: any) => /abc/i.test(p.brand_name)) :
                            askingCito ? orgProfiles.filter((p: any) => /cito/i.test(p.brand_name)) :
                            orgProfiles;
      
      orgsToAnswer.forEach((profile: any) => {
        guardrailAnswer += `\n\n**${profile.brand_name}:**\n`;
        
        if (askingKvK || !askingType && !askingDomain && !askingServices) {
          guardrailAnswer += `- **KvK-nummer:** ${profile.kvk_number}\n`;
        }
        
        if (askingType || !askingKvK && !askingDomain && !askingServices) {
          guardrailAnswer += `- **Bedrijfstype:** ${profile.business_type || 'Niet gespecificeerd'}\n`;
        }
        
        if (askingDomain) {
          guardrailAnswer += `- **Domein:** ${profile.primary_domain || 'Niet gespecificeerd'}\n`;
        }
        
        if (askingServices) {
          const services = profile.services || [];
          const excluded = profile.excluded_services || [];
          guardrailAnswer += `- **Diensten:** ${services.length > 0 ? services.join(', ') : 'Niet gespecificeerd'}\n`;
          if (excluded.length > 0) {
            guardrailAnswer += `- **NIET geleverd:** ${excluded.join(', ')}\n`;
          }
        }
      });
      
      guardrailAnswer += `\n\n_Bron: Geverifieerde organisatiegegevens uit org_profiles_`;
      
      // Log guardrail event
      await supabaseServiceClient.from('ai_learning_events').insert({
        org_id: userOrgId,
        user_id: user.id,
        event_type: 'guardrail_org_profile',
        context: { 
          question: lastUserMessage, 
          detected_aspects: { askingKvK, askingType, askingDomain, askingServices }
        },
        outcome: 'direct_answer_from_org_profile',
        ai_response: { answer: guardrailAnswer.trim() },
        learning_score: 1.0
      });
      
      // Return direct answer immediately
      return new Response(
        JSON.stringify({
          response: guardrailAnswer.trim(),
          used_knowledge: orgProfiles.map((p: any) => ({
            id: `org_profile_${p.id}`,
            category: 'org_profile',
            key: `company_facts:${p.brand_name}`,
            confidence_score: 0.98
          })),
          guardrail_triggered: true,
          answer_source: 'org_profile',
          org_profile_used: true
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }
    
    // 🏢 FASE 6: GROUND TRUTH CONTEXT VERSTERKING
    let orgProfileGroundTruth = '';
    if (orgProfiles && orgProfiles.length > 0) {
      orgProfileGroundTruth = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      orgProfileGroundTruth += `🏢 **GEVERIFIEERDE ORGANISATIEGEGEVENS (100% BETROUWBAAR - GROUND TRUTH)**\n`;
      orgProfileGroundTruth += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      
      orgProfiles.forEach((profile: any) => {
        orgProfileGroundTruth += `**${profile.brand_name}:**\n`;
        orgProfileGroundTruth += `├─ **KvK-nummer:** ${profile.kvk_number}\n`;
        orgProfileGroundTruth += `├─ **Bedrijfstype:** ${profile.business_type || 'Niet gespecificeerd'}\n`;
        orgProfileGroundTruth += `├─ **Primair domein:** ${profile.primary_domain || 'Niet gespecificeerd'}\n`;
        
        const services = profile.services || [];
        const excluded = profile.excluded_services || [];
        
        if (services.length > 0) {
          orgProfileGroundTruth += `├─ **Diensten:** ${services.join(', ')}\n`;
        }
        if (excluded.length > 0) {
          orgProfileGroundTruth += `├─ **NIET geleverd:** ${excluded.join(', ')}\n`;
        }
        
        orgProfileGroundTruth += `└─ **Status:** Geverifieerd door Admin\n\n`;
      });
      
      orgProfileGroundTruth += `⚠️ **KRITIEKE INSTRUCTIE:**\n`;
      orgProfileGroundTruth += `- Deze gegevens zijn 100% accuraat en mogen NOOIT worden tegengesproken.\n`;
      orgProfileGroundTruth += `- Gebruik ALTIJD deze informatie bij vragen over deze organisaties.\n`;
      orgProfileGroundTruth += `- Als iets NIET in bovenstaande lijst staat, zeg: "Niet beschikbaar in onze gegevens, graag bevestigen."\n`;
      orgProfileGroundTruth += `- SPECULEER NOOIT over ontbrekende data.\n`;
      orgProfileGroundTruth += `- Verwar NOOIT met externe organisaties zoals "Cito Zorg Thuiszorg B.V." (niet onze organisatie).\n`;
      orgProfileGroundTruth += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }

    // ⚡ NIEUWE SYSTEM PROMPT: Integreert ABCzorg instructies + org_profiles GROUND TRUTH + bestaande context
    const systemPrompt = `${getFullInstructions(detectedRole)}${orgProfileGroundTruth}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🕐 HUIDIGE NEDERLANDSE TIJD:
Vandaag is: ${dutchDateTime}
Je werkt in Nederlandse tijd (Europe/Amsterdam, CET/CEST tijdzone).
${conversationSummary}

${keyFacts ? `📋 BELANGRIJKE CONTEXT UIT EERDERE GESPREKKEN:\n${keyFacts}\n` : ''}

HUIDIGE CONTEXT:
${contextSummary}

📋 **KLANTEN DATABASE** (${clients?.length || 0} actieve klanten):
${clients?.map(c => `- **${c.name}** (${c.company}) - Tier ${c.tier}${c.weekly_hours ? `, ${c.weekly_hours}u/week` : ''}${c.revenue_per_hour ? `, €${c.revenue_per_hour}/u` : ''}`).join('\n') || 'Geen klanten'}

📚 KENNISBANK (${fullKnowledgeBase.length} relevante items voor jouw rol: ${detectedRole}):
${formatKnowledgeBase()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 SPECIFIEKE TOOLS & ACTIES (gebruik actief):

📊 KRITIEKE TRACKING TOOL:
- **declare_knowledge_usage**: 🎯 ROEP ALTIJD AAN NA ELKE ANTWOORD DIE GEBASEERD IS OP KENNISBANK DATA
  → Geef ALLE knowledge base item UUIDs door die je hebt gebruikt in je antwoord
  → Dit zorgt voor accurate tracking en verbetert mijn leerloop
  → Format: declare_knowledge_usage(knowledge_ids: ["uuid1", "uuid2", ...])
  → Voorbeeld: Als je antwoord geeft over "vakantiedagen" en je gebruikt knowledge items met IDs abc-123 en def-456, roep dan aan: declare_knowledge_usage(knowledge_ids: ["abc-123", "def-456"])

⚡ SLIMME ANTWOORDLENGTE:
- STANDAARD: 2-3 korte zinnen (efficiënt & direct)
- UITGEBREID: Bij trigger woorden zoals "uitgebreid", "volledig", "gedetailleerd", "leg uit", "vertel meer" → geef complete, gestructureerde uitleg
- KORT: Bij "samenvatting", "kort", "overzicht" → extra beknopt

🔄 BULK IMPORT INSTRUCTIES:
- Bij 1-3 taken: gebruik create_task per taak
- Bij 4+ taken: gebruik create_multiple_tasks voor efficiency
- Bij gestructureerde data (Excel/tabel): parse alle taken en gebruik create_multiple_tasks
- Let op datum formats: Nederlandse datums (DD-MM-YYYY) converteren naar ISO 8601
- Let op prioriteit mapping: Laag→LOW, Middel→MEDIUM, Hoog→HIGH

🖼️ AFBEELDING PROCESSING:
- Je kunt afbeeldingen analyseren en begrijpen (multimodal support)
- Bij spreadsheets/tabellen met taken: automatisch extracten en create_multiple_tasks gebruiken
- Bij screenshots van planning/kalendars: taken identificeren en importeren

🎯 98% CONFIDENCE AI STRATEGIE (ITERATIEVE INTELLIGENTIE):
=============================================================

⚡ KRITIEKE ANTWOORD VOLGORDE - ALTIJD DEZE STAPPEN:

STAP 1: GEEF EERST JE VOLLEDIGE ANTWOORD
   → Beantwoord de vraag VOLLEDIG met alle relevante informatie
   → Gebruik concrete data uit de kennisbank
   → Wees uitgebreid en specifiek

STAP 2: GEBRUIK VERIFY_ANSWER_CONFIDENCE TOOL (INTERN)
   → Dit is een INTERNE validatie check
   → Gebruiker ziet de tool output NIET
   → Tool output wordt automatisch omgezet naar confidence badge

STAP 3: CONFIDENCE BADGE WORDT AUTOMATISCH TOEGEVOEGD
   → Het systeem voegt de badge toe aan je antwoord
   → Jij hoeft dit NIET handmatig te doen

⚠️ BELANGRIJK - DOE NOOIT DIT:
   ❌ FOUT: Alleen verify_answer_confidence tool aanroepen zonder antwoord
   ✅ CORRECT: Eerst volledig antwoord geven, dan verify_answer_confidence

Format antwoord ALTIJD zo:
"[Hier komt je VOLLEDIGE, UITGEBREIDE antwoord met alle details]

[Dan volgt de confidence badge automatisch]"

🚫 WANNEER GEEN TAAK AANMAKEN:
- INFORMATIEVRAGEN: "welke", "hoeveel", "wanneer", "waar", "hoe", "waarom", "wat zijn", "wie", "toon", "laat zien", "geef overzicht"
  → Antwoord met beschikbare data, GEEN taak aanmaken

✅ WANNEER WEL TAAK AANMAKEN:
- TAAK-VERZOEKEN: "maak een taak", "plan", "herinner mij", "zet op de lijst", "voeg toe", "ik moet", "help mij met"
  → Dan WEL taak aanmaken met create_task tool

📋 DATUM FORMAT: ISO 8601 (YYYY-MM-DDTHH:mm:ss+02:00)
📋 PRIORITY: LOW, MEDIUM, HIGH, CRITICAL (default: MEDIUM)

🎯 ACTIEF LEREN - GEBRUIK DEZE TOOLS PROACTIEF:
================================================
⚠️ BELANGRIJK: Gebruik de save_knowledge, log_learning_event en create_business_intelligence tools ACTIEF tijdens elke conversatie!

WANNEER GEBRUIK JE SAVE_KNOWLEDGE:
✅ Gebruiker geeft voorkeur aan (bijv. "Ik werk het liefst 's ochtends")
   → Sla meteen op: category: "user_preference", key: "work_time_preference", value: {"preferred": "morning"}
✅ Bedrijfsregel wordt duidelijk (bijv. "ABCzorg taken zijn altijd HIGH priority")
   → Sla meteen op: category: "business_rule", key: "abczorg_priority_rule", value: {"client": "ABCzorg", "default_priority": "HIGH"}
✅ Herhalend patroon detecteren (bijv. gebruiker maakt elke maandag planning)
   → Sla meteen op: category: "workflow_pattern", key: "weekly_planning_ritual", value: {"day": "monday", "action": "create_weekly_plan"}

WANNEER GEBRUIK JE LOG_LEARNING_EVENT:
✅ Gebruiker accepteert/wijst suggestie af
✅ Je detecteert een patroon
✅ Gebruiker geeft expliciete feedback

WANNEER GEBRUIK JE CREATE_BUSINESS_INTELLIGENCE:
✅ Je ziet een bottleneck (bijv. te veel HIGH priority taken tegelijk)
✅ Je detecteert optimalisatiemogelijkheid
✅ Je ziet een workflow patroon

💡 DOE DIT AUTOMATISCH - de gebruiker hoeft niet te vragen!
⚡ JE BENT NIET MEER STATELESS - JE HEBT EEN VOLLEDIG GEHEUGEN & JE MOET HET ACTIEF GEBRUIKEN!

Gebruik deze rijke context om intelligente, context-aware antwoorden te geven die echt helpen met productiviteit en taakbeheer!`;

    // LOVABLE_API_KEY already fetched earlier for conflict detection
    // Just verify it's still available
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Define available tools for the AI
    const tools = [
      {
        type: "function",
        function: {
          name: "create_task",
          description: "Maak een nieuwe taak aan in het systeem",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Titel van de taak" },
              description: { type: "string", description: "Gedetailleerde beschrijving van de taak" },
              priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], description: "Prioriteit van de taak (gebruik LOW, MEDIUM, HIGH, of CRITICAL)" },
              due_at: { type: "string", description: "Deadline in ISO 8601 formaat (optioneel)" },
              start_at: { type: "string", description: "Start datum/tijd in ISO 8601 formaat (optioneel, maar aanbevolen voor kalender zichtbaarheid)" },
              project_id: { type: "string", description: "UUID van het project (optioneel)" },
              client_id: { type: "string", description: "UUID van de client (optioneel)" },
              assignee_id: { type: "string", description: "UUID van de toegewezen persoon (optioneel)" }
            },
            required: ["title"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_task",
          description: "Wijzig een bestaande taak",
          parameters: {
            type: "object",
            properties: {
              task_id: { type: "string", description: "UUID van de taak om te wijzigen" },
              title: { type: "string", description: "Nieuwe titel (optioneel)" },
              description: { type: "string", description: "Nieuwe beschrijving (optioneel)" },
              priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], description: "Nieuwe prioriteit (gebruik LOW, MEDIUM, HIGH, of CRITICAL)" },
              start_at: { type: "string", description: "Nieuwe start datum/tijd in ISO 8601 formaat (optioneel)" },
              due_at: { type: "string", description: "Nieuwe deadline in ISO 8601 formaat (optioneel)" },
              completed_at: { type: "string", description: "Completion timestamp in ISO 8601 formaat om taak af te ronden (optioneel)" }
            },
            required: ["task_id"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "add_comment",
          description: "Voeg een comment toe aan een taak",
          parameters: {
            type: "object",
            properties: {
              task_id: { type: "string", description: "UUID van de taak" },
              body: { type: "string", description: "Inhoud van de comment" }
            },
            required: ["task_id", "body"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "save_knowledge",
          description: "Sla belangrijke informatie op in de permanente knowledge base (gebruiker voorkeuren, bedrijfsregels, workflow patronen, beslissingen)",
          parameters: {
            type: "object",
            properties: {
              category: { 
                type: "string", 
                enum: ["user_preference", "business_rule", "workflow_pattern", "decision_context"],
                description: "Type kennis: user_preference (hoe gebruiker werkt), business_rule (policies/procedures), workflow_pattern (herhalende processen), decision_context (waarom iets besloten is)" 
              },
              key: { type: "string", description: "Unieke sleutel voor deze kennis (bijv. 'preferred_work_hours', 'client_x_sla')" },
              value: { type: "object", description: "De data om op te slaan (JSON object)" },
              confidence_score: { type: "number", description: "Hoe zeker ben je van deze informatie (0.0 - 1.0)", minimum: 0, maximum: 1 },
              source: { type: "string", description: "Waar komt deze kennis vandaan (bijv. 'user_stated', 'observed_pattern')" }
            },
            required: ["category", "key", "value"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "log_learning_event",
          description: "Log een leer gebeurtenis voor pattern recognition en verbetering",
          parameters: {
            type: "object",
            properties: {
              event_type: { 
                type: "string",
                enum: ["feedback_positive", "feedback_negative", "task_completed", "pattern_detected", "suggestion_accepted", "suggestion_rejected"],
                description: "Type leer gebeurtenis"
              },
              context: { type: "object", description: "Alle relevante context (wat gebeurde er)" },
              ai_response: { type: "object", description: "Wat had je gesuggereerd/gezegd (optioneel)" },
              user_action: { type: "object", description: "Wat deed de gebruiker (optioneel)" },
              outcome: { type: "string", enum: ["success", "failure", "partial"], description: "Resultaat" },
              learning_score: { type: "number", description: "Hoe waardevol is deze learning (0.0 - 1.0)", minimum: 0, maximum: 1 }
            },
            required: ["event_type", "context", "outcome"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_business_intelligence",
          description: "Creëer een business intelligence insight. Gebruik dit ALTIJD bij knowledge gaps om de gap te loggen. NA het loggen van een knowledge_gap, gebruik DIRECT auto_harvest_knowledge.",
          parameters: {
            type: "object",
            properties: {
              intelligence_type: {
                type: "string",
                enum: ["workflow_pattern", "productivity_insight", "bottleneck", "optimization_opportunity", "knowledge_gap", "market_insight"],
                description: "Type insight. Gebruik 'knowledge_gap' wanneer ontbrekende kennis wordt gedetecteerd."
              },
              title: { type: "string", description: "Korte titel van het insight" },
              description: { type: "string", description: "Gedetailleerde beschrijving" },
              data: { type: "object", description: "Alle ondersteunende data" },
              priority: { type: "string", enum: ["low", "medium", "high"], description: "Prioriteit van dit insight" },
              impact_score: { type: "number", description: "Verwachte impact (0.0 - 10.0)", minimum: 0, maximum: 10 }
            },
            required: ["intelligence_type", "title", "data"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "verify_answer_confidence",
          description: "🔒 INTERN VALIDATION TOOL - Gebruik dit NADAT je het volledige antwoord hebt gegeven. Deze tool berekent je confidence (0-100%) voor interne validatie. Gebruiker ziet ALLEEN je antwoord content, NIET de raw tool output. De confidence badge wordt automatisch toegevoegd door het systeem.",
          strict: false,
          parameters: {
            type: "object",
            properties: {
              used_knowledge_ids: {
                type: "array",
                items: { type: "string" },
                description: "UUIDs van kennisitems gebruikt in antwoord"
              },
              answer_summary: {
                type: "string",
                description: "Korte samenvatting van je antwoord (max 200 chars)"
              },
              key_claims: {
                type: "array",
                items: { type: "string" },
                description: "Belangrijkste feiten/claims in je antwoord"
              }
            },
            required: ["used_knowledge_ids", "answer_summary"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "auto_harvest_knowledge",
          description: "Trigger de Auto-Knowledge-Harvester om online informatie te verzamelen. Gebruik dit DIRECT na het detecteren van een knowledge gap.",
          parameters: {
            type: "object",
            properties: {
              search_topics: {
                type: "array",
                items: { type: "string" },
                description: "Specifieke zoektermen (bijv. 'Kwintes CAO GGZ salarisschalen 2025')"
              },
              reason: {
                type: "string",
                description: "Waarom wordt harvester getriggerd?"
              },
              wait_for_results: {
                type: "boolean",
                description: "Wacht op harvester resultaten? (max 20 sec)",
                default: true
              }
            },
            required: ["search_topics", "reason"]
          }
        }
      },
        {
          type: "function",
          function: {
            name: "search_professionals",
            description: "⚠️ ALLEEN VOOR PERSONEN/ZZP'ERS - NIET VOOR KLANTEN/ORGANISATIES! Zoek beschikbare ZZP'ers/professionals/freelancers op basis van filters. Gebruik dit wanneer gebruiker vraagt om NAMEN VAN ZZP'ERS, WIE BESCHIKBAAR IS, of een lijst van PROFESSIONALS/PERSONEN wil. 🚫 GEBRUIK NOOIT voor vragen over 'klanten', 'klantenoverzicht', 'opdrachtgevers', 'organisaties' - dit zijn GEEN professionals maar client bedrijven!",
            parameters: {
            type: "object",
            properties: {
              functie: {
                type: "string",
                enum: ["Helpende 2", "VIG", "VP3", "VP4", "HBO-V"],
                description: "Functie niveau van de professional"
              },
              regio: {
                type: "string",
                description: "Regio/locatie waar professional moet werken (bijv. Eindhoven, Nijmegen)"
              },
              vanaf_datum: {
                type: "string",
                description: "Start datum (YYYY-MM-DD) voor beschikbaarheid check"
              },
              tot_datum: {
                type: "string",
                description: "Eind datum (YYYY-MM-DD) voor beschikbaarheid check"
              },
              aantal: {
                type: "number",
                description: "Aantal professionals om te tonen",
                default: 10
              }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_multiple_tasks",
          description: "Maak meerdere taken tegelijk aan in bulk. Gebruik dit wanneer de gebruiker een lijst van taken uploadt of meerdere taken tegelijk wil aanmaken (bijv. uit een Excel/tabel). Voor 1-3 taken gebruik create_task, voor 4+ taken gebruik create_multiple_tasks.",
          parameters: {
            type: "object",
            properties: {
              tasks: {
                type: "array",
                description: "Array van taken om aan te maken",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "Titel van de taak" },
                    description: { type: "string", description: "Gedetailleerde beschrijving" },
                    priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], description: "Prioriteit (LOW, MEDIUM, HIGH, of CRITICAL)" },
                    due_at: { type: "string", description: "Deadline in ISO 8601 formaat (optioneel)" },
                    start_at: { type: "string", description: "Start datum/tijd in ISO 8601 formaat (optioneel)" },
                    project_id: { type: "string", description: "UUID van het project (optioneel)" },
                    client_id: { type: "string", description: "UUID van de client (optioneel)" },
                    assignee_id: { type: "string", description: "UUID van de toegewezen persoon (optioneel)" }
                  },
                  required: ["title"]
                }
              }
            },
            required: ["tasks"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "declare_knowledge_usage",
          description: "🎯 CRITICAL: Declareer expliciet welke knowledge base items je hebt gebruikt in je antwoord. Dit zorgt voor accurate tracking en verbetert mijn learning loop. Roep deze tool ALTIJD aan nadat je een antwoord hebt gegeven dat gebaseerd is op de kennisbank.",
          parameters: {
            type: "object",
            properties: {
              knowledge_ids: {
                type: "array",
                description: "Array van knowledge base item UUIDs die je hebt gebruikt in je antwoord",
                items: {
                  type: "string",
                  description: "UUID van een knowledge base item"
                }
              },
              usage_context: {
                type: "string",
                description: "Korte beschrijving van hoe je deze kennis hebt toegepast (optioneel)"
              }
            },
            required: ["knowledge_ids"]
          }
        }
      }
    ];

    // Call Lovable AI Gateway for streaming with tool support
    const AI_TIMEOUT_MS = 30000; // 30 seconden max
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error('⚠️ AI call timeout after 30s');
      controller.abort();
    }, AI_TIMEOUT_MS);

    let response;
    try {
      const aiCallStart = Date.now();
      response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
          ],
          tools: tools,
          stream: true,
        }),
      });
      
      clearTimeout(timeoutId);
      console.log(`⏱️ AI Gateway responded in ${Date.now() - aiCallStart}ms`);
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('🚨 AI Gateway timeout - returning fallback response');
        return new Response(
          JSON.stringify({
            error: 'timeout',
            message: 'Het AI systeem reageert momenteel traag. Probeer het over enkele minuten opnieuw.',
            fallback: true
          }),
          {
            status: 504,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      
      throw error;
    }

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit bereikt, probeer het later opnieuw.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits op. Neem contact op met support.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      return new Response(JSON.stringify({ error: 'AI gateway fout' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Process the streaming response and handle tool calls
    const reader = response.body?.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        let toolCalls: any[] = [];
        let fullResponse = ""; // Collect complete AI response for usage tracking
        let declaredKnowledgeIds: string[] = []; // 🎯 NEW: Store explicitly declared knowledge IDs
        
        // 🔄 Retry loop state tracking
        let needsRetryWithNewKnowledge = false;
        let newKnowledgeMessage = "";
        let retryCount = 0;
        const MAX_RETRIES = 3;
        let noResultsAfterHarvest = false; // Track if harvester found 0 results after waiting
        
        try {
          while (true) {
            const { done, value } = await reader!.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.trim() || line.startsWith(":")) continue;
              if (!line.startsWith("data: ")) continue;

              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;

                // Handle tool calls
                if (delta?.tool_calls) {
                  for (const toolCall of delta.tool_calls) {
                    if (!toolCalls[toolCall.index]) {
                      toolCalls[toolCall.index] = {
                        id: toolCall.id,
                        type: toolCall.type,
                        function: { name: toolCall.function?.name || "", arguments: "" }
                      };
                    }
                    if (toolCall.function?.arguments) {
                      toolCalls[toolCall.index].function.arguments += toolCall.function.arguments;
                    }
                  }
                }

                // Stream regular content
                if (delta?.content) {
                  fullResponse += delta.content; // Collect for usage tracking
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                }

                // Check if we're done and have tool calls to execute
                if (parsed.choices?.[0]?.finish_reason === "tool_calls" && toolCalls.length > 0) {
                  
                  // 🚨 FALLBACK: Check if AI only did tool_calls without any content
                  if (!fullResponse.trim() && toolCalls.some(tc => tc.function.name === "verify_answer_confidence")) {
                    console.log("⚠️ AI only called verify_answer_confidence without content - sending nudge to generate answer");
                    
                    // Send a message to user explaining the issue
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                      choices: [{
                        delta: { content: "⚠️ De AI heeft alleen een confidence check uitgevoerd zonder antwoord te geven. Ik vraag om het volledige antwoord..." },
                        index: 0
                      }]
                    })}\n\n`));
                    
                    // Continue to next AI call with nudge prompt
                    // The retry logic below will handle this case
                    needsRetryWithNewKnowledge = true;
                    newKnowledgeMessage = "\n\n🔄 Ik probeer het opnieuw met een volledig antwoord...\n";
                  }
                  
                  // Execute all tool calls
                  for (const toolCall of toolCalls) {
                    try {
                      const args = JSON.parse(toolCall.function.arguments);
                      let result;

                      switch (toolCall.function.name) {
                        case "create_task":
                          // Normalize priority (handle NORMAL -> MEDIUM mapping)
                          let normalizedPriority = (args.priority || "MEDIUM").toUpperCase();
                          if (normalizedPriority === "NORMAL") normalizedPriority = "MEDIUM";
                          if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(normalizedPriority)) {
                            normalizedPriority = "MEDIUM";
                          }

                          // Smart date defaults: if due_at is set but start_at isn't, set start_at to today
                          let startAt = args.start_at || null;
                          const dueAt = args.due_at || null;
                          
                          if (dueAt && !startAt) {
                            // If only due_at is provided, set start_at to now (for calendar visibility)
                            startAt = new Date().toISOString();
                          } else if (!dueAt && !startAt) {
                            // If neither is provided, set both to today (for "Mijn Dag" context)
                            const today = new Date();
                            startAt = today.toISOString();
                          }

                          const { data: newTask, error: createError } = await supabaseClient
                            .from("tasks")
                            .insert({
                              title: args.title,
                              description: args.description || null,
                              priority: normalizedPriority,
                              due_at: dueAt,
                              start_at: startAt,
                              project_id: args.project_id || null,
                              client_id: args.client_id || null,
                              assignee_id: args.assignee_id || null,
                              org_id: userOrgId,
                              reporter_id: user.id
                            })
                            .select()
                            .single();

                          if (createError) throw createError;
                          
                          const dateInfo = startAt ? ` (start: ${new Date(startAt).toLocaleString('nl-NL')})` : '';
                          result = { 
                            success: true, 
                            task_id: newTask.id, 
                            message: `✅ Taak "${args.title}" succesvol aangemaakt met ID ${newTask.sequence_number || newTask.id}${dateInfo}. Deze taak is nu zichtbaar in de kalender!` 
                          };
                          break;

                        case "update_task":
                          const updateData: any = {};
                          if (args.title) updateData.title = args.title;
                          if (args.description !== undefined) updateData.description = args.description;
                          
                          // Normalize priority
                          if (args.priority) {
                            let normalizedUpdatePriority = args.priority.toUpperCase();
                            if (normalizedUpdatePriority === "NORMAL") normalizedUpdatePriority = "MEDIUM";
                            if (["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(normalizedUpdatePriority)) {
                              updateData.priority = normalizedUpdatePriority;
                            }
                          }
                          
                          if (args.start_at !== undefined) updateData.start_at = args.start_at;
                          if (args.due_at !== undefined) updateData.due_at = args.due_at;
                          if (args.completed_at !== undefined) updateData.completed_at = args.completed_at;

                          const { data: updatedTask, error: updateError } = await supabaseClient
                            .from("tasks")
                            .update(updateData)
                            .eq("id", args.task_id)
                            .select()
                            .single();

                          if (updateError) throw updateError;
                          result = { success: true, task_id: updatedTask.id, message: `Taak "${updatedTask.title}" succesvol gewijzigd` };
                          break;

                        case "add_comment":
                          const { data: newComment, error: commentError } = await supabaseClient
                            .from("comments")
                            .insert({
                              task_id: args.task_id,
                              body: args.body,
                              author_id: user.id
                            })
                            .select()
                            .single();

                          if (commentError) throw commentError;
                          result = { success: true, comment_id: newComment.id, message: `Comment toegevoegd aan taak` };
                          break;

                        case "save_knowledge":
                          const { data: knowledge, error: knowledgeError } = await supabaseClient
                            .from("ai_knowledge_base")
                            .upsert({
                              user_id: user.id,
                              org_id: userOrgId,
                              category: args.category,
                              key: args.key,
                              value: args.value,
                              confidence_score: args.confidence_score || 1.0,
                              source: args.source || 'ai_conversation',
                              usage_count: 0,
                              last_used_at: new Date().toISOString()
                            }, {
                              onConflict: 'user_id,org_id,category,key'
                            })
                            .select()
                            .single();

                          if (knowledgeError) throw knowledgeError;
                          
                          // ✅ STAP 1: Direct embedding triggeren (geen afhankelijkheid van DB triggers)
                          console.log(`🔄 Triggering embedding generation for ${knowledge.id}...`);
                          supabaseClient.functions.invoke('generate-embedding', {
                            body: { knowledge_id: knowledge.id }
                          }).catch(err => console.warn('⚠️ Embedding trigger failed (will retry):', err));
                          
                          // ✅ FASE 3: Wait for embedding to be created
                          let embeddingReady = false;
                          let retries = 0;
                          const maxRetries = 10; // 5 seconds max (10 x 500ms)
                          
                          while (!embeddingReady && retries < maxRetries) {
                            await new Promise(r => setTimeout(r, 500)); // 0.5s wait
                            
                            const { data: embedding } = await supabaseClient
                              .from('knowledge_embeddings')
                              .select('id')
                              .eq('knowledge_id', knowledge.id)
                              .maybeSingle();
                            
                            if (embedding) {
                              embeddingReady = true;
                              console.log(`✅ [FASE 3] Embedding ready for ${args.key} after ${(retries + 1) * 0.5}s`);
                            }
                            retries++;
                          }
                          
                          if (!embeddingReady) {
                            console.warn(`⚠️ [FASE 3] Embedding not ready after ${maxRetries * 0.5}s for ${args.key} - will be available shortly`);
                          }
                          
                          result = { 
                            success: true, 
                            knowledge_id: knowledge.id, 
                            embedding_ready: embeddingReady,
                            message: `📚 Kennis opgeslagen: ${args.key} (${args.category})${embeddingReady ? ' ✅ direct beschikbaar' : ' ⏳ wordt verwerkt'}` 
                          };
                          break;

                        case "log_learning_event":
                          const { data: learningEvent, error: learningError } = await supabaseClient
                            .from("ai_learning_events")
                            .insert({
                              user_id: user.id,
                              org_id: userOrgId,
                              event_type: args.event_type,
                              context: args.context,
                              ai_response: args.ai_response || null,
                              user_action: args.user_action || null,
                              outcome: args.outcome,
                              learning_score: args.learning_score || 0.5,
                              applied_to_knowledge_base: false
                            })
                            .select()
                            .single();

                          if (learningError) throw learningError;
                          result = { 
                            success: true, 
                            event_id: learningEvent.id, 
                            message: `🎓 Leer event gelogd: ${args.event_type}` 
                          };
                          break;

                        case "create_business_intelligence":
                          const { data: biInsight, error: biError } = await supabaseClient
                            .from("business_intelligence")
                            .insert({
                              org_id: userOrgId,
                              intelligence_type: args.intelligence_type,
                              title: args.title,
                              description: args.description || null,
                              data: args.data,
                              priority: args.priority || 'medium',
                              impact_score: args.impact_score || 5.0,
                              status: 'active'
                            })
                            .select()
                            .single();

                          if (biError) throw biError;
                          result = { 
                            success: true, 
                            insight_id: biInsight.id, 
                            message: `💡 Business Intelligence insight gecreëerd: ${args.title}` 
                          };
                          break;

                        case "verify_answer_confidence":
                          const usedKnowledge = fullKnowledgeBase.filter((kb: any) => 
                            args.used_knowledge_ids.includes(kb.id)
                          );
                          
                          // ✅ Pass clients data to confidence calculator
                          const confidenceCalc = calculateAnswerConfidence(
                            usedKnowledge,
                            messageKeywords,
                            lastUserMessage,
                            clients || [] // ✅ Include clients context
                          );
                          
                          result = {
                            success: true,
                            confidence: confidenceCalc.confidence,
                            confidence_percent: (confidenceCalc.confidence * 100).toFixed(0),
                            reasoning: confidenceCalc.reasoning,
                            gaps: confidenceCalc.gaps,
                            message: `📊 Confidence: ${(confidenceCalc.confidence * 100).toFixed(0)}%\n${confidenceCalc.reasoning}${confidenceCalc.gaps.length > 0 ? `\n⚠️ Gaps: ${confidenceCalc.gaps.join(', ')}` : ''}`
                          };
                          break;

                        case "auto_harvest_knowledge":
                          console.log("🤖 Triggering Auto-Knowledge-Harvester:", args);
                          
                          try {
                            const harvesterResponse = await fetch(
                              `${Deno.env.get("SUPABASE_URL")}/functions/v1/auto-knowledge-harvester`,
                              {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  "Authorization": req.headers.get("Authorization") || ""
                                },
                                body: JSON.stringify({
                                  search_topics: args.search_topics,
                                  autonomous: true,
                                  triggered_by: "ai_chat_knowledge_gap",
                                  reason: args.reason
                                })
                              }
                            );

                            const harvesterResult = await harvesterResponse.json();
                            
                            // FASE 3: Polling mechanisme voor harvester results
                            let newKnowledge: any[] = [];
                            if (args.wait_for_results !== false) {
                              console.log("⏳ Waiting for harvester results (max 20s)...");
                              
                              for (let i = 0; i < 10; i++) {
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                
                                // Check for new knowledge items
                                const { data: recentKnowledge } = await supabaseClient
                                  .from('ai_knowledge_base')
                                  .select('*')
                                  .or(`user_id.eq.${user.id},org_id.eq.${userOrgId}`)
                                  .is('deleted_at', null)
                                  .gte('created_at', new Date(Date.now() - 25000).toISOString())
                                  .order('created_at', { ascending: false });
                                
                                if (recentKnowledge && recentKnowledge.length > 0) {
                                  newKnowledge = recentKnowledge;
                                  console.log(`✅ Found ${newKnowledge.length} new knowledge items`);
                                  
                                  // Refresh fullKnowledgeBase with new items
                                  fullKnowledgeBase.push(...newKnowledge);
                                  
                                  // Re-organize by category
                                  newKnowledge.forEach((kb: any) => {
                                    if (!knowledgeByCategory[kb.category]) {
                                      knowledgeByCategory[kb.category] = [];
                                    }
                                    knowledgeByCategory[kb.category].push(kb);
                                  });
                                  
                                  break;
                                }
                              }
                            }
                            
                            // Bepaal message op basis van wait_for_results en resultaten
                            let harvesterMessage: string;
                            if (args.wait_for_results !== false && newKnowledge.length === 0) {
                              // Wachttijd afgelopen, geen resultaten
                              harvesterMessage = `⏳ Geen betrouwbare openbare bronnen gevonden binnen 15s. Ik blijf monitoren en kom erop terug zodra er verifieerbare data is.`;
                              console.log(`⚠️ Harvester: Geen nieuwe kennis gevonden binnen wachttijd`);
                              noResultsAfterHarvest = true; // Set flag for closing message
                            } else if (newKnowledge.length > 0) {
                              harvesterMessage = `✅ Harvester verzamelde ${newKnowledge.length} nieuwe kennisitems! Je kennisbank is geüpdatet.`;
                            } else {
                              harvesterMessage = `🤖 Auto-Knowledge-Harvester gestart voor ${args.search_topics.length} onderwerpen`;
                            }
                            
                            result = {
                              success: true,
                              message: harvesterMessage,
                              topics: args.search_topics,
                              harvester_status: harvesterResult,
                              new_knowledge_count: newKnowledge.length,
                              should_retry_answer: newKnowledge.length > 0,
                              waited_for_results: args.wait_for_results !== false
                            };
                            
                            // 🔄 RETRY DETECTION: Check if harvester found new knowledge
                            if (result.should_retry_answer && result.new_knowledge_count > 0) {
                              console.log(`🔄 RETRY TRIGGERED: Harvester found ${result.new_knowledge_count} new items`);
                              console.log(`📊 Retry count: ${retryCount}, New knowledge count: ${result.new_knowledge_count}`);
                              needsRetryWithNewKnowledge = true;
                              newKnowledgeMessage = `\n\n✅ Nieuwe data verzameld! ${result.new_knowledge_count} kennisitems toegevoegd. Ik herbereken nu mijn antwoord...\n\n`;
                              console.log(`✅ Retry flag set: ${needsRetryWithNewKnowledge}`);
                            } else if (result.waited_for_results && result.new_knowledge_count === 0) {
                              console.log(`⚠️ Retry niet gestart: Geen nieuwe kennis gevonden na wachttijd`);
                            }
                          } catch (harvesterError) {
                            console.error("❌ Harvester trigger failed:", harvesterError);
                            result = {
                              success: false,
                              message: "⚠️ Harvester kon niet worden gestart, maar knowledge gap is wel gelogd"
                            };
                          }
                          break;

                        case "search_professionals":
                          const { functie, regio, vanaf_datum, tot_datum, aantal = 10 } = args;
                          
                          console.log("🔍 Searching professionals:", { functie, regio, vanaf_datum, tot_datum, aantal });

                          // Call talent-search function
                          const { data: searchData, error: searchError } = await supabaseClient.functions.invoke('talent-search', {
                            body: { functie, regio, vanaf_datum, tot_datum, aantal }
                          });

                          if (searchError) {
                            console.error("Search error:", searchError);
                            result = { 
                              success: false, 
                              message: `❌ Fout bij zoeken professionals: ${searchError.message}` 
                            };
                          } else if (!searchData.professionals || searchData.professionals.length === 0) {
                            result = { 
                              success: false, 
                              message: `ℹ️ Geen professionals gevonden met deze filters. Probeer filters te verruimen of voeg eerst professionals toe via de Professionals pagina.` 
                            };
                          } else {
                            const profList = searchData.professionals
                              .map((p: any, i: number) => 
                                `${i + 1}. **${p.full_name}** - ${p.functie_niveau}${p.regio ? ` (${p.regio})` : ''}${p.rating ? ` ⭐ ${p.rating.toFixed(1)}` : ''}`
                              )
                              .join('\n');
                            
                            const filterInfo = [];
                            if (functie) filterInfo.push(`functie: ${functie}`);
                            if (regio) filterInfo.push(`regio: ${regio}`);
                            if (vanaf_datum) filterInfo.push(`vanaf: ${vanaf_datum}`);
                            if (tot_datum) filterInfo.push(`tot: ${tot_datum}`);
                            
                            result = { 
                              success: true, 
                              message: `✅ ${searchData.total_found} professionals gevonden${filterInfo.length > 0 ? ` (${filterInfo.join(', ')})` : ''}:\n\n${profList}` 
                            };
                          }
                          break;

                        case "create_multiple_tasks":
                          console.log(`📦 Bulk creating ${args.tasks.length} tasks`);
                          
                          const bulkResults = {
                            successful: [] as any[],
                            failed: [] as any[]
                          };

                          // Prepare all tasks for bulk insert
                          const tasksToInsert = args.tasks.map((task: any) => {
                            // Normalize priority
                            let normalizedPriority = (task.priority || "MEDIUM").toUpperCase();
                            if (normalizedPriority === "NORMAL") normalizedPriority = "MEDIUM";
                            if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(normalizedPriority)) {
                              normalizedPriority = "MEDIUM";
                            }

                            // Smart date defaults
                            let startAt = task.start_at || null;
                            const dueAt = task.due_at || null;
                            
                            if (dueAt && !startAt) {
                              startAt = new Date().toISOString();
                            } else if (!dueAt && !startAt) {
                              startAt = new Date().toISOString();
                            }

                            return {
                              title: task.title,
                              description: task.description || null,
                              priority: normalizedPriority,
                              due_at: dueAt,
                              start_at: startAt,
                              project_id: task.project_id || null,
                              client_id: task.client_id || null,
                              assignee_id: task.assignee_id || null,
                              org_id: userOrgId,
                              reporter_id: user.id
                            };
                          });

                          // Bulk insert
                          const { data: createdTasks, error: bulkError } = await supabaseClient
                            .from("tasks")
                            .insert(tasksToInsert)
                            .select();

                          if (bulkError) {
                            console.error("Bulk insert error:", bulkError);
                            result = {
                              success: false,
                              message: `❌ Fout bij bulk aanmaken: ${bulkError.message}`
                            };
                          } else {
                            const successCount = createdTasks?.length || 0;
                            const tasksList = createdTasks
                              ?.slice(0, 5)
                              .map((t: any, i: number) => `${i + 1}. ${t.title} (ID: ${t.sequence_number || t.id})`)
                              .join('\n') || '';
                            
                            const moreText = successCount > 5 ? `\n... en ${successCount - 5} meer taken` : '';
                            
                            result = {
                              success: true,
                              message: `✅ ${successCount} taken succesvol aangemaakt!\n\n${tasksList}${moreText}\n\n🎯 Alle taken zijn nu zichtbaar in Kanban, Lijst en Kalender views.`
                            };
                          }
                          break;

                        case "declare_knowledge_usage":
                          // Store declared knowledge IDs for accurate tracking
                          declaredKnowledgeIds.push(...args.knowledge_ids);
                          console.log(`📊 AI declared usage of ${args.knowledge_ids.length} knowledge items${args.usage_context ? `: ${args.usage_context}` : ''}`);
                          
                          result = {
                            success: true,
                            message: `📊 Tracking: ${args.knowledge_ids.length} knowledge items geregistreerd`,
                            tracked_ids: args.knowledge_ids
                          };
                          break;

                        default:
                          result = { success: false, message: `Onbekende tool: ${toolCall.function.name}` };
                      }

                      // Send tool result back to user as content
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        choices: [{
                          delta: { content: `\n\n✅ ${result.message}` },
                          index: 0
                        }]
                      })}\n\n`));
                    } catch (toolError) {
                      console.error(`Error executing tool ${toolCall.function.name}:`, toolError);
                      const errorMessage = toolError instanceof Error ? toolError.message : String(toolError);
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        choices: [{
                          delta: { content: `\n\n❌ Fout bij uitvoeren actie: ${errorMessage}` },
                          index: 0
                        }]
                      })}\n\n`));
                    }
                  }

                  // 🔄 CONDITIONAL [DONE]: Only send if we're NOT retrying with new knowledge
                  if (!needsRetryWithNewKnowledge) {
                    // Check if we just executed auto_harvest_knowledge with 0 results after waiting
                    if (noResultsAfterHarvest) {
                      // Send explicit closing message for failed harvester
                      console.log(`⚠️ Sending closing message: No results found after wait`);
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        choices: [{
                          delta: { 
                            content: `\n\n⚠️ Ik heb binnen de wachttijd niets gevonden dat ik met hoge zekerheid kan bevestigen. Geef me meer context (bijv. regio/jaar of opdrachtgeverstype), of ik probeer het later opnieuw.` 
                          },
                          index: 0
                        }]
                      })}\n\n`));
                      noResultsAfterHarvest = false; // Reset flag
                    }
                    controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                    break;
                  }

                  // 🔄 RETRY LOOP: Trigger second AI completion with new knowledge
                  if (needsRetryWithNewKnowledge && retryCount < MAX_RETRIES) {
                    retryCount++;
                    console.log(`🔄 Starting retry ${retryCount}/${MAX_RETRIES} with new knowledge...`);

                    // Send retry status to client
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                      choices: [{
                        delta: { content: newKnowledgeMessage },
                        index: 0
                      }]
                    })}\n\n`));

                    // Re-fetch updated knowledge base (harvester has added new items)
                    const { data: updatedKnowledgeData } = await supabaseClient
                      .from("ai_knowledge_base")
                      .select("*")
                      .is("deleted_at", null)
                      .order("confidence_score", { ascending: false });

                    const updatedFullKnowledgeBase = (updatedKnowledgeData || []).map((kb: any) => ({
                      id: kb.id,
                      category: kb.category,
                      key: kb.key,
                      value: kb.value,
                      confidence_score: kb.confidence_score,
                      source: kb.source,
                      client: kb.client,
                      usage_count: kb.usage_count,
                      last_used_at: kb.last_used_at,
                    }));

                    console.log(`📚 Updated knowledge base: ${updatedFullKnowledgeBase.length} items (was ${fullKnowledgeBase.length})`);

                    // Get last user message for retry context
                    const lastUserMessage = messages
                      .filter((m: any) => m.role === "user")
                      .pop()?.content || "de vraag";

                    // Rebuild system prompt with updated knowledge
                    const retrySystemPrompt = `Je bent een efficiënte AI-assistent voor TaskFlow. Focus: kort, effectief, direct.

🕐 HUIDIGE NEDERLANDSE TIJD:
Vandaag is: ${dutchDateTime}
Je werkt in Nederlandse tijd (Europe/Amsterdam, CET/CEST tijdzone).

⚡ SLIMME ANTWOORDLENGTE:
- STANDAARD: 2-3 korte zinnen (efficiënt & direct)
- UITGEBREID: Bij trigger woorden zoals "uitgebreid", "volledig", "gedetailleerd", "leg uit", "vertel meer" → geef complete, gestructureerde uitleg
- KORT: Bij "samenvatting", "kort", "overzicht" → extra beknopt

🎯 TOOLS: Je hebt zojuist auto_harvest_knowledge uitgevoerd en nieuwe data verzameld.

🔄 RETRY INSTRUCTIE - DIT IS BELANGRIJK:
Je krijgt een TWEEDE KANS om de vraag te beantwoorden met VERSE KENNISBANK DATA.

1. Gebruik verify_answer_confidence OPNIEUW - de kennisbank bevat nu ${updatedFullKnowledgeBase.length} items (was ${fullKnowledgeBase.length})
2. Geef een VOLLEDIG NIEUW, ZELFSTANDIG LEESBAAR antwoord met:
   - Nieuwe confidence badge (bijv. [🟢 96% Zeker] ipv [🟠 50%])
   - Concrete info uit de nieuwe kennisitems
   - Expliciete vermelding: "✅ Op basis van nieuw verzamelde data:" of "✅ Na herberekening:"
3. Als nog steeds <98%: wees transparant over wat je WEL weet en wat nog ontbreekt

⚠️ RETRY ANTWOORD REGELS:
- MOET zelfstandig leesbaar zijn (geen "zie hierboven" of verwijzingen naar eerste antwoord)
- TOON duidelijk verschil tussen eerste poging en retry (nieuwe confidence + nieuwe data)
- GEEN herhaling van "ik ga zoeken" - je hebt al gezocht, geef nu het RESULTAAT

📚 UPDATED KENNISBANK (${updatedFullKnowledgeBase.length} items):
${updatedFullKnowledgeBase.slice(0, 50).map(kb => `- ${kb.category}: ${kb.key} = ${JSON.stringify(kb.value).substring(0, 100)}`).join('\n')}
`;

                    const retryMessages = [
                      { role: "system", content: retrySystemPrompt },
                      ...messages,
                      { 
                        role: "assistant", 
                        content: fullResponse.trim()
                      },
                      {
                        role: "user",
                        content: `Je hebt zojuist nieuwe kennisitems verzameld via auto_harvest_knowledge. Beantwoord mijn originele vraag ("${lastUserMessage}") nu opnieuw met:

1. verify_answer_confidence om je NIEUWE confidence te berekenen
2. Een volledig, geüpdatet, ZELFSTANDIG LEESBAAR antwoord
3. Nieuwe confidence badge
4. Expliciete vermelding van nieuwe data

BELANGRIJK: Dit moet een compleet nieuw antwoord zijn, geen verwijzing naar je vorige antwoord.`
                      }
                    ];

                    // 🔄 RECURSIVE AI CALL: Make new fetch with updated context
                    console.log("🤖 Making retry AI call with updated knowledge...");
                    const retryResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                      method: "POST",
                      headers: {
                        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        model: "google/gemini-2.5-flash",
                        messages: retryMessages,
                        tools: tools,
                        stream: true,
                      }),
                    });

                    if (!retryResponse.ok) {
                      const errorText = await retryResponse.text();
                      console.error(`❌ Retry AI call failed: ${retryResponse.status} - ${errorText}`);
                      
                      // Stuur user-friendly error naar client
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        choices: [{
                          delta: { content: "\n\n⚠️ Fout bij het verwerken van nieuwe data. Probeer het opnieuw." },
                          index: 0
                        }]
                      })}\n\n`));
                      
                      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                      break;
                    }

                    // Reset tracking variables for retry stream
                    needsRetryWithNewKnowledge = false;
                    fullResponse = "";
                    buffer = "";
                    toolCalls = [];
                    
                    // Get new reader for retry stream
                    const retryReader = retryResponse.body?.getReader();
                    if (!retryReader) {
                      console.error("❌ No retry reader available");
                      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                      break;
                    }

                    console.log("✅ Retry stream started, processing retry response...");
                    
                    // Process retry stream (same logic as main stream)
                    let retryStreamComplete = false;
                    while (true && !retryStreamComplete) {
                      const { done: retryDone, value: retryValue } = await retryReader.read();
                      if (retryDone) {
                        retryStreamComplete = true;
                        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                        break;
                      }

                      buffer += decoder.decode(retryValue, { stream: true });
                      const lines = buffer.split("\n");
                      buffer = lines.pop() || "";

                      for (const line of lines) {
                        if (!line.trim() || line.startsWith(":")) continue;
                        if (!line.startsWith("data: ")) continue;

                        const data = line.slice(6);
                        if (data === "[DONE]") continue;

                        try {
                          const parsed = JSON.parse(data);
                          const delta = parsed.choices?.[0]?.delta;

                          // Stream retry content
                          if (delta?.content) {
                            fullResponse += delta.content;
                            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                          }

                          // If retry stream finishes, exit both loops
                          if (parsed.choices?.[0]?.finish_reason === "stop") {
                            console.log("✅ Retry stream completed");
                            retryStreamComplete = true;
                            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                            break;
                          }
                        } catch (e) {
                          console.error("Error parsing retry SSE data:", e);
                        }
                      }

                      // Exit outer loop if retry stream complete
                      if (retryStreamComplete) break;
                    }
                    
                    break; // Exit main tool execution loop
                  }

                  // Max retries reached or no retry needed
                  if (retryCount >= MAX_RETRIES) {
                    console.log(`⚠️ Max retries (${MAX_RETRIES}) reached, stopping`);
                  }
                  controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                  break;
                }
              } catch (e) {
                console.error("Error parsing SSE data:", e);
              }
            }
          }

          // Flush remaining buffer
          if (buffer.trim()) {
            const data = buffer.trim();
            if (data.startsWith("data: ") && data.slice(6) !== "[DONE]") {
              controller.enqueue(encoder.encode(`${data}\n\n`));
            }
          }

          // Track knowledge usage BEFORE closing stream (blocking)
          // 🎯 Use declared IDs if available, otherwise fallback to keyword matching
          let usedKnowledgeIds: string[] = [];
          if (declaredKnowledgeIds.length > 0) {
            console.log(`✅ Using DECLARED knowledge IDs for tracking: ${declaredKnowledgeIds.length} items`);
            
            // Direct tracking using declared IDs
            for (const knowledgeId of declaredKnowledgeIds) {
              // Fetch current usage_count
              const { data: currentKb } = await supabaseClient
                .from('ai_knowledge_base')
                .select('usage_count')
                .eq('id', knowledgeId)
                .single();
              
              if (currentKb) {
                const { error: updateError } = await supabaseClient
                  .from('ai_knowledge_base')
                  .update({
                    usage_count: (currentKb.usage_count || 0) + 1,
                    last_used_at: new Date().toISOString()
                  })
                  .eq('id', knowledgeId);
                
                if (!updateError) {
                  usedKnowledgeIds.push(knowledgeId);
                } else {
                  console.error(`Failed to track knowledge ${knowledgeId}:`, updateError);
                }
              }
            }
            
            console.log(`📊 Knowledge tracking complete: ${usedKnowledgeIds.length} items updated`);
          } else {
            console.log(`⚠️ No declared knowledge IDs, falling back to keyword matching`);
            usedKnowledgeIds = await trackKnowledgeUsage(fullResponse, fullKnowledgeBase, supabaseClient, user.id, messages);
          }
          
          // ============================================
          // FASE 2 & 3: MULTI-ITERATION + CONFIDENCE TRACKING
          // ============================================
          let iterations = 1;
          let initialConfidence = 0.75;
          let finalConfidence = 0.75;
          let harvesterTriggered = false;
          
          try {
            // Extract confidence from response
            const confidenceMatch = fullResponse.match(/\[(?:🟢|🟡|🟠|🔴)\s+(\d+)%/);
            initialConfidence = confidenceMatch ? parseInt(confidenceMatch[1]) / 100 : 0.75;
            finalConfidence = initialConfidence;
            
            // FASE 3: Multi-iteration logic - 2e poging bij lage confidence
            if (initialConfidence < 0.70 && iterations < 2) {
              console.log(`🔄 Low confidence (${(initialConfidence * 100).toFixed(0)}%), trying iteration 2...`);
              harvesterTriggered = true;
              
              // Simply try to get more knowledge from the existing base
              const { data: moreKnowledge } = await supabaseClient
                .from('ai_knowledge_base')
                .select('id, category, key, value, confidence_score')
                .eq('org_id', userOrgId)
                .is('deleted_at', null)
                .order('confidence_score', { ascending: false })
                .limit(20);
              
              if (moreKnowledge && moreKnowledge.length > 0) {
                // Re-generate with expanded knowledge
                const improvedKnowledgeBase = [...fullKnowledgeBase, ...moreKnowledge];
                
                // Format expanded knowledge
                const expandedKnowledgeText = improvedKnowledgeBase
                  .map(kb => `[ID: ${kb.knowledge_id || kb.id}] ${kb.key}: ${typeof kb.value === 'string' ? kb.value : JSON.stringify(kb.value)}`)
                  .join('\n');
                
                // Make second AI call with expanded knowledge
                const secondResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    model: 'google/gemini-2.5-flash', // Cheaper model for 2nd iteration
                    messages: [
                      { role: 'system', content: `Je bent een AI-assistent. Gebruik deze uitgebreide kennis:\n\n${expandedKnowledgeText}` },
                      { role: 'user', content: lastUserMessage }
                    ],
                    stream: false,
                  }),
                });
                
                if (secondResponse.ok) {
                  const secondData = await secondResponse.json();
                  const improvedResponse = secondData.choices?.[0]?.message?.content || fullResponse;
                  
                  // Check improved confidence
                  const improvedMatch = improvedResponse.match(/\[(?:🟢|🟡|🟠|🔴)\s+(\d+)%/);
                  const improvedConfidence = improvedMatch ? parseInt(improvedMatch[1]) / 100 : initialConfidence;
                  
                  if (improvedConfidence > initialConfidence) {
                    fullResponse = improvedResponse;
                    finalConfidence = improvedConfidence;
                    iterations = 2;
                    console.log(`✅ Iteration 2 complete: ${(initialConfidence * 100).toFixed(0)}% → ${(finalConfidence * 100).toFixed(0)}%`);
                  } else {
                    console.log(`⚠️ Iteration 2 did not improve confidence, keeping original`);
                  }
                }
              }
            }
            
            // Log REAL confidence tracking
            await supabaseClient.from('confidence_tracking').insert({
              user_id: user.id,
              org_id: userOrgId,
              question: lastUserMessage,
              initial_confidence: initialConfidence,
              final_confidence: finalConfidence,
              iterations_count: iterations,
              used_knowledge_ids: usedKnowledgeIds,
              harvester_triggered: harvesterTriggered
            });
            
            console.log(`📊 Confidence tracked: ${(initialConfidence * 100).toFixed(0)}% → ${(finalConfidence * 100).toFixed(0)}% (${iterations} iterations)`);
          } catch (confError) {
            console.error('❌ Confidence tracking failed (non-blocking):', confError);
          }
          
          // ============================================
          // FASE 8: ORG-PROFILE MISMATCH DETECTION
          // ============================================
          if (orgProfiles && orgProfiles.length > 0 && fullResponse) {
            try {
              const aiResponseLower = fullResponse.toLowerCase();
              
              for (const profile of orgProfiles) {
                const brandLower = profile.brand_name.toLowerCase();
                
                // Check if AI mentions this organization
                if (aiResponseLower.includes(brandLower)) {
                  // Check KvK mismatch
                  if (aiResponseLower.includes('kvk')) {
                    const mentionsWrongKvK = /kvk[:\s-]*(\d{8})/gi.exec(aiResponseLower);
                    if (mentionsWrongKvK && mentionsWrongKvK[1] !== profile.kvk_number) {
                      console.error('🚨 ORG-PROFILE MISMATCH: Wrong KvK!', {
                        org: profile.brand_name,
                        correct_kvk: profile.kvk_number,
                        mentioned_kvk: mentionsWrongKvK[1],
                        question: lastUserMessage
                      });
                      
                      // Log as negative learning event
                      await supabaseServiceClient.from('ai_learning_events').insert({
                        event_type: 'org_profile_mismatch',
                        user_id: user.id,
                        org_id: userOrgId,
                        context: {
                          question: lastUserMessage,
                          ai_answer: fullResponse.substring(0, 500),
                          ground_truth: {
                            org: profile.brand_name,
                            kvk: profile.kvk_number
                          },
                          mismatch_type: 'kvk',
                          mentioned_kvk: mentionsWrongKvK[1]
                        },
                        learning_score: -0.8,
                        outcome: 'harmful'
                      });
                    }
                  }
                  
                  // Check business type mismatch
                  const wrongTypes = ['zorginstelling', 'thuiszorg', 'zorgverlener', 'verpleeghuis', 'ziekenhuis'];
                  const correctType = (profile.business_type || '').toLowerCase();
                  
                  for (const wrongType of wrongTypes) {
                    if (aiResponseLower.includes(wrongType) && !correctType.includes(wrongType)) {
                      console.error('🚨 ORG-PROFILE MISMATCH: Wrong business type!', {
                        org: profile.brand_name,
                        correct_type: profile.business_type,
                        mentioned_type: wrongType,
                        question: lastUserMessage
                      });
                      
                      await supabaseServiceClient.from('ai_learning_events').insert({
                        event_type: 'org_profile_mismatch',
                        user_id: user.id,
                        org_id: userOrgId,
                        context: {
                          question: lastUserMessage,
                          ai_answer: fullResponse.substring(0, 500),
                          ground_truth: {
                            org: profile.brand_name,
                            business_type: profile.business_type
                          },
                          mismatch_type: 'business_type',
                          mentioned_type: wrongType
                        },
                        learning_score: -0.6,
                        outcome: 'harmful'
                      });
                    }
                  }
                }
              }
              
              console.log('✅ Org-profile mismatch detection complete');
            } catch (mismatchError) {
              console.error('❌ Org-profile mismatch detection failed (non-blocking):', mismatchError);
            }
          }
          
          // ✅ Send knowledge metadata to client for feedback tracking
          if (usedKnowledgeIds.length > 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              choices: [{
                delta: { 
                  content: '',
                  metadata: { usedKnowledge: usedKnowledgeIds }
                },
                index: 0
              }]
            })}\n\n`));
            console.log('📤 Sent knowledge metadata to client:', usedKnowledgeIds.length, 'items');
          }
          
          // ============================================
          // PERSISTENCE AFTER STREAMING (IN BACKGROUND)
          // ============================================
          // ✅ conversation_id is already validated early - safe to use
          const conversationId = conversation_id;
          console.log(`💾 Starting background persistence for conversation: ${conversationId}`);
          
          // Start background persistence (non-blocking)
          (async () => {
            await new Promise(r => setTimeout(r, 500)); // Wait for stream to complete
            
            try {
              const userId = user.id;
              const userMessage = messages[messages.length - 1];

              // 1️⃣ CRITICAL: Persist user message with retry (using service role client)
              const userResult = await persistMessage(supabaseServiceClient, {
                user_id: userId,
                org_id: userOrgId,
                conversation_id: conversationId,
                role: 'user',
                content: userMessage.content
              });

              if (!userResult.success) {
                console.error('❌ CRITICAL: User message not persisted!');
              }

              console.log('✅ User message persisted in background');

              // ============================================
              // FASE 1: CACHE STORAGE (after streaming complete)
              // ============================================
              try {
                await supabaseServiceClient.from('ai_response_cache').insert({
                  org_id: userOrgId,
                  question_hash: cacheKey,
                  question: lastUserMessageForCache,
                  response: fullResponse,
                  knowledge_ids: usedKnowledgeIds,
                  expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                });
                console.log('✅ Response cached for 24h');
              } catch (cacheError) {
                console.warn('Cache insert failed (non-critical):', cacheError);
              }

              // 3️⃣ OPTIONAL: Conversation context (soft fail)
              if (usedKnowledgeIds.length > 0) {
                try {
                  await supabaseServiceClient.from('conversation_context').insert({
                    conversation_id: conversationId,
                    user_id: userId,
                    category: 'task_management_chat',
                    summary: userMessage.content.substring(0, 500),
                    key_points: {
                      used_knowledge_ids: usedKnowledgeIds,
                      response_length: fullResponse.length,
                      user_question: userMessage.content
                    }
                  });
                } catch (e) {
                  console.warn('Conversation context failed:', e);
                }
              }

              // 4️⃣ OPTIONAL: Learning event (soft fail)
              if (usedKnowledgeIds.length > 0) {
                try {
                  const responseConfidenceMatch = fullResponse.match(/\[(?:🟢|🟡|🟠|🔴)\s+(\d+)%/);
                  const responseConfidence = responseConfidenceMatch ? parseInt(responseConfidenceMatch[1]) / 100 : 0.75;
                  
                  await supabaseServiceClient.from('ai_learning_events').insert({
                    user_id: userId,
                    org_id: userOrgId || userId,
                    event_type: 'ai_response_generated',
                    context: {
                      question: userMessage.content,
                      usedKnowledge: usedKnowledgeIds.map(id => ({ id })),
                      conversation_id: conversationId,
                      confidence: responseConfidence
                    },
                    ai_response: { content: fullResponse.substring(0, 1000) },
                    outcome: 'success'
                  });
                } catch (e) {
                  console.warn('Learning event failed:', e);
                }
              }

              console.log(`✅ ALL PERSISTENCE COMPLETE for conversation ${conversationId}`);
            } catch (error) {
              console.error('❌ Background persistence error:', error);
            }
          })();
          
          // ✅ IMMEDIATELY persist assistant message to get messageId
          const userId = user.id;
          let assistantMessageId: string | undefined;
          
          try {
            const assistantResult = await persistMessage(supabaseServiceClient, {
              user_id: userId,
              org_id: userOrgId,
              conversation_id: conversation_id,
              role: 'assistant',
              content: fullResponse,
              metadata: {
                feedback_enabled: true,
                knowledge_ids_for_feedback: usedKnowledgeIds
              }
            });
            
            if (assistantResult.success && assistantResult.messageId) {
              assistantMessageId = assistantResult.messageId;
              console.log('✅ Assistant message persisted immediately, id:', assistantMessageId);
            }
          } catch (e) {
            console.error('❌ Failed to persist assistant message immediately:', e);
          }
          
          // Send usedKnowledge + messageId metadata to client for feedback tracking
          if (usedKnowledgeIds.length > 0 || assistantMessageId) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              choices: [{
                delta: { 
                  metadata: { 
                    usedKnowledge: usedKnowledgeIds,
                    messageId: assistantMessageId
                  } 
                },
                index: 0
              }]
            })}\n\n`));
            console.log('📤 Sent metadata to client:', { knowledgeCount: usedKnowledgeIds.length, messageId: assistantMessageId });
          }
          
          controller.close();
          
          // ⏱️ Calculate total execution time and component timings
          perfTimers.total = Date.now() - perfTimers.start;
          perfTimers.aiCall = perfTimers.total - perfTimers.embedding - perfTimers.semanticSearch;
          
          console.log(`⏱️ Total request time: ${perfTimers.total}ms`, {
            embedding: perfTimers.embedding,
            semanticSearch: perfTimers.semanticSearch,
            aiCall: perfTimers.aiCall,
            knowledgeItemsUsed: usedKnowledgeIds.length
          });
          
          // Log function call for analytics
          const executionTime = Date.now() - startTime;
          const inputTokens = Math.floor(JSON.stringify(messages).length / 4);
          const outputTokens = Math.floor(fullResponse.length / 4);
          const totalTokens = inputTokens + outputTokens;
          const estimatedCost = (inputTokens * 0.000001) + (outputTokens * 0.000002); // EUR for gemini-2.5-flash
          
          try {
            const { data: orgData } = await supabaseClient
              .from('user_organizations')
              .select('org_id')
              .eq('user_id', user.id)
              .single();
            
            if (orgData?.org_id) {
              await supabaseClient.from('function_call_logs').insert({
                org_id: orgData.org_id,
                user_id: user.id,
                function_name: 'ai-chat',
                success: true,
                execution_time_ms: perfTimers.total,
                model_used: 'google/gemini-2.5-flash',
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                total_tokens: totalTokens,
                estimated_cost_eur: estimatedCost,
                metadata: {
                  embedding_time_ms: perfTimers.embedding,
                  search_time_ms: perfTimers.semanticSearch,
                  ai_time_ms: perfTimers.aiCall,
                  knowledge_items: usedKnowledgeIds.length
                }
              });
            }
          } catch (logError) {
            console.error('Failed to log function call:', logError);
            // Don't fail the request if logging fails
          }
        } catch (error) {
          console.error("Stream processing error:", error);
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });

  } catch (error) {
    console.error('AI chat error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
