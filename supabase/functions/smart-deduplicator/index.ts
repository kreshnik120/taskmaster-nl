import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';
import { softDeleteKnowledge } from '../_shared/knowledge-crud.ts';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

// Configuration - Optimized for speed
const CONFIG = {
  MAX_ITEMS_PER_RUN: 50,          // Max items to process per run (was unlimited)
  BATCH_SIZE: 20,                  // Items per AI call (was 10)
  DELAY_BETWEEN_BATCHES_MS: 200,   // Delay between batches (was 1000)
  MIN_CATEGORY_SIZE: 5,            // Skip categories with fewer items
  MIN_USAGE_PROTECTION: 3,         // Never delete items with usage >= this
  MIN_SIMILARITY_THRESHOLD: 0.8,   // Minimum similarity for merging
};

interface DeduplicatorState {
  id: string;
  org_id: string;
  last_run_at: string;
  last_processed_id: string | null;
  items_checked: number;
  duplicates_found: number;
  total_merged_lifetime: number;
  avg_run_duration_ms: number;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const startTime = Date.now();
    const supabase = createAdminClient();

    // Get organization
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id')
      .limit(1);

    if (!orgs || orgs.length === 0) {
      throw new Error('No organizations found');
    }

    const orgId = orgs[0].id;
    console.log('🔍 Smart Deduplicator v2.0 - Incremental Mode');

    // Get or create state for incremental processing
    let { data: state } = await supabase
      .from('deduplicator_state')
      .select('*')
      .eq('org_id', orgId)
      .single();

    if (!state) {
      // First run - create state
      const { data: newState } = await supabase
        .from('deduplicator_state')
        .insert({
          org_id: orgId,
          last_run_at: new Date(0).toISOString(), // Start from beginning
          items_checked: 0,
          duplicates_found: 0,
          total_merged_lifetime: 0,
          avg_run_duration_ms: 0
        })
        .select()
        .single();
      state = newState as DeduplicatorState;
    }

    const lastRunAt = state?.last_run_at || new Date(0).toISOString();
    console.log(`📅 Last run: ${lastRunAt}`);

    // INCREMENTAL: Only get items modified since last run
    const { data: newItems, error: queryError } = await supabase
      .from('ai_knowledge_base')
      .select('*')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .gt('updated_at', lastRunAt)
      .order('updated_at', { ascending: true })
      .limit(CONFIG.MAX_ITEMS_PER_RUN);

    if (queryError) {
      throw new Error(`Query failed: ${queryError.message}`);
    }

    // Early exit if no new items
    if (!newItems || newItems.length === 0) {
      const runDuration = Date.now() - startTime;
      console.log(`✅ No new items since last run - skipping (${runDuration}ms)`);
      
      // Update state with run timestamp
      await supabase
        .from('deduplicator_state')
        .update({ 
          last_run_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('org_id', orgId);

      return jsonResponse({ 
        success: true, 
        mode: 'incremental',
        items_scanned: 0, 
        duplicates_merged: 0,
        duration_ms: runDuration,
        message: 'No new items to process'
      });
    }

    console.log(`📊 Found ${newItems.length} items modified since last run`);

    // Get all active items for comparison (only from categories with new items)
    const categoriesWithNewItems = [...new Set(newItems.map(i => i.category))];
    
    const { data: allItems } = await supabase
      .from('ai_knowledge_base')
      .select('*')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .in('category', categoriesWithNewItems)
      .order('confidence_score', { ascending: false });

    if (!allItems || allItems.length === 0) {
      return jsonResponse({ success: true, duplicates_found: 0, duration_ms: Date.now() - startTime });
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
    let totalChecked = 0;
    let skippedHighUsage = 0;
    let skippedSelfMerge = 0;
    let skippedSmallCategory = 0;
    const mergeLog: any[] = [];

    // Process each category with new items
    for (const [category, items] of Object.entries(itemsByCategory)) {
      // Skip small categories - unlikely to have duplicates
      if (items.length < CONFIG.MIN_CATEGORY_SIZE) {
        console.log(`⏭️ Skipping category: ${category} (only ${items.length} items < ${CONFIG.MIN_CATEGORY_SIZE})`);
        skippedSmallCategory++;
        continue;
      }

      console.log(`🔍 Checking category: ${category} (${items.length} items)`);

      // Process in larger batches for efficiency
      for (let i = 0; i < items.length; i += CONFIG.BATCH_SIZE) {
        const batch = items.slice(i, Math.min(i + CONFIG.BATCH_SIZE, items.length));
        totalChecked += batch.length;
        
        // Ask AI to identify duplicates
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-lite', // Faster model for simple comparison
            messages: [
              {
                role: 'system',
                content: `Je bent een duplicate detection expert. Identificeer semantisch vergelijkbare/duplicate items.

Voor elk duplicate paar:
1. Bepaal winner (hogere confidence, nieuwer, completer)
2. Geef korte reden

Output JSON array (GEEN markdown):
[{"item1_id":"uuid","item2_id":"uuid","winner_id":"uuid","loser_id":"uuid","similarity_score":0.0-1.0,"reason":"kort"}]

Als GEEN duplicates: []`
              },
              {
                role: 'user',
                content: `Category: ${category}\n\nItems:\n${JSON.stringify(batch.map(b => ({
                  id: b.id,
                  key: b.key,
                  confidence: b.confidence_score,
                  usage: b.usage_count || 0,
                  value: typeof b.value === 'object' ? (b.value.content || JSON.stringify(b.value).slice(0, 200)) : String(b.value).slice(0, 200)
                })), null, 2)}`
              }
            ],
          }),
        });

        if (!aiResponse.ok) {
          console.error(`AI call failed: ${aiResponse.status}`);
          continue;
        }

        const aiData = await aiResponse.json();
        const content = aiData.choices[0]?.message?.content || '[]';

        let duplicates;
        try {
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          duplicates = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
        } catch {
          duplicates = [];
        }

        // Process detected duplicates
        for (const dup of duplicates) {
          if (dup.similarity_score >= CONFIG.MIN_SIMILARITY_THRESHOLD) {
            const winner = batch.find(b => b.id === dup.winner_id);
            const loser = batch.find(b => b.id === dup.loser_id);
            
            if (!winner || !loser) continue;

            // Self-merge protection
            if (dup.winner_id === dup.loser_id) {
              skippedSelfMerge++;
              continue;
            }

            // Usage protection
            const loserUsage = loser.usage_count || 0;
            const winnerUsage = winner.usage_count || 0;
            
            if (loserUsage >= CONFIG.MIN_USAGE_PROTECTION) {
              if (loserUsage > winnerUsage) {
                // Swap winner/loser
                const temp = dup.winner_id;
                dup.winner_id = dup.loser_id;
                dup.loser_id = temp;
                const newLoser = batch.find(b => b.id === dup.loser_id);
                if (newLoser && (newLoser.usage_count || 0) >= CONFIG.MIN_USAGE_PROTECTION) {
                  skippedHighUsage++;
                  continue;
                }
              } else {
                skippedHighUsage++;
                continue;
              }
            }
            
            // Verified item protection
            if (loser.validation_status === 'verified') {
              skippedHighUsage++;
              continue;
            }

            // High confidence items - create relationship instead
            if (winner.confidence_score >= 0.95 && loser.confidence_score >= 0.95) {
              await supabase
                .from('knowledge_relationships')
                .insert({
                  source_knowledge_id: winner.id,
                  target_knowledge_id: loser.id,
                  relationship_type: 'complementary',
                  confidence_score: dup.similarity_score,
                  detected_by: 'smart-deduplicator-v2',
                  context: `High confidence items with ${Math.round(dup.similarity_score * 100)}% similarity`
                });
              continue;
            }

            // Soft delete the loser
            try {
              await softDeleteKnowledge(supabase as any, dup.loser_id, {
                reason: 'Merged into better version',
                deletedBy: 'smart-deduplicator-v2',
                metadata: {
                  merged_into: dup.winner_id,
                  similarity: dup.similarity_score,
                  ai_reason: dup.reason
                }
              });
              
              totalMerged++;
              mergeLog.push({
                category,
                winner: dup.winner_id,
                loser: dup.loser_id,
                reason: dup.reason
              });

              // Log learning event
              await supabase
                .from('ai_learning_events')
                .insert({
                  user_id: '00000000-0000-0000-0000-000000000000',
                  org_id: orgId,
                  event_type: 'deduplication',
                  context: { category, winner: dup.winner_id, loser: dup.loser_id },
                  outcome: 'success',
                  learning_score: dup.similarity_score,
                  applied_to_knowledge_base: true
                });
            } catch (e) {
              console.error(`Failed to delete ${dup.loser_id}:`, e);
            }
          }
        }

        // Reduced rate limiting
        if (i + CONFIG.BATCH_SIZE < items.length) {
          await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_BETWEEN_BATCHES_MS));
        }
      }
    }

    const runDuration = Date.now() - startTime;

    // Update state with new run info
    const currentLifetime = (state?.total_merged_lifetime || 0) + totalMerged;
    const currentAvg = state?.avg_run_duration_ms || runDuration;
    const newAvg = Math.round((currentAvg + runDuration) / 2);

    await supabase
      .from('deduplicator_state')
      .update({
        last_run_at: new Date().toISOString(),
        items_checked: totalChecked,
        duplicates_found: totalMerged,
        total_merged_lifetime: currentLifetime,
        avg_run_duration_ms: newAvg,
        updated_at: new Date().toISOString()
      })
      .eq('org_id', orgId);

    // Log function call
    await supabase.from('function_call_logs').insert({
      org_id: orgId,
      user_id: orgId,
      function_name: 'smart-deduplicator',
      success: true,
      execution_time_ms: runDuration,
      model_used: 'google/gemini-2.5-flash-lite'
    });

    console.log(`✅ Deduplication complete in ${runDuration}ms: ${totalMerged} merged, ${skippedHighUsage} skipped (protected), ${skippedSmallCategory} categories skipped`);

    return jsonResponse({
      success: true,
      mode: 'incremental',
      items_scanned: totalChecked,
      new_items_found: newItems.length,
      categories_processed: Object.keys(itemsByCategory).length - skippedSmallCategory,
      categories_skipped: skippedSmallCategory,
      duplicates_merged: totalMerged,
      skipped_high_usage: skippedHighUsage,
      skipped_self_merge: skippedSelfMerge,
      duration_ms: runDuration,
      lifetime_merged: currentLifetime,
      merge_log: mergeLog.slice(0, 10) // Limit log size
    });

  } catch (error) {
    console.error('❌ Smart Deduplicator error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
