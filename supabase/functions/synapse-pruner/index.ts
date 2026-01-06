// FASE 3: Synapse Pruning - Automatic cleanup of weak/unused relationships
// Force deploy: 2026-01-06T16:10:00Z
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();

  try {
    const supabase = createAdminClient();

    console.log('🧹 Synapse Pruner starting...');

    // Find weak synapses: usage_count = 0 AND older than 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: weakSynapses, error: fetchError } = await supabase
      .from('knowledge_relationships')
      .select('id, created_at, usage_count, relationship_type')
      .eq('usage_count', 0)
      .lt('created_at', thirtyDaysAgo);

    if (fetchError) throw fetchError;

    if (!weakSynapses || weakSynapses.length === 0) {
      console.log('✅ No weak synapses to prune');
      return jsonResponse({ 
        success: true,
        pruned: 0,
        message: 'No weak synapses found',
        execution_time_ms: Date.now() - startTime
      });
    }

    console.log(`🔍 Found ${weakSynapses.length} weak synapses (unused for 30+ days)`);

    // Delete weak synapses
    const { error: deleteError } = await supabase
      .from('knowledge_relationships')
      .delete()
      .in('id', weakSynapses.map((s: any) => s.id));

    if (deleteError) throw deleteError;

    // Log type distribution of pruned synapses
    const typeDistribution = weakSynapses.reduce((acc: Record<string, number>, s: any) => {
      acc[s.relationship_type] = (acc[s.relationship_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log(`🧹 Pruned ${weakSynapses.length} weak synapses`);
    console.log(`📊 Pruned types:`, typeDistribution);

    // Log to function_call_logs
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id')
      .limit(1);

    if (orgs && orgs.length > 0) {
      await supabase.from('function_call_logs').insert({
        function_name: 'synapse-pruner',
        org_id: orgs[0].id,
        user_id: orgs[0].id,
        success: true,
        execution_time_ms: Date.now() - startTime,
        model_used: 'none'
      });
    }

    return jsonResponse({ 
      success: true,
      pruned: weakSynapses.length,
      type_distribution: typeDistribution,
      execution_time_ms: Date.now() - startTime,
      message: `Successfully pruned ${weakSynapses.length} weak synapses`
    });

  } catch (error) {
    console.error('❌ Synapse Pruner error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
