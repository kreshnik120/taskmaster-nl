import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ✅ Zod validation schema
const BulkDeleteSchema = z.object({
  knowledgeIds: z.array(z.string().uuid()).min(1).max(100),
  reason: z.string().min(1).max(500).optional().default("manual_deletion"),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    // ✅ SECURITY FIX: Use anon key + user JWT to ENFORCE RLS
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // Client met user's JWT - RLS wordt afgedwongen!
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader }
      }
    });

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    // ✅ INPUT VALIDATION with Zod
    const rawBody = await req.json();
    const validationResult = BulkDeleteSchema.safeParse(rawBody);
    
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(e => 
        `${e.path.join('.')}: ${e.message}`
      ).join(', ');
      throw new Error(`Validation failed: ${errors}`);
    }

    const { knowledgeIds, reason } = validationResult.data;

    console.log(`[bulk-delete] User ${user.id} soft-deleting ${knowledgeIds.length} items. Reason: ${reason}`);

    // ✅ RLS ENFORCED: Soft-delete via UPDATE met nieuwe policy "Admins can soft-delete knowledge"
    // Users kunnen alleen hun eigen org items deleten als ze admin/manager zijn
    const { data: updatedItems, error: updateError } = await supabase
      .from("ai_knowledge_base")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
        deletion_reason: reason,
      })
      .in("id", knowledgeIds)
      .is("deleted_at", null) // Alleen niet-verwijderde items
      .select("id, org_id, category, key");

    if (updateError) {
      console.error("[bulk-delete] Update error:", updateError);
      throw new Error(`Failed to delete items: ${updateError.message}`);
    }

    if (!updatedItems || updatedItems.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          deletedCount: 0, 
          message: "No valid items found to delete (either already deleted or no permission)" 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ✅ CASCADE CLEANUP: Delete embeddings (we gebruiken service_role ALLEEN voor cascade cleanup)
    // Dit is acceptabel omdat embeddings geen RLS hebben en puur technical data zijn
    const supabaseServiceClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: embeddingError } = await supabaseServiceClient
      .from("knowledge_embeddings")
      .delete()
      .in("knowledge_id", updatedItems.map(i => i.id));

    if (embeddingError) {
      console.error("[bulk-delete] Embedding cleanup error:", embeddingError);
      // Don't throw - embeddings cleanup is secondary, trigger should handle it
    }

    // Log bulk delete event for each org
    const orgIds = [...new Set(updatedItems.map(i => i.org_id))];
    for (const orgId of orgIds) {
      const orgItems = updatedItems.filter(i => i.org_id === orgId);
      
      // Use user client for logging (RLS enforced)
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

    console.log(`[bulk-delete] Successfully soft-deleted ${updatedItems.length} items`);

    return new Response(
      JSON.stringify({
        success: true,
        deletedCount: updatedItems.length,
        message: `${updatedItems.length} item(s) successfully deleted`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("[bulk-delete] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
