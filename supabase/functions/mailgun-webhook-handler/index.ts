import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { createHmac } from 'node:crypto';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MailgunWebhookPayload {
  signature: {
    timestamp: string;
    token: string;
    signature: string;
  };
  'event-data': {
    event: string;
    id: string;
    recipient: string;
    timestamp: number;
    [key: string]: any;
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const WEBHOOK_SIGNING_KEY = Deno.env.get('MAILGUN_WEBHOOK_SIGNING_KEY');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const DEFAULT_ORG_ID = '550e8400-e29b-41d4-a716-446655440000';

  if (!WEBHOOK_SIGNING_KEY) {
    console.error('❌ MAILGUN_WEBHOOK_SIGNING_KEY not configured');
    return new Response('Server configuration error', { 
      status: 500, 
      headers: corsHeaders 
    });
  }

  try {
    const payload: MailgunWebhookPayload = await req.json();
    console.log('📬 Webhook received:', payload['event-data'].event);

    // Verify signature
    const { timestamp, token, signature } = payload.signature;
    const encodedToken = createHmac('sha256', WEBHOOK_SIGNING_KEY)
      .update(timestamp + token)
      .digest('hex');

    if (encodedToken !== signature) {
      console.error('⚠️ Invalid signature');
      return new Response('Invalid signature', { 
        status: 406, 
        headers: corsHeaders 
      });
    }

    // Verify timestamp (max 5 minutes old)
    const timestampAge = Date.now() / 1000 - parseInt(timestamp);
    if (timestampAge > 300) {
      console.error('⚠️ Timestamp too old:', timestampAge);
      return new Response('Timestamp too old', { 
        status: 406, 
        headers: corsHeaders 
      });
    }

    // Extract event data
    const eventData = payload['event-data'];
    
    // Store in database
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { error } = await supabase
      .from('email_events')
      .insert({
        event_type: eventData.event,
        message_id: eventData.id,
        recipient: eventData.recipient,
        timestamp: new Date(eventData.timestamp * 1000).toISOString(),
        metadata: eventData,
        org_id: DEFAULT_ORG_ID,
      });

    if (error) {
      console.error('❌ Database insert error:', error);
      return new Response('Database error', { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    console.log('✅ Event stored:', eventData.event, eventData.id);
    return new Response('OK', { status: 200, headers: corsHeaders });

  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    return new Response('Server error', { 
      status: 500, 
      headers: corsHeaders 
    });
  }
});
