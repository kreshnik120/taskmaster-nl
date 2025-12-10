import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createAdminClient();

    console.log('🧹 Starting cleanup of low-stability knowledge items...');

    // Calculate the cutoff date (7 days ago)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Find items to cleanup
    const { data: itemsToDelete, error: selectError } = await supabase
      .from('ai_knowledge_base')
      .select('id, key, category, stability_score, observation_count, created_at, source')
      .lt('stability_score', 0.4)
      .lt('observation_count', 3)
      .eq('requires_verification', true)
      .is('deleted_at', null)
      .lt('created_at', sevenDaysAgo.toISOString());

    if (selectError) {
      console.error('❌ Error selecting items:', selectError);
      return errorResponse(selectError.message, 500);
    }

    if (!itemsToDelete || itemsToDelete.length === 0) {
      console.log('✅ No low-stability items found for cleanup');
      return jsonResponse({ 
        message: 'No items to clean up',
        deleted_count: 0 
      });
    }

    console.log(`📊 Found ${itemsToDelete.length} items to cleanup`);

    // Group by category for reporting
    const categoryBreakdown = itemsToDelete.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Soft-delete the items
    const { error: deleteError } = await supabase
      .from('ai_knowledge_base')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: null,
        deletion_reason: {
          reason: 'Automatic cleanup: low stability score',
          criteria: {
            stability_score: '< 0.4',
            observation_count: '< 3',
            requires_verification: true,
            age_days: 7
          },
          deleted_at: new Date().toISOString()
        }
      })
      .in('id', itemsToDelete.map(item => item.id));

    if (deleteError) {
      console.error('❌ Error soft-deleting items:', deleteError);
      return errorResponse(deleteError.message, 500);
    }

    console.log(`✅ Successfully soft-deleted ${itemsToDelete.length} items`);
    console.log('📊 Category breakdown:', categoryBreakdown);

    // Create business intelligence alert if significant cleanup (>5 items)
    if (itemsToDelete.length > 5) {
      const { data: orgData } = await supabase
        .from('ai_knowledge_base')
        .select('org_id')
        .eq('id', itemsToDelete[0].id)
        .single();

      if (orgData) {
        await supabase
          .from('business_intelligence')
          .insert({
            org_id: orgData.org_id,
            intelligence_type: 'knowledge_cleanup',
            title: `Auto-cleanup: ${itemsToDelete.length} low-stability items removed`,
            description: `Automatic cleanup removed ${itemsToDelete.length} knowledge items with stability_score < 0.5 that were unverified for >7 days`,
            severity: itemsToDelete.length > 20 ? 'high' : 'medium',
            status: 'active',
            priority: 'medium',
            data: {
              deleted_count: itemsToDelete.length,
              category_breakdown: categoryBreakdown,
              cleanup_criteria: {
                stability_threshold: 0.5,
                age_days: 7,
                requires_verification: true
              },
              items_deleted: itemsToDelete.map(item => ({
                key: item.key,
                category: item.category,
                stability_score: item.stability_score,
                age_days: Math.floor((Date.now() - new Date(item.created_at).getTime()) / (1000 * 60 * 60 * 24))
              }))
            }
          });
      }
    }

    return jsonResponse({
      success: true,
      deleted_count: itemsToDelete.length,
      category_breakdown: categoryBreakdown,
      message: `Successfully cleaned up ${itemsToDelete.length} low-stability knowledge items`
    });

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unknown error occurred', 500);
  }
});
