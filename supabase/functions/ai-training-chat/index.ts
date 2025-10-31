import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.warn('⚠️ DEPRECATED: /ai-training-chat is deprecated. Use /ai-chat with admin account instead.');
  
  return new Response(
    JSON.stringify({
      error: 'endpoint_deprecated',
      message: 'Dit endpoint is vervangen door /ai-chat. Gebruik /functions/v1/ai-chat met een admin account voor training functies.',
      redirect_to: '/functions/v1/ai-chat',
      deprecated_since: '2025-10-31',
      instructions: 'Open de AI Training pagina in de app. De chat gebruikt nu automatisch het unified endpoint.'
    }),
    {
      status: 410, // Gone
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
});
