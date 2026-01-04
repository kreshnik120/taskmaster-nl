// Cache Warmer - Proactively refresh expiring cache entries
// Prevents cache miss storms by pre-warming entries before expiry
import { corsHeaders, handleCors, createAdminClient } from '../_shared/core.ts';

const VERSION = '1.0.0';

interface CacheEntry {
  id: string;
  question: string;
  question_hash: string;
  org_id: string;
  expires_at: string;
  hit_count: number;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();
  console.log(`🔥 Cache Warmer v${VERSION} starting...`);

  try {
    const supabase = createAdminClient();

    // Find cache entries expiring in the next 4 hours with high hit counts
    const expiryWindow = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const { data: expiringEntries, error: fetchError } = await supabase
      .from('ai_response_cache')
      .select('id, question, question_hash, org_id, expires_at, hit_count')
      .gte('expires_at', now)
      .lte('expires_at', expiryWindow)
      .gte('hit_count', 3) // Only warm frequently-used entries
      .order('hit_count', { ascending: false })
      .limit(20);

    if (fetchError) {
      console.error('❌ Failed to fetch expiring cache:', fetchError);
      throw fetchError;
    }

    console.log(`📊 Found ${expiringEntries?.length || 0} expiring high-value cache entries`);

    // Also clean up expired entries
    const { data: deletedData, error: deleteError } = await supabase
      .from('ai_response_cache')
      .delete()
      .lt('expires_at', now)
      .select('id');

    const deletedCount = deletedData?.length || 0;

    if (deleteError) {
      console.warn('⚠️ Failed to cleanup expired cache:', deleteError);
    } else {
      console.log(`🗑️ Cleaned up ${deletedCount} expired cache entries`);
    }

    let refreshedCount = 0;
    const refreshErrors: string[] = [];

    // Re-warm expiring entries by extending their TTL
    if (expiringEntries && expiringEntries.length > 0) {
      const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h extension

      for (const entry of expiringEntries) {
        const { error: updateError } = await supabase
          .from('ai_response_cache')
          .update({ 
            expires_at: newExpiry,
            // Reset hit count to prevent infinite extension
            hit_count: Math.floor(entry.hit_count * 0.8) 
          })
          .eq('id', entry.id);

        if (updateError) {
          refreshErrors.push(`${entry.id}: ${updateError.message}`);
        } else {
          refreshedCount++;
        }
      }

      console.log(`✅ Refreshed ${refreshedCount}/${expiringEntries.length} cache entries`);
    }

    // Get current cache stats
    const { count: totalCount } = await supabase
      .from('ai_response_cache')
      .select('*', { count: 'exact', head: true })
      .gte('expires_at', now);

    const { data: hitStats } = await supabase
      .from('ai_response_cache')
      .select('hit_count')
      .gte('expires_at', now);

    const totalHits = hitStats?.reduce((sum, e) => sum + e.hit_count, 0) || 0;
    const avgHitRate = hitStats?.length ? (totalHits / hitStats.length).toFixed(1) : '0';

    const duration = Date.now() - startTime;

    // Log execution
    await supabase.from('function_call_logs').insert({
      function_name: 'cache-warmer',
      duration_ms: duration,
      metadata: {
        version: VERSION,
        expiring_found: expiringEntries?.length || 0,
        refreshed: refreshedCount,
        deleted: deletedCount || 0,
        total_active: totalCount || 0,
        avg_hit_rate: avgHitRate,
        errors: refreshErrors.length
      },
      org_id: '550e8400-e29b-41d4-a716-446655440000'
    });

    console.log(`⏱️ Cache Warmer completed in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        version: VERSION,
        duration_ms: duration,
        stats: {
          expiring_found: expiringEntries?.length || 0,
          refreshed: refreshedCount,
          expired_cleaned: deletedCount || 0,
          total_active_entries: totalCount || 0,
          average_hit_rate: parseFloat(avgHitRate)
        },
        errors: refreshErrors.length > 0 ? refreshErrors : undefined
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('❌ Cache Warmer error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - startTime
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
