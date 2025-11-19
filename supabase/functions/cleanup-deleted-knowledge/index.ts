// Automatic cleanup of soft-deleted knowledge items older than 30 days
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      .select('id, category, key, deleted_at, deleted_by, deletion_reason')
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

    console.log(`🔍 Found ${deletedItems.length} items to permanently delete`);

    const itemIds = deletedItems.map((item: any) => item.id);

    // Step 1: Delete embeddings first
    const { error: embeddingError } = await supabase
      .from('knowledge_embeddings')
      .delete()
      .in('knowledge_id', itemIds);

    if (embeddingError) {
      console.error('⚠️ Error deleting embeddings:', embeddingError);
      // Continue anyway - embeddings might not exist
    } else {
      console.log(`✅ Deleted embeddings for ${itemIds.length} items`);
    }

    // Step 2: Delete knowledge versions
    const { error: versionsError } = await supabase
      .from('ai_knowledge_versions')
      .delete()
      .in('knowledge_id', itemIds);

    if (versionsError) {
      console.error('⚠️ Error deleting versions:', versionsError);
    } else {
      console.log(`✅ Deleted version history for ${itemIds.length} items`);
    }

    // Step 3: Hard delete the knowledge items
    const { error: deleteError } = await supabase
      .from('ai_knowledge_base')
      .delete()
      .in('id', itemIds);

    if (deleteError) throw deleteError;

    console.log(`🗑️ Permanently deleted ${deletedItems.length} knowledge items`);

    // Log category distribution
    const categoryDistribution = deletedItems.reduce((acc: Record<string, number>, item: any) => {
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
    }

    // Create a business intelligence alert for tracking
    if (orgs && orgs.length > 0 && deletedItems.length > 10) {
      await supabase.from('business_intelligence').insert({
        org_id: orgs[0].id,
        intelligence_type: 'data_quality',
        title: `Cleanup: ${deletedItems.length} oude items verwijderd`,
        description: `Automatische cleanup heeft ${deletedItems.length} soft-deleted items permanent verwijderd die ouder waren dan 30 dagen.`,
        severity: 'info',
        status: 'resolved',
        data: {
          category: 'cleanup',
          items_deleted: deletedItems.length,
          category_distribution: categoryDistribution,
          oldest_item_deleted_at: deletedItems[0].deleted_at
        }
      });
    }

    return new Response(JSON.stringify({ 
      success: true,
      cleaned: deletedItems.length,
      category_distribution: categoryDistribution,
      execution_time_ms: Date.now() - startTime,
      message: `Successfully cleaned up ${deletedItems.length} old deleted items`
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
