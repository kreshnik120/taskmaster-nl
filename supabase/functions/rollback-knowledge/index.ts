import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { knowledgeId, versionNumber } = await req.json();
    
    if (!knowledgeId) {
      return errorResponse('knowledgeId is verplicht', 400);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Authenticatie vereist', 401);
    }

    const supabase = createAdminClient();

    // Get user from auth header
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
    
    if (userError || !user) {
      return errorResponse('Authenticatie gefaald', 401);
    }

    // Verify user has access to this knowledge item
    const { data: knowledgeItem } = await supabase
      .from('ai_knowledge_base')
      .select(`
        *,
        user_organizations!inner(org_id)
      `)
      .eq('id', knowledgeId)
      .eq('user_organizations.user_id', user.id)
      .single();

    if (!knowledgeItem) {
      return errorResponse('Kennisitem niet gevonden of geen toegang', 404);
    }

    // Get the target version to rollback to
    let targetVersion;
    if (versionNumber) {
      // Rollback to specific version
      const { data } = await supabase
        .from('ai_knowledge_versions')
        .select('*')
        .eq('knowledge_id', knowledgeId)
        .eq('version_number', versionNumber)
        .single();
      
      targetVersion = data;
    } else {
      // Rollback to previous version
      const { data } = await supabase
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
      return errorResponse('Geen eerdere versie gevonden om naar terug te rollen', 404);
    }

    console.log(`🔄 Rolling back knowledge item ${knowledgeId} to version ${targetVersion.version_number}`);

    // Restore the knowledge item to the target version
    const { error: updateError } = await supabase
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
    await supabase
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

    return jsonResponse({ 
      success: true,
      message: `Teruggerold naar versie ${targetVersion.version_number}`,
      version: targetVersion
    });

  } catch (error: any) {
    console.error('Error in rollback-knowledge:', error);
    return errorResponse(error?.message || 'Unknown error', 500);
  }
});
