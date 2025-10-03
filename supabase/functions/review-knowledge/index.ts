import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authenticatie vereist' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey || !lovableApiKey) {
      throw new Error('Server configuration error');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(accessToken);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Authenticatie gefaald' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user's org
    const { data: userOrg } = await supabaseClient
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    if (!userOrg) {
      return new Response(JSON.stringify({ error: 'Geen organisatie gevonden' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('🔍 Starting automated knowledge review for org:', userOrg.org_id);

    // STEP 1: Review items that need review
    const { data: needsReviewItems } = await supabaseClient
      .from('ai_knowledge_base')
      .select('*')
      .eq('org_id', userOrg.org_id)
      .eq('needs_review', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(50);

    let reviewedCount = 0;
    let autoResolvedCount = 0;
    let markedForDeletionCount = 0;

    if (needsReviewItems && needsReviewItems.length > 0) {
      console.log(`📋 Found ${needsReviewItems.length} items needing review`);

      for (const item of needsReviewItems) {
        // AI re-validation
        const aiPrompt = `Hervalideer deze kennisitem:
        
Categorie: ${item.category}
Key: ${item.key}
Value: ${JSON.stringify(item.value)}
Confidence: ${item.confidence_score}
Bron: ${item.source || 'onbekend'}
Gebruik: ${item.usage_count || 0}x
Laatste gebruik: ${item.last_used_at || 'nooit'}

Bepaal:
1. Is deze informatie nog actueel en relevant?
2. Is er conflicterende informatie in de kennisbank?
3. Moet dit item behouden, bijgewerkt, of verwijderd worden?

Geef een JSON response met:
{
  "action": "keep" | "update" | "delete",
  "confidence": 0.0-1.0,
  "reason": "verklaring",
  "suggested_updates": {} // alleen bij "update"
}`;

        try {
          const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${lovableApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [
                { role: 'system', content: 'Je bent een AI kennisbank validator. Geef alleen JSON terug.' },
                { role: 'user', content: aiPrompt }
              ],
              temperature: 0.3,
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            const content = aiData.choices[0]?.message?.content || '{}';
            
            // Parse AI response
            let decision;
            try {
              const jsonMatch = content.match(/\{[\s\S]*\}/);
              decision = jsonMatch ? JSON.parse(jsonMatch[0]) : { action: 'keep', confidence: 0.5, reason: 'Parse error' };
            } catch {
              decision = { action: 'keep', confidence: 0.5, reason: 'Parse error' };
            }

            console.log(`✅ AI review for ${item.key}: ${decision.action} (confidence: ${decision.confidence})`);

            // Execute AI decision
            if (decision.action === 'delete' && decision.confidence > 0.8) {
              // Soft delete
              await supabaseClient
                .from('ai_knowledge_base')
                .update({
                  deleted_at: new Date().toISOString(),
                  deleted_by: 'ai_automated_review',
                  deletion_reason: { reason: decision.reason, confidence: decision.confidence }
                })
                .eq('id', item.id);
              
              markedForDeletionCount++;
              console.log(`🗑️ Marked for deletion: ${item.key}`);
            } else if (decision.action === 'update' && decision.suggested_updates) {
              // Update with suggested changes
              await supabaseClient
                .from('ai_knowledge_base')
                .update({
                  value: { ...item.value, ...decision.suggested_updates },
                  confidence_score: decision.confidence,
                  needs_review: false,
                  last_reviewed_at: new Date().toISOString(),
                  review_count: (item.review_count || 0) + 1,
                  auto_reviewed_at: new Date().toISOString()
                })
                .eq('id', item.id);
              
              autoResolvedCount++;
              console.log(`🔄 Updated: ${item.key}`);
            } else {
              // Keep but mark as reviewed
              await supabaseClient
                .from('ai_knowledge_base')
                .update({
                  needs_review: false,
                  confidence_score: Math.max(item.confidence_score || 0.5, decision.confidence),
                  last_reviewed_at: new Date().toISOString(),
                  review_count: (item.review_count || 0) + 1,
                  auto_reviewed_at: new Date().toISOString()
                })
                .eq('id', item.id);
              
              reviewedCount++;
              console.log(`✓ Kept: ${item.key}`);
            }

            // Log learning event
            await supabaseClient
              .from('ai_learning_events')
              .insert({
                user_id: user.id,
                org_id: userOrg.org_id,
                event_type: 'automated_review',
                context: {
                  knowledge_id: item.id,
                  category: item.category,
                  key: item.key,
                  ai_decision: decision
                },
                outcome: 'success',
                learning_score: decision.confidence,
                applied_to_knowledge_base: true
              });
          }
        } catch (error) {
          console.error(`❌ Error reviewing ${item.key}:`, error);
        }
      }
    }

    // STEP 2: Auto-cleanup old duplicates (STRENGTHENED)
    const { data: oldDuplicates } = await supabaseClient
      .from('ai_knowledge_base')
      .select('*, created_at')
      .eq('org_id', userOrg.org_id)
      .is('deleted_at', null)
      .lt('confidence_score', 0.5)
      .lt('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()); // Older than 14 days

    let cleanedUpCount = 0;
    if (oldDuplicates && oldDuplicates.length > 0) {
      console.log(`🧹 Found ${oldDuplicates.length} old low-confidence items for cleanup`);
      
      for (const item of oldDuplicates) {
        // Check if there's a better version
        const { data: betterVersions } = await supabaseClient
          .from('ai_knowledge_base')
          .select('id')
          .eq('org_id', userOrg.org_id)
          .eq('category', item.category)
          .eq('key', item.key)
          .is('deleted_at', null)
          .gt('confidence_score', item.confidence_score)
          .limit(1);

        if (betterVersions && betterVersions.length > 0) {
          // Soft delete the old version
          await supabaseClient
            .from('ai_knowledge_base')
            .update({
              deleted_at: new Date().toISOString(),
              deleted_by: 'ai_auto_cleanup',
              deletion_reason: { reason: 'Automatisch opgeschoond: betere versie beschikbaar', auto_cleanup: true }
            })
            .eq('id', item.id);
          
          cleanedUpCount++;
          console.log(`🧹 Cleaned up old duplicate: ${item.key}`);
        }
      }
    }

    // STEP 3: Update performance metrics
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    // Calculate success rate
    const totalProcessed = reviewedCount + autoResolvedCount + markedForDeletionCount;
    const successRate = totalProcessed > 0 ? (reviewedCount + autoResolvedCount) / totalProcessed : 1;

    await supabaseClient
      .from('ai_performance_metrics')
      .upsert({
        org_id: userOrg.org_id,
        metric_type: 'auto_resolve_success_rate',
        value: successRate,
        sample_size: totalProcessed,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        metadata: {
          reviewed: reviewedCount,
          auto_resolved: autoResolvedCount,
          marked_for_deletion: markedForDeletionCount,
          cleaned_up: cleanedUpCount
        }
      }, {
        onConflict: 'org_id,metric_type,period_start'
      });

    console.log('✅ Review completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        stats: {
          reviewed: reviewedCount,
          auto_resolved: autoResolvedCount,
          marked_for_deletion: markedForDeletionCount,
          cleaned_up: cleanedUpCount,
          total_processed: totalProcessed
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in review-knowledge:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

