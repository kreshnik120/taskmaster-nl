import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

// Minimum usage threshold - NEVER delete items with usage >= this value
const MIN_USAGE_PROTECTION = 3;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: orgs } = await supabase
      .from('organizations')
      .select('id')
      .limit(1);

    if (!orgs || orgs.length === 0) {
      throw new Error('No organizations found');
    }

    const orgId = orgs[0].id;
    console.log('🔍 Smart Deduplicator scanning for duplicates...');

    // Get all knowledge items grouped by category
    const { data: allItems } = await supabase
      .from('ai_knowledge_base')
      .select('*')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('confidence_score', { ascending: false })
      .limit(500);

    if (!allItems || allItems.length === 0) {
      return new Response(JSON.stringify({ success: true, duplicates_found: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Group by category for efficient processing
    const itemsByCategory: Record<string, any[]> = {};
    for (const item of allItems) {
      if (!itemsByCategory[item.category]) {
        itemsByCategory[item.category] = [];
      }
      itemsByCategory[item.category].push(item);
    }

    let totalMerged = 0;
    let skippedHighUsage = 0;
    let skippedSelfMerge = 0;
    const mergeLog: any[] = [];

    // Process each category
    for (const [category, items] of Object.entries(itemsByCategory)) {
      if (items.length < 2) continue;

      console.log(`🔍 Checking category: ${category} (${items.length} items)`);

      // Compare items in batches of 10
      for (let i = 0; i < items.length; i += 10) {
        const batch = items.slice(i, Math.min(i + 10, items.length));
        
        // Ask AI to identify duplicates
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
                content: `Je bent een duplicate detection expert. 

Identificeer semantisch vergelijkbare/duplicate items in de lijst.

Voor elk duplicate paar:
1. Bepaal welke versie beter is (hogere confidence, nieuwer, completer)
2. Geef reden voor keuze

Output JSON array:
[
  {
    "item1_id": "uuid",
    "item2_id": "uuid",
    "winner_id": "uuid",
    "loser_id": "uuid",
    "similarity_score": 0.0-1.0,
    "reason": "verklaring"
  }
]

Als er GEEN duplicates zijn, return: []`
              },
              {
                role: 'user',
                content: `Identificeer duplicates in category: ${category}\n\nItems:\n${JSON.stringify(batch.map(b => ({
                  id: b.id,
                  key: b.key,
                  confidence: b.confidence_score,
                  usage_count: b.usage_count || 0,
                  value: typeof b.value === 'object' ? b.value.content : b.value,
                  created_at: b.created_at
                })), null, 2)}`
              }
            ],
          }),
        });

        if (!aiResponse.ok) {
          console.error('AI duplicate detection failed');
          continue;
        }

        const aiData = await aiResponse.json();
        const content = aiData.choices[0].message.content;

        let duplicates;
        try {
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          duplicates = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
        } catch {
          duplicates = [];
        }

        // Process detected duplicates
        for (const dup of duplicates) {
          if (dup.similarity_score >= 0.8) {
            // Find winner and loser items
            const winner = batch.find(b => b.id === dup.winner_id);
            const loser = batch.find(b => b.id === dup.loser_id);
            
            if (!winner || !loser) {
              console.log(`⚠️ Skipping: winner or loser not found`);
              continue;
            }

            // 🛡️ BUG FIX 1: Self-merge detection - NEVER merge item into itself
            if (dup.winner_id === dup.loser_id) {
              console.log(`🚫 Self-merge detected! Skipping: ${dup.winner_id}`);
              skippedSelfMerge++;
              continue;
            }

            // 🛡️ BUG FIX 2: Usage protection - NEVER delete high-usage items
            const loserUsage = loser.usage_count || 0;
            const winnerUsage = winner.usage_count || 0;
            
            if (loserUsage >= MIN_USAGE_PROTECTION) {
              // If loser has higher usage than winner, SWAP them
              if (loserUsage > winnerUsage) {
                console.log(`🔄 Swapping winner/loser: loser has higher usage (${loserUsage} > ${winnerUsage})`);
                const temp = dup.winner_id;
                dup.winner_id = dup.loser_id;
                dup.loser_id = temp;
                // Re-check - now the new loser might also have high usage
                const newLoser = batch.find(b => b.id === dup.loser_id);
                if (newLoser && (newLoser.usage_count || 0) >= MIN_USAGE_PROTECTION) {
                  console.log(`⚠️ Both items have high usage (≥${MIN_USAGE_PROTECTION}), skipping merge`);
                  skippedHighUsage++;
                  continue;
                }
              } else {
                console.log(`⚠️ Skipping: loser has high usage (${loserUsage} >= ${MIN_USAGE_PROTECTION})`);
                skippedHighUsage++;
                continue;
              }
            }
            
            // 🛡️ BUG FIX 3: Verified item protection
            if (loser.validation_status === 'verified') {
              console.log(`⚠️ Skipping: loser is verified`);
              skippedHighUsage++;
              continue;
            }

            // If BOTH items have high confidence (≥0.95), mark as complementary instead of merging
            if (winner.confidence_score >= 0.95 && loser.confidence_score >= 0.95) {
              console.log(`🤝 Skipping merge: both items have high confidence (${winner.confidence_score}, ${loser.confidence_score})`);
              
              // Create complementary relationship instead
              await supabase
                .from('knowledge_relationships')
                .insert({
                  source_knowledge_id: winner.id,
                  target_knowledge_id: loser.id,
                  relationship_type: 'complementary',
                  confidence_score: dup.similarity_score,
                  detected_by: 'smart-deduplicator',
                  context: `High confidence items (${winner.confidence_score}, ${loser.confidence_score}) with ${Math.round(dup.similarity_score * 100)}% similarity`
                });
              
              continue;
            }

            console.log(`🔄 Merging duplicate: ${dup.loser_id} -> ${dup.winner_id}`);

            // Soft delete the loser
            const { error } = await supabase
              .from('ai_knowledge_base')
              .update({
                deleted_at: new Date().toISOString(),
                deleted_by: 'smart-deduplicator',
                deletion_reason: {
                  reason: 'Merged into better version',
                  merged_into: dup.winner_id,
                  similarity: dup.similarity_score,
                  ai_reason: dup.reason,
                  auto_deduplicated: true,
                  loser_usage: loserUsage,
                  winner_usage: winnerUsage
                }
              })
              .eq('id', dup.loser_id);

            if (!error) {
              totalMerged++;
              mergeLog.push({
                category,
                winner: dup.winner_id,
                loser: dup.loser_id,
                loser_usage: loserUsage,
                winner_usage: winnerUsage,
                reason: dup.reason
              });

              // Log learning event
              await supabase
                .from('ai_learning_events')
                .insert({
                  user_id: '00000000-0000-0000-0000-000000000000',
                  org_id: orgId,
                  event_type: 'deduplication',
                  context: {
                    category,
                    duplicate_pair: [dup.item1_id, dup.item2_id],
                    winner: dup.winner_id,
                    loser_usage: loserUsage,
                    winner_usage: winnerUsage,
                    similarity: dup.similarity_score
                  },
                  outcome: 'success',
                  learning_score: dup.similarity_score,
                  applied_to_knowledge_base: true
                });
            }
          }
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Log function call
    await supabase.from('function_call_logs').insert({
      org_id: orgId,
      user_id: orgId,
      function_name: 'smart-deduplicator',
      success: true,
      execution_time_ms: Math.floor(Date.now() - startTime),
      model_used: 'google/gemini-2.5-flash'
    });

    console.log(`✅ Deduplication complete: ${totalMerged} merged, ${skippedHighUsage} skipped (high-usage/verified), ${skippedSelfMerge} skipped (self-merge)`);

    return new Response(JSON.stringify({
      success: true,
      items_scanned: allItems.length,
      categories_processed: Object.keys(itemsByCategory).length,
      duplicates_merged: totalMerged,
      skipped_high_usage: skippedHighUsage,
      skipped_self_merge: skippedSelfMerge,
      merge_log: mergeLog
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Smart Deduplicator error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
