 import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
 
 const corsHeaders = {
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
 };
 
interface ImpersonateRequest {
  action: 'start_impersonation' | 'stop_impersonation';
  target_user_id: string;
  original_admin_id?: string;  // Optional, only for stop
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Geen autorisatie header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Parse request body FIRST to check action type
    const body: ImpersonateRequest = await req.json();
    const { action, target_user_id, original_admin_id } = body;

    if (!action || !target_user_id) {
      return new Response(
        JSON.stringify({ error: 'Actie en target_user_id zijn verplicht' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For stop_impersonation, skip admin check - just log and return success
    if (action === 'stop_impersonation') {
      // Log the stop action using the original admin ID from the request
      if (original_admin_id) {
        const { error: logError } = await adminClient
          .from('admin_impersonation_log')
          .insert({
            admin_user_id: original_admin_id,
            target_user_id: target_user_id,
            action: 'stop',
            admin_email: null,
            target_email: null
          });
        
        if (logError) {
          console.error('Failed to log stop impersonation:', logError);
        }
      }
      
      console.log(`Impersonation stopped for user ${target_user_id}`);
      
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // From here on, only start_impersonation - requires admin check
    // Create user client to verify the caller
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify the caller's JWT and get their user info
    const { data: userData, error: userError } = await userClient.auth.getUser();
    
    if (userError || !userData?.user) {
      console.error('JWT verification failed:', userError);
      return new Response(
        JSON.stringify({ error: 'Ongeldige sessie' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminUserId = userData.user.id;
    const adminEmail = userData.user.email || 'unknown';

    // Check if caller is admin using has_role function
    const { data: isAdmin, error: roleError } = await adminClient.rpc('has_role', {
      _user_id: adminUserId,
      _role: 'admin'
    });

    if (roleError) {
      console.error('Role check error:', roleError);
      return new Response(
        JSON.stringify({ error: 'Kon rol niet verifiëren' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isAdmin) {
      console.warn(`Non-admin user ${adminUserId} attempted impersonation`);
      return new Response(
        JSON.stringify({ error: 'Alleen admins kunnen impersoneren' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prevent self-impersonation
    if (target_user_id === adminUserId) {
      return new Response(
        JSON.stringify({ error: 'Je kunt jezelf niet impersoneren' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
 
    // Get target user info (only for start_impersonation at this point)
    const { data: targetUser, error: targetError } = await adminClient.auth.admin.getUserById(target_user_id);
    
    if (targetError || !targetUser?.user) {
      console.error('Target user not found:', targetError);
      return new Response(
        JSON.stringify({ error: 'Gebruiker niet gevonden' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const targetEmail = targetUser.user.email || 'unknown';
    const targetName = (targetUser.user.user_metadata?.name as string) || targetEmail;

    // Generate magic link for target user
    const origin = req.headers.get('origin') || 'https://taskmaster-nl.lovable.app';
    
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: targetEmail,
      options: {
        redirectTo: `${origin}/dashboard`
      }
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error('Magic link generation failed:', linkError);
      return new Response(
        JSON.stringify({ error: 'Kon login link niet genereren' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the impersonation action
    const { error: logError } = await adminClient
      .from('admin_impersonation_log')
      .insert({
        admin_user_id: adminUserId,
        target_user_id: target_user_id,
        action: 'start',
        admin_email: adminEmail,
        target_email: targetEmail
      });

    if (logError) {
      console.error('Failed to log impersonation:', logError);
      // Don't fail the request, just log the error
    }

    console.log(`Admin ${adminEmail} started impersonation of ${targetEmail}`);

    return new Response(
      JSON.stringify({
        success: true,
        magic_link: linkData.properties.action_link,
        target_email: targetEmail,
        target_name: targetName,
        admin_id: adminUserId
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
 
 
   } catch (error) {
     console.error('Impersonate user error:', error);
     return new Response(
       JSON.stringify({ error: 'Interne serverfout' }),
       { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
     );
   }
 });