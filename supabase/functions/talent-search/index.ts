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

    const { functie, regio, vanaf_datum, tot_datum, aantal = 10 } = await req.json();

    console.log('Searching professionals:', { functie, regio, vanaf_datum, tot_datum, aantal, org_id: userOrg.org_id });

    // Build query
    let query = supabase
      .from('professionals')
      .select('id, full_name, functie_niveau, regio, skills, rating, tags, beschikbaarheidsnotities')
      .eq('org_id', userOrg.org_id)
      .eq('status', 'actief')
      .order('rating', { ascending: false, nullsFirst: false })
      .limit(aantal);

    if (functie) {
      query = query.eq('functie_niveau', functie);
    }

    if (regio) {
      query = query.ilike('regio', `%${regio}%`);
    }

    const { data: professionals, error: profError } = await query;

    if (profError) {
      console.error('Query error:', profError);
      return new Response(JSON.stringify({ error: 'Fout bij zoeken professionals' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If date filters, check availability
    let filteredProfessionals = professionals || [];
    if (vanaf_datum && tot_datum && professionals && professionals.length > 0) {
      const professionalIds = professionals.map(p => p.id);
      
      const { data: availability, error: availError } = await supabase
        .from('professional_availability')
        .select('professional_id, date, shift, is_available')
        .in('professional_id', professionalIds)
        .gte('date', vanaf_datum)
        .lte('date', tot_datum)
        .eq('is_available', true);

      if (availError) {
        console.error('Availability error:', availError);
      } else if (availability && availability.length > 0) {
        // Filter to only professionals with availability
        const availableIds = new Set(availability.map(a => a.professional_id));
        filteredProfessionals = professionals.filter(p => availableIds.has(p.id));
      }
    }

    console.log(`Found ${filteredProfessionals.length} professionals`);

    return new Response(JSON.stringify({
      professionals: filteredProfessionals,
      filters_used: { functie, regio, vanaf_datum, tot_datum },
      total_found: filteredProfessionals.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in talent-search:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Onbekende fout' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});