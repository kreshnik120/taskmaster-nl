import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

interface ValidateRequest {
  knowledgeIds: string[];
  validationStatus: 'verified' | 'rejected' | 'pending_review';
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createAdminClient();

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('❌ Auth error:', authError);
      return errorResponse('Unauthorized', 401);
    }

    // Check if user is admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleData?.role !== 'admin') {
      console.error('❌ User is not admin');
      return errorResponse('Forbidden: Admin access required', 403);
    }

    const body: ValidateRequest = await req.json();
    const { knowledgeIds, validationStatus } = body;

    console.log(`📋 Validating ${knowledgeIds.length} knowledge items as: ${validationStatus}`);

    if (!knowledgeIds || knowledgeIds.length === 0) {
      return errorResponse('No knowledge IDs provided', 400);
    }

    if (!['verified', 'rejected', 'pending_review'].includes(validationStatus)) {
      return errorResponse('Invalid validation status', 400);
    }

    // Update validation status and timestamp
    const { data: updated, error: updateError } = await supabase
      .from('ai_knowledge_base')
      .update({
        validation_status: validationStatus,
        last_verified: new Date().toISOString(),
        needs_review: validationStatus === 'pending_review',
      })
      .in('id', knowledgeIds)
      .select('id, category, key');

    if (updateError) {
      console.error('❌ Update error:', updateError);
      throw updateError;
    }

    console.log(`✅ Updated ${updated.length} items to ${validationStatus}`);

    // Get user's org_id from user_organizations
    const { data: userOrg } = await supabase
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    const orgId = userOrg?.org_id || Deno.env.get('DEFAULT_ORG_ID') || '550e8400-e29b-41d4-a716-446655440000';

    // FIXED: Log validation events with outcome field and proper error handling
    const learningEvents = updated.map(item => ({
      user_id: user.id,
      org_id: orgId,
      event_type: 'manual_validation',
      context: {
        knowledge_id: item.id,
        category: item.category,
        key: item.key,
        validation_status: validationStatus,
        validator_id: user.id,
      },
      outcome: validationStatus, // CRITICAL FIX: Set outcome to validation status
      confidence_score: validationStatus === 'verified' ? 1.0 : validationStatus === 'rejected' ? 0.0 : 0.5,
      applied_to_knowledge_base: true,
    }));

    try {
      const { error: logError } = await supabase
        .from('ai_learning_events')
        .insert(learningEvents);

      if (logError) {
        console.error('⚠️ Failed to log validation events:', logError);
        // Don't throw - validation succeeded even if logging failed
      } else {
        console.log(`📝 Logged ${learningEvents.length} validation events with outcome: ${validationStatus}`);
      }
    } catch (logException) {
      console.error('⚠️ Exception logging validation events:', logException);
      // Continue - validation succeeded
    }

    return jsonResponse({
      success: true,
      updatedCount: updated.length,
      status: validationStatus,
      items: updated,
    });

  } catch (error: any) {
    console.error('❌ Validation error:', error);
    return errorResponse(error.message, 500);
  }
});
