import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const { messages } = requestBody;
    
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

    // Get user context with explicit access token
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(accessToken);
    
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

    // Get user's org_id
    const { data: userOrg } = await supabaseClient
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user.id)
      .single();
    
    const userOrgId = userOrg?.org_id;

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
      
      // 5 meest recente chat berichten
      supabaseClient
        .from('chat_messages')
        .select('role, content, created_at')
        .eq('user_id', user.id)
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
      supabaseClient
        .from('business_intelligence')
        .select('*')
        .eq('org_id', userOrg.org_id)
        .eq('status', 'active')
        .order('impact_score', { ascending: false })
        .limit(5),
      
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
    
    // SMART CONTEXT RETRIEVAL: Match keywords from user message with knowledge base
    const lastUserMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';
    const messageKeywords = lastUserMessage.split(' ').filter((w: string) => w.length > 3);
    
    // Fetch ALL knowledge base items with relevance scoring
    const { data: allKnowledgeBase } = await supabaseClient
      .from('ai_knowledge_base')
      .select('id, category, key, value, confidence_score, source, usage_count')
      .or(`user_id.eq.${user.id},org_id.eq.${userOrgId}`)
      .is('deleted_at', null)
      .order('confidence_score', { ascending: false })
      .order('usage_count', { ascending: false });
    
    // Score and rank knowledge items by relevance to current query
    const rankedKnowledge = (allKnowledgeBase || []).map((kb: any) => {
      let relevanceScore = 0;
      const searchText = `${kb.key} ${kb.category} ${JSON.stringify(kb.value)}`.toLowerCase();
      
      // Keyword matching
      messageKeywords.forEach((keyword: string) => {
        if (searchText.includes(keyword)) relevanceScore += 2;
      });
      
      // Boost by confidence and usage
      relevanceScore += (kb.confidence_score || 0) * 10;
      relevanceScore += Math.min((kb.usage_count || 0) * 0.1, 5);
      
      return { ...kb, relevanceScore };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 20); // Top 20 most relevant items
    
    const fullKnowledgeBase = rankedKnowledge;
    
    // Get Lovable API Key for deep analysis
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
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
            formatted += `  • ${kb.key}: ${value}`;
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

    const systemPrompt = `Je bent een efficiënte AI-assistent voor TaskFlow. Focus: kort, effectief, direct.

🕐 HUIDIGE NEDERLANDSE TIJD:
Vandaag is: ${dutchDateTime}
Je werkt in Nederlandse tijd (Europe/Amsterdam, CET/CEST tijdzone).
Alle datum/tijd referenties moeten in Nederlandse tijd zijn.
Bij "vandaag", "morgen", "deze week" gebruik je de Nederlandse datum hierboven.
${conversationSummary}
Bij planning: houd rekening met Nederlandse werkdagen en werktijden (ma-vr, 09:00-17:00).

⚡ SLIMME ANTWOORDLENGTE:
- STANDAARD: 2-3 korte zinnen (efficiënt & direct)
- UITGEBREID: Bij trigger woorden zoals "uitgebreid", "volledig", "gedetailleerd", "leg uit", "vertel meer" → geef complete, gestructureerde uitleg
- KORT: Bij "samenvatting", "kort", "overzicht" → extra beknopt
Als gebruiker meer wil zonder trigger woord: vraag "Wil je meer details?"

🎯 ACTIES (gebruik tools):
- create_task: Maak 1 taak aan
- create_multiple_tasks: Maak meerdere taken tegelijk aan (gebruik dit bij 4+ taken, bij lijsten/bulk imports)
- update_task: Wijzig taken (status, priority, deadline)
- add_comment: Voeg comments toe
- save_knowledge: Sla permanente kennis op
- log_learning_event: Log feedback & patronen
- create_business_intelligence: Creëer business insights

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
- Bij andere afbeeldingen: beschrijf wat je ziet en vraag wat de gebruiker ermee wil doen
- Focus op: taak titels, beschrijvingen, deadlines, prioriteiten, verantwoordelijken
- Converteeer altijd Nederlandse datums correct naar ISO 8601 format
- Bij onduidelijke data: vraag om verduidelijking voordat je taken aanmaakt

🚫 WANNEER GEEN TAAK AANMAKEN:
- INFORMATIEVRAGEN: "welke", "hoeveel", "wanneer", "waar", "hoe", "waarom", "wat zijn", "wie", "toon", "laat zien", "geef overzicht"
  → Antwoord met beschikbare data, GEEN taak aanmaken
- CLIENT VRAGEN: "welke klanten", "klantenoverzicht" 
  → Antwoord met CitöZorg klanten (Prisma, Lunet, SWZ, SIZA), GEEN taak aanmaken
- STATUS VRAGEN: "wat zijn mijn taken", "wat staat er open", "overzicht" 
  → Toon huidige taken/projecten, GEEN taak aanmaken

✅ WANNEER WEL TAAK AANMAKEN:
- TAAK-VERZOEKEN: "maak een taak", "plan", "herinner mij", "zet op de lijst", "voeg toe", "ik moet", "help mij met"
  → Dan WEL taak aanmaken met create_task tool

📋 DATUM FORMAT: ISO 8601 (YYYY-MM-DDTHH:mm:ss+02:00)
📋 PRIORITY: LOW, MEDIUM, HIGH, CRITICAL (default: MEDIUM)

💼 CITÖZORG CONTEXT (hoofdactiviteit):
- Flexwerker bemiddeling in zorg
- Hoofdklanten: Prisma, Lunet, SWZ, SIZA
- Elke klant heeft 10-15 sub-locaties
- 89 actieve flexwerkers
- Zorgtypen: EVB, EMB, LVB, NAH
- 2025 totaal: 21.359,65 uur
- Tarieven: €7.21-€10.29/uur
- Maandelijkse omzet: €179k-€201k

🎯 GEDRAG:
- Nederlands, direct, actionable
- Emoji's: 🎯📊💡✅⚡
- Focus op business impact
- Verwijs naar concrete data
   - Key points uit eerdere conversaties

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
✅ Belangrijke beslissing wordt genomen
   → Sla meteen op: category: "decision_context", key: "project_x_approach", value: {"decision": "...", "reasoning": "..."}

WANNEER GEBRUIK JE LOG_LEARNING_EVENT:
✅ Gebruiker accepteert je suggestie
   → event_type: "suggestion_accepted", context: {...}, outcome: "success", learning_score: 0.8
✅ Gebruiker wijst je suggestie af
   → event_type: "suggestion_rejected", context: {...}, user_action: {"reason": "..."}, outcome: "failure", learning_score: 0.3
✅ Je detecteert een patroon
   → event_type: "pattern_detected", context: {...}, outcome: "success", learning_score: 0.7
✅ Gebruiker geeft expliciete feedback
   → event_type: "feedback_positive" of "feedback_negative", context: {...}

WANNEER GEBRUIK JE CREATE_BUSINESS_INTELLIGENCE:
✅ Je ziet een bottleneck (bijv. te veel HIGH priority taken tegelijk)
   → intelligence_type: "bottleneck", title: "Prioriteit overload", description: "...", impact_score: 7
✅ Je detecteert optimalisatiemogelijkheid
   → intelligence_type: "optimization_opportunity", title: "Taak batching mogelijk", description: "..."
✅ Je ziet een workflow patroon
   → intelligence_type: "workflow_pattern", title: "Wekelijkse planning cyclus", description: "..."

🔥 GEDRAGSREGEL: Bij ELKE interactie, vraag jezelf af:
1. "Moet ik dit onthouden?" → gebruik save_knowledge
2. "Is dit feedback op mijn suggestie?" → gebruik log_learning_event  
3. "Zie ik een patroon of verbetering?" → gebruik create_business_intelligence

💡 DOE DIT AUTOMATISCH - de gebruiker hoeft niet te vragen!

⚡ JE BENT NIET MEER STATELESS - JE HEBT EEN VOLLEDIG GEHEUGEN & JE MOET HET ACTIEF GEBRUIKEN!

HUIDIGE CONTEXT:
${contextSummary}

📚 KENNISBANK (${fullKnowledgeBase.length} items):
${formatKnowledgeBase()}

${conversationSummary || ''}

🎯 GEBRUIK DE KENNISBANK ACTIEF & WEES PROACTIEF:

📊 BIJ SALARIS/CAO VRAGEN:
Als specifieke CAO-schalen ontbreken voor een client:
1. ✅ GEEF EEN BRUIKBARE INSCHATTING op basis van:
   - Algemene CAO-kennis die je wel hebt
   - Vergelijkbare functies/clients
   - Standaard FWG-schalen en periodieken
   
2. ⚠️ VERMELD ALTIJD:
   "Dit is een indicatie op basis van [bron]. Ik heb de exacte [Client] CAO-data opgevraagd voor een precieze berekening."

3. 🚨 LOG DE KNOWLEDGE GAP & TRIGGER AUTO-HARVESTER:
   
   Gebruik ALTIJD create_business_intelligence EN roep daarna auto_harvest_knowledge aan:
   
   A. Log de gap:
   {
     intelligence_type: "knowledge_gap",
     title: "Ontbrekende CAO data: [Client] - [CAO type]",
     description: "Gebruiker vroeg om [specifieke info], maar kennisbank mist: [details]",
     priority: "high",
     impact_score: 0.8
   }
   
   B. Trigger harvester met specifieke search terms:
   {
     search_topics: [
       "[Client] CAO [type] salarisschalen 2025",
       "[Functie] FWG schaaltabel [Client]",
       "CAO [type] periodieken en tredes actueel"
     ],
     autonomous: true,
     reason: "Auto-triggered door knowledge gap: [korte omschrijving]"
   }

❌ VERBODEN ANTWOORDEN:
- "Ik kan geen berekening maken"
- "Ik heb deze informatie niet"
- "Raadpleeg HR voor details"

✅ CORRECTE AANPAK VOORBEELD:
Vraag: "Wat verdient een sociotherapeut met 5 jaar ervaring bij Lister (32u)?"

Antwoord:
"Op basis van CAO GGZ geldt voor een sociotherapeut met 5 jaar ervaring meestal:
- Functiegroep: FWG 45-50  
- Salaris schaal: €2.870 - €3.863 bruto/maand (36 uur basis)
- Voor 32 uur: circa €2.553 - €3.434 bruto/maand
- Netto: afhankelijk van belastingsituatie, circa €1.900 - €2.500

Dit is een indicatie op basis van de standaard CAO GGZ schalen. Ik heb de exacte Lister CAO-afspraken opgevraagd voor een precieze berekening inclusief eventuele toeslagen en periodieken."

[Vervolgens create_business_intelligence tool gebruiken om de knowledge gap te loggen]

💼 BIJ ANDERE VRAGEN:
- Bij vragen over contracten, tarieven, compliance → Verwijs naar de specifieke kennis hierboven
- Geef exacte details met bronvermelding (bijv. "Volgens contract Lunet...")
- Bij onduidelijkheid: vraag gebruiker om meer training data
- Update usage_count door relevante kennis te gebruiken

Gebruik deze rijke context om intelligente, context-aware antwoorden te geven die echt helpen met productiviteit en taakbeheer. En vergeet niet: je kunt nu DAADWERKELIJK acties uitvoeren!`;

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
          description: "Zoek beschikbare ZZP'ers/professionals op basis van filters. Gebruik dit wanneer gebruiker vraagt om namen van ZZP'ers, wie beschikbaar is, of een lijst van professionals wil. Gebruik dit ALTIJD als de gebruiker vraagt naar specifieke namen of een lijst.",
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
      }
    ];

    // Call Lovable AI Gateway for streaming with tool support
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        tools: tools,
        stream: true,
      }),
    });

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
                          result = { 
                            success: true, 
                            knowledge_id: knowledge.id, 
                            message: `📚 Kennis opgeslagen: ${args.key} (${args.category})` 
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
                            
                            result = {
                              success: true,
                              message: `🤖 Auto-Knowledge-Harvester gestart voor ${args.search_topics.length} onderwerpen`,
                              topics: args.search_topics,
                              harvester_status: harvesterResult
                            };
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

                  // Send done after tool execution
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
          const usedKnowledgeIds = await trackKnowledgeUsage(fullResponse, fullKnowledgeBase, supabaseClient, user.id, messages);
          
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
          
          // ✅ AUTONOMOUS LEARNING: Save chat messages to trigger continuous-learner (non-blocking)
          const conversationId = crypto.randomUUID();
          (async () => {
            try {
              // Get org_id for the user
              const { data: orgData } = await supabaseClient
                .from('user_organizations')
                .select('org_id')
                .eq('user_id', user.id)
                .single();

              if (!orgData?.org_id) {
                console.warn('⚠️ No org_id found for user, skipping chat persistence');
                return;
              }

              // Save user message
              const userMessage = messages[messages.length - 1];
              await supabaseClient.from('chat_messages').insert({
                user_id: user.id,
                conversation_id: conversationId,
                role: 'user',
                content: userMessage.content
              });

              // Save assistant message (triggers continuous-learner via database trigger)
              await supabaseClient.from('chat_messages').insert({
                user_id: user.id,
                conversation_id: conversationId,
                role: 'assistant',
                content: fullResponse,
                metadata: {
                  feedback_enabled: true,
                  knowledge_ids_for_feedback: usedKnowledgeIds
                }
              });

              // Optional: Save conversation context for FASE 2 (usage validation)
              if (usedKnowledgeIds.length > 0) {
                await supabaseClient.from('conversation_context').insert({
                  conversation_id: conversationId,
                  user_id: user.id,
                  category: 'task_management_chat',
                  summary: userMessage.content.substring(0, 500),
                  key_points: {
                    used_knowledge_ids: usedKnowledgeIds,
                    response_length: fullResponse.length,
                    user_question: userMessage.content
                  }
                });
              }

              console.log(`✅ Chat messages saved, conversation_id: ${conversationId}, knowledge used: ${usedKnowledgeIds.length}`);
            } catch (persistError) {
              console.error('❌ Chat persistence error (non-blocking):', persistError);
              // Don't fail the request if persistence fails
            }
          })();
          
          // Send usedKnowledge metadata to client for feedback tracking
          if (usedKnowledgeIds.length > 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              choices: [{
                delta: { 
                  metadata: { 
                    usedKnowledge: usedKnowledgeIds 
                  } 
                },
                index: 0
              }]
            })}\n\n`));
          }
          
          controller.close();
          
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
                execution_time_ms: executionTime,
                model_used: 'google/gemini-2.5-flash',
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                total_tokens: totalTokens,
                estimated_cost_eur: estimatedCost
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
