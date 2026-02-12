import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

interface UserWithRole {
  id: string;
  email: string;
  created_at: string;
  raw_user_meta_data: Record<string, unknown>;
  role: string | null;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check for internal service call (for automated password resets)
    const internalSecret = req.headers.get("X-Internal-Secret");
    const citozorgApiKey = Deno.env.get("CITOZORG_API_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const isInternalCall = internalSecret && (internalSecret === serviceRoleKey || internalSecret === citozorgApiKey);

    let adminEmail = "system";

    if (!isInternalCall) {
      // Verify JWT and check admin role
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: "Geen autorisatie header" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get user from JWT
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      
      const { data: { user }, error: userError } = await anonClient.auth.getUser();
      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: "Ongeldige sessie" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if user is admin using service role client
      const { data: roleCheck } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (roleCheck?.role !== "admin") {
        return new Response(
          JSON.stringify({ error: "Alleen admins kunnen gebruikers beheren" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      adminEmail = user.email || "unknown";
    }

    const { action, ...params } = await req.json();
    console.log(`[manage-users] Action: ${action}, by admin: ${adminEmail}`);

    switch (action) {
      case "list_users": {
        // Get all users from auth.users via admin API
        const { data: authUsers, error: authError } = await adminClient.auth.admin.listUsers();
        
        if (authError) {
          console.error("[manage-users] Error listing users:", authError);
          return new Response(
            JSON.stringify({ error: "Kon gebruikers niet ophalen" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get all roles
        const { data: roles } = await adminClient
          .from("user_roles")
          .select("user_id, role");

        const roleMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);

        // Combine users with roles
        const usersWithRoles: UserWithRole[] = authUsers.users.map(u => ({
          id: u.id,
          email: u.email || "Onbekend",
          created_at: u.created_at,
          raw_user_meta_data: u.user_metadata || {},
          role: roleMap.get(u.id) || null,
        }));

        // Sort by created_at desc
        usersWithRoles.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        return new Response(
          JSON.stringify({ users: usersWithRoles }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "reset_password": {
        const { user_id, new_password, email } = params as { 
          user_id?: string; 
          new_password: string; 
          email?: string;
        };
        
        if (!new_password) {
          return new Response(
            JSON.stringify({ error: "new_password is verplicht" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Find user_id by email if not provided
        let targetUserId = user_id;
        if (!targetUserId && email) {
          const { data: users, error: listError } = await adminClient.auth.admin.listUsers();
          if (listError) {
            console.error("[manage-users] Error listing users:", listError);
            return new Response(
              JSON.stringify({ error: "Kon gebruikers niet ophalen" }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          const targetUser = users.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
          if (!targetUser) {
            return new Response(
              JSON.stringify({ error: `Gebruiker met email ${email} niet gevonden` }),
              { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          targetUserId = targetUser.id;
        }

        if (!targetUserId) {
          return new Response(
            JSON.stringify({ error: "user_id of email is verplicht" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Update password via admin API
        const { error: updateError } = await adminClient.auth.admin.updateUserById(
          targetUserId,
          { password: new_password }
        );

        if (updateError) {
          console.error("[manage-users] Error resetting password:", updateError);
          return new Response(
            JSON.stringify({ error: "Kon wachtwoord niet resetten", details: updateError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get target user email for logging
        const { data: targetUser } = await adminClient.auth.admin.getUserById(targetUserId);
        console.log(`[manage-users] Password reset for: ${targetUser?.user?.email} (by ${adminEmail})`);

        return new Response(
          JSON.stringify({ success: true, message: `Wachtwoord gereset voor ${targetUser?.user?.email || targetUserId}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "assign_role": {
        const { user_id, role } = params as { user_id: string; role: string };
        
        if (!user_id || !role) {
          return new Response(
            JSON.stringify({ error: "user_id en role zijn verplicht" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Validate role
        const validRoles = ["user", "manager", "admin"];
        if (!validRoles.includes(role)) {
          return new Response(
            JSON.stringify({ error: `Ongeldige rol. Kies uit: ${validRoles.join(", ")}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Prevent admin from removing their own admin role (only for authenticated users)
        // Internal calls bypass this check
        if (!isInternalCall && user_id === adminEmail && role !== "admin") {
          return new Response(
            JSON.stringify({ error: "Je kunt je eigen admin rol niet verwijderen" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Upsert role
        const { error: upsertError } = await adminClient
          .from("user_roles")
          .upsert(
            { user_id, role },
            { onConflict: "user_id" }
          );

        if (upsertError) {
          console.error("[manage-users] Error assigning role:", upsertError);
          return new Response(
            JSON.stringify({ error: "Kon rol niet toewijzen" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get target user email for logging
        const { data: targetUser } = await adminClient.auth.admin.getUserById(user_id);
        
        console.log(`[manage-users] Role assigned: ${targetUser?.user?.email} -> ${role} (by ${adminEmail})`);

        return new Response(
          JSON.stringify({ success: true, message: `Rol '${role}' toegewezen` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "delete_user": {
        const { user_id } = params as { user_id: string };
        
        if (!user_id) {
          return new Response(
            JSON.stringify({ error: "user_id is verplicht" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get target user info before deletion
        const { data: targetUser } = await adminClient.auth.admin.getUserById(user_id);
        const targetEmail = targetUser?.user?.email || user_id;

        console.log(`[manage-users] Deleting user: ${targetEmail} (by ${adminEmail})`);

        // Step 1: Nullify FK references to profiles table
        const nullifyProfileRefs = await Promise.allSettled([
          adminClient.from("tasks").update({ assignee_id: null }).eq("assignee_id", user_id),
          adminClient.from("tasks").update({ reporter_id: null }).eq("reporter_id", user_id),
          adminClient.from("tasks").update({ accepted_by: null }).eq("accepted_by", user_id),
          adminClient.from("subtasks").update({ assignee_id: null }).eq("assignee_id", user_id),
          adminClient.from("comments").delete().eq("author_id", user_id),
          adminClient.from("task_action_history").update({ created_by: null }).eq("created_by", user_id),
          adminClient.from("task_action_history").update({ completed_by: null }).eq("completed_by", user_id),
          adminClient.from("meeting_minutes").update({ approved_by: null }).eq("approved_by", user_id),
          adminClient.from("meeting_minute_attachments").update({ uploaded_by: null }).eq("uploaded_by", user_id),
          adminClient.from("tasks_recurrence").update({ assignee_id: null }).eq("assignee_id", user_id),
        ]);

        for (const d of nullifyProfileRefs) {
          if (d.status === "rejected") {
            console.warn(`[manage-users] Nullify profile ref warning:`, d.reason);
          }
        }

        // Step 2: Delete ALL related records (user_id FK to auth.users and profiles)
        const deletions = await Promise.allSettled([
          adminClient.from("user_roles").delete().eq("user_id", user_id),
          adminClient.from("user_organizations").delete().eq("user_id", user_id),
          adminClient.from("system_events").delete().eq("user_id", user_id),
          adminClient.from("user_column_preferences").delete().eq("user_id", user_id),
          adminClient.from("user_widget_preferences").delete().eq("user_id", user_id),
          adminClient.from("recruiter_notifications").delete().eq("user_id", user_id),
          adminClient.from("ai_knowledge_base").delete().eq("user_id", user_id),
          adminClient.from("ai_chat_messages").delete().eq("user_id", user_id),
          adminClient.from("ai_chat_feedback").delete().eq("user_id", user_id),
          adminClient.from("ai_learning_events").delete().eq("user_id", user_id),
          adminClient.from("conversation_context").delete().eq("user_id", user_id),
          adminClient.from("dienst_filter_presets").delete().eq("user_id", user_id),
          adminClient.from("meeting_attendees").delete().eq("user_id", user_id),
          adminClient.from("message_feedback").delete().eq("user_id", user_id),
          adminClient.from("response_validations").delete().eq("user_id", user_id),
          adminClient.from("training_documents").delete().eq("user_id", user_id),
          adminClient.from("watches").delete().eq("user_id", user_id),
          adminClient.from("time_entries").delete().eq("user_id", user_id),
          adminClient.from("application_notes").delete().eq("user_id", user_id),
          adminClient.from("agent_goals").delete().eq("user_id", user_id),
          adminClient.from("admin_impersonation_log").delete().eq("admin_user_id", user_id),
          adminClient.from("admin_impersonation_log").delete().eq("target_user_id", user_id),
        ]);

        for (const d of deletions) {
          if (d.status === "rejected") {
            console.warn(`[manage-users] Related deletion warning:`, d.reason);
          }
        }

        // Step 3: Delete profile (after all FK refs are cleared)
        await adminClient.from("profiles").delete().eq("id", user_id);

        // Delete the auth user
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(user_id);

        if (deleteError) {
          console.error("[manage-users] Error deleting user:", deleteError);
          return new Response(
            JSON.stringify({ error: "Kon gebruiker niet verwijderen", details: deleteError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[manage-users] User deleted: ${targetEmail} (by ${adminEmail})`);

        return new Response(
          JSON.stringify({ success: true, message: `Gebruiker ${targetEmail} volledig verwijderd` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Onbekende actie: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("[manage-users] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Interne serverfout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
