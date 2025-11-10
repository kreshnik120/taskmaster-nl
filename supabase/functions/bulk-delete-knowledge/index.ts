import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { knowledgeIds, reason = "manual_deletion" } = await req.json();

    if (!knowledgeIds || !Array.isArray(knowledgeIds) || knowledgeIds.length === 0) {
      throw new Error("Invalid or empty knowledge IDs array");
    }

    console.log(`[bulk-delete] User ${user.id} deleting ${knowledgeIds.length} items. Reason: ${reason}`);

    // Get items to verify access and collect org_ids for logging
    const { data: items, error: fetchError } = await supabase
      .from("ai_knowledge_base")
      .select("id, org_id, category, key")
      .in("id", knowledgeIds)
      .is("deleted_at", null);

    if (fetchError) throw fetchError;

    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          deletedCount: 0, 
          message: "No valid items found to delete" 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user has access to these items (check org membership)
    const orgIds = [...new Set(items.map(i => i.org_id))];
    const { data: memberships, error: memberError } = await supabase
      .from("user_organizations")
      .select("org_id")
      .eq("user_id", user.id)
      .in("org_id", orgIds);

    if (memberError) throw memberError;

    const allowedOrgIds = new Set(memberships?.map(m => m.org_id) || []);
    const itemsToDelete = items.filter(item => allowedOrgIds.has(item.org_id));

    if (itemsToDelete.length === 0) {
      throw new Error("No permission to delete any of the specified items");
    }

    const idsToDelete = itemsToDelete.map(i => i.id);

    // Soft-delete knowledge items
    const { error: updateError } = await supabase
      .from("ai_knowledge_base")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
        deletion_reason: reason,
      })
      .in("id", idsToDelete);

    if (updateError) throw updateError;

    // Delete embeddings (trigger should handle this, but we do it explicitly for reliability)
    const { error: embeddingError } = await supabase
      .from("knowledge_embeddings")
      .delete()
      .in("knowledge_id", idsToDelete);

    if (embeddingError) {
      console.error("[bulk-delete] Error deleting embeddings:", embeddingError);
      // Don't throw - embeddings cleanup is secondary
    }

    // Log bulk delete event for each org
    for (const orgId of orgIds) {
      const orgItems = itemsToDelete.filter(i => i.org_id === orgId);
      await supabase.from("ai_learning_events").insert({
        user_id: user.id,
        org_id: orgId,
        event_type: "bulk_delete",
        context: {
          knowledge_ids: orgItems.map(i => i.id),
          reason,
          deleted_count: orgItems.length,
          categories: [...new Set(orgItems.map(i => i.category))],
        },
        outcome: "success",
      });
    }

    console.log(`[bulk-delete] Successfully deleted ${idsToDelete.length} items`);

    return new Response(
      JSON.stringify({
        success: true,
        deletedCount: idsToDelete.length,
        message: `${idsToDelete.length} items successfully deleted`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("[bulk-delete] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
