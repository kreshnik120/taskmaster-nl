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
      return new Response(JSON.stringify({ error: 'Geen autorisatie' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(JSON.stringify({ error: 'Niet geautoriseerd' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user's org
    const { data: userOrg, error: orgError } = await supabase
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    if (orgError || !userOrg) {
      console.error('Org error:', orgError);
      return new Response(JSON.stringify({ error: 'Organisatie niet gevonden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { professionals } = await req.json();

    if (!Array.isArray(professionals) || professionals.length === 0) {
      return new Response(JSON.stringify({ error: 'Geen professionals data ontvangen' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Importing ${professionals.length} professionals for org ${userOrg.org_id}`);

    // Validate and prepare data
    const validProfessionals = professionals.map(p => ({
      org_id: userOrg.org_id,
      full_name: p.full_name || p.naam || 'Onbekend',
      functie_niveau: p.functie_niveau || p.functie || 'VIG',
      regio: p.regio || null,
      skills: Array.isArray(p.skills) ? p.skills : [],
      beschikbaarheidsnotities: p.beschikbaarheidsnotities || p.notities || null,
      status: p.status || 'actief',
      rating: p.rating || null,
      tags: Array.isArray(p.tags) ? p.tags : []
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('professionals')
      .insert(validProfessionals)
      .select();

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(JSON.stringify({ 
        error: 'Fout bij importeren', 
        details: insertError.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Successfully imported ${inserted?.length || 0} professionals`);

    return new Response(JSON.stringify({
      success: true,
      imported_count: inserted?.length || 0,
      professionals: inserted
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in import-professionals:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Onbekende fout' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});