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
    const { knowledgeId, versionNumber } = await req.json();
    
    if (!knowledgeId) {
      return new Response(JSON.stringify({ error: 'knowledgeId is verplicht' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authenticatie vereist' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
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

    // Verify user has access to this knowledge item
    const { data: knowledgeItem } = await supabaseClient
      .from('ai_knowledge_base')
      .select(`
        *,
        user_organizations!inner(org_id)
      `)
      .eq('id', knowledgeId)
      .eq('user_organizations.user_id', user.id)
      .single();

    if (!knowledgeItem) {
      return new Response(JSON.stringify({ error: 'Kennisitem niet gevonden of geen toegang' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the target version to rollback to
    let targetVersion;
    if (versionNumber) {
      // Rollback to specific version
      const { data } = await supabaseClient
        .from('ai_knowledge_versions')
        .select('*')
        .eq('knowledge_id', knowledgeId)
        .eq('version_number', versionNumber)
        .single();
      
      targetVersion = data;
    } else {
      // Rollback to previous version
      const { data } = await supabaseClient
        .from('ai_knowledge_versions')
        .select('*')
        .eq('knowledge_id', knowledgeId)
        .order('version_number', { ascending: false })
        .limit(2);
      
      if (data && data.length >= 2) {
        targetVersion = data[1]; // Second most recent = previous version
      }
    }

    if (!targetVersion) {
      return new Response(JSON.stringify({ error: 'Geen eerdere versie gevonden om naar terug te rollen' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🔄 Rolling back knowledge item ${knowledgeId} to version ${targetVersion.version_number}`);

    // Restore the knowledge item to the target version
    const { error: updateError } = await supabaseClient
      .from('ai_knowledge_base')
      .update({
        category: targetVersion.category,
        key: targetVersion.key,
        value: targetVersion.value,
        confidence_score: targetVersion.confidence_score,
        deleted_at: null, // Undelete if it was deleted
        updated_at: new Date().toISOString()
      })
      .eq('id', knowledgeId);

    if (updateError) {
      throw updateError;
    }

    // Log the rollback in learning events
    await supabaseClient
      .from('ai_learning_events')
      .insert({
        user_id: user.id,
        org_id: knowledgeItem.org_id,
        event_type: 'rollback',
        context: {
          knowledge_id: knowledgeId,
          rolled_back_to_version: targetVersion.version_number,
          category: targetVersion.category,
          key: targetVersion.key
        },
        outcome: 'success',
        learning_score: 0.8,
        applied_to_knowledge_base: true
      });

    console.log(`✅ Successfully rolled back to version ${targetVersion.version_number}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Teruggerold naar versie ${targetVersion.version_number}`,
        version: targetVersion
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in rollback-knowledge:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
