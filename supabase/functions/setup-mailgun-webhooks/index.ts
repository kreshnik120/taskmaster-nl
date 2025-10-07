import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WEBHOOK_EVENTS = [
  'delivered',
  'opened',
  'clicked',
  'permanent_fail',
  'temporary_fail',
  'complained',
  'unsubscribed',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

  if (!MAILGUN_API_KEY) {
    return new Response(
      JSON.stringify({ success: false, error: 'MAILGUN_API_KEY not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Verify user authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔧 Setting up Mailgun webhooks for apply.citozorg.nl');

    // Auto-detect region
    let baseUrl = 'https://api.eu.mailgun.net/v3';
    let region = 'EU';

    const testResponse = await fetch(`${baseUrl}/domains/apply.citozorg.nl`, {
      headers: {
        'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}`,
      },
    });

    if (!testResponse.ok && testResponse.status === 401) {
      baseUrl = 'https://api.mailgun.net/v3';
      region = 'US';
      console.log('🌎 Falling back to US region');
    } else {
      console.log('🇪🇺 Using EU region');
    }

    const webhookUrl = `${SUPABASE_URL}/functions/v1/mailgun-webhook-handler`;
    const configuredWebhooks: string[] = [];
    const errors: any[] = [];

    // Configure each webhook
    for (const eventType of WEBHOOK_EVENTS) {
      try {
        const response = await fetch(
          `${baseUrl}/domains/apply.citozorg.nl/webhooks/${eventType}`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ url: webhookUrl }),
          }
        );

        if (response.ok) {
          configuredWebhooks.push(eventType);
          console.log(`✅ Configured webhook: ${eventType}`);
        } else {
          const errorText = await response.text();
          errors.push({ event: eventType, error: errorText });
          console.error(`❌ Failed to configure ${eventType}:`, errorText);
        }
      } catch (error) {
        errors.push({ event: eventType, error: error instanceof Error ? error.message : String(error) });
        console.error(`❌ Error configuring ${eventType}:`, error);
      }
    }

    return new Response(
      JSON.stringify({
        success: configuredWebhooks.length > 0,
        region,
        webhook_url: webhookUrl,
        configured: configuredWebhooks,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ Setup error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
