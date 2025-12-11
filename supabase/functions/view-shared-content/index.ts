import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/core.ts';

interface ShareRequest {
  token: string;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // 🔒 SECURITY: Rate limiting to prevent brute-force attacks
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || 
                     req.headers.get("x-real-ip") || 
                     "unknown";
    
    const { checkRateLimit } = await import("../_shared/rate-limiter.ts");
    
    if (!checkRateLimit(clientIp)) {
      return new Response(
        JSON.stringify({ error: "Te veel verzoeken, probeer over 1 minuut opnieuw" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request
    const { token }: ShareRequest = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Token is vereist' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Set app setting for token-based RLS policy
    await supabase.rpc('set_config', {
      setting_name: 'app.share_token',
      setting_value: token
    });

    // Fetch share link with token-based RLS policy
    const { data: shareLink, error: shareLinkError } = await supabase
      .from('share_links')
      .select(`
        *,
        tasks:task_id (
          id,
          title,
          description,
          status,
          priority,
          due_at,
          assignee_id,
          org_id
        ),
        projects:project_id (
          id,
          name,
          description,
          org_id
        )
      `)
      .eq('token', token)
      .single();

    if (shareLinkError || !shareLink) {
      console.error('Share link niet gevonden:', shareLinkError);
      return new Response(
        JSON.stringify({ error: 'Ongeldige share link' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check expiration
    if (shareLink.expires_at && new Date(shareLink.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'Share link is verlopen' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Increment view count
    const { error: updateError } = await supabase
      .from('share_links')
      .update({ 
        view_count: (shareLink.view_count || 0) + 1,
        last_accessed_at: new Date().toISOString()
      })
      .eq('id', shareLink.id);

    if (updateError) {
      console.error('Fout bij updaten view count:', updateError);
    }

    // Return shared content
    const response = {
      token: shareLink.token,
      expires_at: shareLink.expires_at,
      view_count: (shareLink.view_count || 0) + 1,
      task: shareLink.tasks || null,
      project: shareLink.projects || null,
      created_at: shareLink.created_at,
      created_by: shareLink.created_by
    };

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in view-shared-content:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Er is een fout opgetreden',
        details: error instanceof Error ? error.message : 'Onbekende fout'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
