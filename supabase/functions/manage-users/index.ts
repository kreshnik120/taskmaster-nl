import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const { action, ...params } = await req.json();
    console.log(`[manage-users] Action: ${action}, by admin: ${user.email}`);

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

        // Prevent admin from removing their own admin role
        if (user_id === user.id && role !== "admin") {
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
        
        console.log(`[manage-users] Role assigned: ${targetUser?.user?.email} -> ${role} (by ${user.email})`);

        return new Response(
          JSON.stringify({ success: true, message: `Rol '${role}' toegewezen` }),
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
