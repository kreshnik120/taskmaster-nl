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
    // Detect mode: authenticated vs autonomous with graceful fallback
    const authHeader = req.headers.get('Authorization');
    const isRealUserAuth = authHeader && !authHeader.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3');
    
    let orgId: string;
    let userId: string;
    let supabase: any;
    let functie: string | undefined;
    let regio: string | undefined;
    let vanaf_datum: string | undefined;
    let tot_datum: string | undefined;
    let client_id: string | undefined;
    let aantal = 10;

    if (isRealUserAuth) {
      // TRY authenticated mode with real user
      console.log('🔐 Attempting authenticated mode');
      supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        // FALLBACK to autonomous mode
        console.log('❌ Auth failed, falling back to autonomous mode');
        supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );
        const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
        orgId = orgs![0].id;
        userId = orgId;
      } else {
        userId = user.id;
        const { data: userOrg } = await supabase
          .from('user_organizations')
          .select('org_id')
          .eq('user_id', userId)
          .maybeSingle();
        
        if (!userOrg) {
          const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
          orgId = orgs![0].id;
        } else {
          orgId = userOrg.org_id;
        }
        
        const body = await req.json();
        functie = body.functie;
        regio = body.regio;
        vanaf_datum = body.vanaf_datum;
        tot_datum = body.tot_datum;
        client_id = body.client_id;
        aantal = body.aantal || 10;
      }
    } else {
      // AUTONOMOUS MODE
      console.log('🤖 Running in autonomous mode');
      supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
      orgId = orgs![0].id;
      userId = orgId;
    }

    console.log('Searching professionals:', { functie, regio, vanaf_datum, tot_datum, client_id, aantal, org_id: orgId });

    // Build query with optional client filter
    let professionalIds: string[] | undefined;
    
    if (client_id) {
      // First get professionals linked to this client
      const { data: clientProfessionals, error: clientProfError } = await supabase
        .from('professional_clients')
        .select('professional_id')
        .eq('is_active', true)
        .or(`client_id.eq.${client_id}`);
      
      if (clientProfError) {
        console.error('Client professional query error:', clientProfError);
      } else if (clientProfessionals && clientProfessionals.length > 0) {
        professionalIds = clientProfessionals.map((pc: any) => pc.professional_id);
        console.log(`Found ${professionalIds?.length || 0} professionals for client ${client_id}`);
      } else {
        console.log(`No professionals found for client ${client_id}`);
        // Return empty result if client has no professionals
        return new Response(JSON.stringify({
          professionals: [],
          filters_used: { functie, regio, vanaf_datum, tot_datum, client_id },
          total_found: 0
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Build base query
    let query = supabase
      .from('professionals')
      .select('id, full_name, functie_niveau, regio, skills, rating, tags, beschikbaarheidsnotities')
      .eq('org_id', orgId)
      .eq('status', 'actief')
      .order('rating', { ascending: false, nullsFirst: false })
      .limit(aantal);

    // Apply client filter if we have professional IDs
    if (professionalIds && professionalIds.length > 0) {
      query = query.in('id', professionalIds);
    }

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
      const professionalIds = professionals.map((p: any) => p.id);
      
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
        const availableIds = new Set(availability.map((a: any) => a.professional_id));
        filteredProfessionals = professionals.filter((p: any) => availableIds.has(p.id));
      }
    }

    console.log(`Found ${filteredProfessionals.length} professionals`);

    return new Response(JSON.stringify({
      professionals: filteredProfessionals,
      filters_used: { functie, regio, vanaf_datum, tot_datum, client_id },
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