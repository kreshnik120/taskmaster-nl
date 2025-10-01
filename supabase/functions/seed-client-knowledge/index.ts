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
      console.error('No authorization header provided');
      return new Response(JSON.stringify({ error: 'Authenticatie vereist' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase environment variables');
      throw new Error('Server configuration error');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { 
        headers: { 
          Authorization: authHeader 
        } 
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(accessToken);
    
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(JSON.stringify({ error: 'Authenticatie gefaald' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('User authenticated:', user.id);

    // Get user's org_id
    const { data: userOrg } = await supabaseClient
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user.id)
      .single();
    
    if (!userOrg) {
      return new Response(JSON.stringify({ error: 'Geen organisatie gevonden' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userOrgId = userOrg.org_id;

    // Fetch all clients
    const { data: clients, error: clientsError } = await supabaseClient
      .from('clients')
      .select('*');

    if (clientsError) {
      console.error('Error fetching clients:', clientsError);
      throw clientsError;
    }

    console.log(`Found ${clients?.length || 0} clients to process`);

    let seedCount = 0;
    const errors: string[] = [];

    // Process each client and add to knowledge base
    for (const client of clients || []) {
      try {
        // Create a comprehensive knowledge entry for this client
        const clientKnowledge = {
          id: client.id,
          name: client.name,
          company: client.company,
          tier: client.tier,
          weekly_hours: client.weekly_hours,
          revenue_per_hour: client.revenue_per_hour,
          monthly_value: client.weekly_hours && client.revenue_per_hour 
            ? (client.weekly_hours * client.revenue_per_hour * 4) 
            : null,
        };

        // Insert into knowledge base
        const { error: insertError } = await supabaseClient
          .from('ai_knowledge_base')
          .upsert({
            user_id: user.id,
            org_id: userOrgId,
            category: 'business_rule',
            key: `client_${client.company.toLowerCase().replace(/\s+/g, '_')}`,
            value: clientKnowledge,
            confidence_score: 1.0,
            source: 'client_database',
            usage_count: 0,
            last_used_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,org_id,category,key'
          });

        if (insertError) {
          console.error(`Error inserting client ${client.company}:`, insertError);
          errors.push(`${client.company}: ${insertError.message}`);
        } else {
          seedCount++;
          console.log(`✓ Seeded client: ${client.company}`);
        }
      } catch (err) {
        console.error(`Error processing client ${client.company}:`, err);
        errors.push(`${client.company}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Also create a summary knowledge entry with all clients
    if (clients && clients.length > 0) {
      try {
        await supabaseClient
          .from('ai_knowledge_base')
          .upsert({
            user_id: user.id,
            org_id: userOrgId,
            category: 'business_rule',
            key: 'all_clients_summary',
            value: {
              total_clients: clients.length,
              clients: clients.map(c => ({
                company: c.company,
                name: c.name,
                tier: c.tier,
                id: c.id
              }))
            },
            confidence_score: 1.0,
            source: 'client_database',
            usage_count: 0,
            last_used_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,org_id,category,key'
          });
        
        console.log('✓ Created all_clients_summary');
      } catch (err) {
        console.error('Error creating summary:', err);
      }
    }

    const response = {
      success: true,
      total_clients: clients?.length || 0,
      seeded: seedCount,
      errors: errors.length > 0 ? errors : undefined,
      message: `✅ Succesvol ${seedCount} van ${clients?.length || 0} clients toegevoegd aan AI knowledge base${errors.length > 0 ? ` (${errors.length} fouten)` : ''}`
    };

    console.log('Seeding complete:', response);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Seed client knowledge error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
