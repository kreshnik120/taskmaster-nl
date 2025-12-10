// Automatic cleanup of soft-deleted knowledge items older than 30 days
// 🛡️ PROTECTED: High-usage and verified items are NEVER permanently deleted
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Protection thresholds - items meeting these criteria are NEVER permanently deleted
const MIN_USAGE_PROTECTION = 3;  // Items with usage >= 3 are protected
const PROTECTED_STATUSES = ['verified'];  // Verified items are protected

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('🗑️ Starting cleanup of soft-deleted knowledge items...');

    // Find soft-deleted items older than 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: deletedItems, error: fetchError } = await supabase
      .from('ai_knowledge_base')
      .select('id, category, key, deleted_at, deleted_by, deletion_reason, usage_count, validation_status')
      .not('deleted_at', 'is', null)
      .lt('deleted_at', thirtyDaysAgo);

    if (fetchError) throw fetchError;

    if (!deletedItems || deletedItems.length === 0) {
      console.log('✅ No old soft-deleted items to clean up');
      return new Response(JSON.stringify({ 
        success: true,
        cleaned: 0,
        message: 'No items to clean up',
        execution_time_ms: Date.now() - startTime
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🔍 Found ${deletedItems.length} soft-deleted items older than 30 days`);

    // 🛡️ CRITICAL: Filter out protected items
    const protectedItems: any[] = [];
    const itemsToDelete: any[] = [];

    for (const item of deletedItems) {
      const usage = item.usage_count || 0;
      const isHighUsage = usage >= MIN_USAGE_PROTECTION;
      const isVerified = PROTECTED_STATUSES.includes(item.validation_status);
      
      if (isHighUsage || isVerified) {
        protectedItems.push({
          id: item.id,
          key: item.key,
          category: item.category,
          usage_count: usage,
          validation_status: item.validation_status,
          protection_reason: isHighUsage ? `high_usage (${usage})` : 'verified_status'
        });
        
        // 🔄 Auto-restore protected items that were incorrectly deleted
        console.log(`🛡️ Restoring protected item: ${item.key} (usage: ${usage}, status: ${item.validation_status})`);
        await supabase
          .from('ai_knowledge_base')
          .update({
            deleted_at: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id);
      } else {
        itemsToDelete.push(item);
      }
    }

    if (protectedItems.length > 0) {
      console.log(`🛡️ Protected ${protectedItems.length} items from permanent deletion (high-usage/verified)`);
      console.log(`📊 Protected items:`, protectedItems.slice(0, 5).map(p => `${p.key} (usage: ${p.usage_count})`));
    }

    if (itemsToDelete.length === 0) {
      console.log('✅ All items were protected - nothing to permanently delete');
      return new Response(JSON.stringify({ 
        success: true,
        cleaned: 0,
        protected: protectedItems.length,
        restored: protectedItems.length,
        message: `Protected and restored ${protectedItems.length} high-value items`,
        execution_time_ms: Date.now() - startTime
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🗑️ Proceeding to permanently delete ${itemsToDelete.length} zero-value items`);

    const itemIds = itemsToDelete.map((item: any) => item.id);

    // Step 1: Delete embeddings first (batch by 500)
    const batchSize = 500;
    let embeddingDeleteCount = 0;
    
    for (let i = 0; i < itemIds.length; i += batchSize) {
      const batch = itemIds.slice(i, i + batchSize);
      const { error: embeddingError, count } = await supabase
        .from('knowledge_embeddings')
        .delete({ count: 'exact' })
        .in('knowledge_id', batch);

      if (embeddingError) {
        console.error(`⚠️ Error deleting embeddings batch ${i}-${i+batch.length}:`, embeddingError.message);
      } else {
        embeddingDeleteCount += count || 0;
      }
    }
    console.log(`✅ Deleted ${embeddingDeleteCount} embeddings`);

    // Step 2: Delete knowledge versions (batch by 500)
    let versionDeleteCount = 0;
    
    for (let i = 0; i < itemIds.length; i += batchSize) {
      const batch = itemIds.slice(i, i + batchSize);
      const { error: versionsError, count } = await supabase
        .from('ai_knowledge_versions')
        .delete({ count: 'exact' })
        .in('knowledge_id', batch);

      if (versionsError) {
        console.error(`⚠️ Error deleting versions batch ${i}-${i+batch.length}:`, versionsError.message);
      } else {
        versionDeleteCount += count || 0;
      }
    }
    console.log(`✅ Deleted ${versionDeleteCount} version history records`);

    // Step 3: Hard delete the knowledge items (batch by 500)
    let knowledgeDeleteCount = 0;
    
    for (let i = 0; i < itemIds.length; i += batchSize) {
      const batch = itemIds.slice(i, i + batchSize);
      const { error: deleteError, count } = await supabase
        .from('ai_knowledge_base')
        .delete({ count: 'exact' })
        .in('id', batch);

      if (deleteError) {
        console.error(`⚠️ Error deleting knowledge batch ${i}-${i+batch.length}:`, deleteError.message);
        throw deleteError;
      }
      knowledgeDeleteCount += count || 0;
    }
    console.log(`✅ Deleted ${knowledgeDeleteCount} knowledge items`);

    // Log category distribution
    const categoryDistribution = itemsToDelete.reduce((acc: Record<string, number>, item: any) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log(`📊 Deleted categories:`, categoryDistribution);

    // Log to function_call_logs
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id')
      .limit(1);

    if (orgs && orgs.length > 0) {
      await supabase.from('function_call_logs').insert({
        function_name: 'cleanup-deleted-knowledge',
        org_id: orgs[0].id,
        user_id: orgs[0].id,
        success: true,
        execution_time_ms: Date.now() - startTime,
        model_used: 'none'
      });

      // Create a business intelligence alert for tracking
      if (itemsToDelete.length > 10 || protectedItems.length > 0) {
        await supabase.from('business_intelligence').insert({
          org_id: orgs[0].id,
          intelligence_type: 'data_quality',
          title: `Cleanup: ${itemsToDelete.length} verwijderd, ${protectedItems.length} beschermd`,
          description: `Automatische cleanup heeft ${itemsToDelete.length} zero-value items verwijderd en ${protectedItems.length} high-value items hersteld.`,
          severity: 'info',
          status: 'resolved',
          data: {
            category: 'cleanup',
            items_deleted: itemsToDelete.length,
            items_protected: protectedItems.length,
            items_restored: protectedItems.length,
            category_distribution: categoryDistribution,
            protected_items_preview: protectedItems.slice(0, 10)
          }
        });
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      cleaned: itemsToDelete.length,
      protected: protectedItems.length,
      restored: protectedItems.length,
      category_distribution: categoryDistribution,
      execution_time_ms: Date.now() - startTime,
      message: `Cleaned ${itemsToDelete.length} zero-value items, protected/restored ${protectedItems.length} high-value items`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Cleanup error:', error);
    
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
