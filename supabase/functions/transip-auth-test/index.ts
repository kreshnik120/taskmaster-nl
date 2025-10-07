import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function b64url(input: string) {
  return btoa(input).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function generateTransIPJWT(privateKey: string) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'api.transip.nl',
    aud: 'api.transip.nl',
    jti: crypto.randomUUID(),
    iat: now,
    nbf: now,
    exp: now + 3600,
    readonly: false,
  };

  console.log('🧾 JWT header/payload', { header, payload });

  const dataToSign = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;

  let pemKey = privateKey.trim().replace(/\\n/g, '\n');
  if (!pemKey.includes('-----BEGIN')) {
    throw new Error('Invalid private key format: Missing PEM headers.');
  }
  pemKey = pemKey
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/, '-----BEGIN PRIVATE KEY-----')
    .replace(/-----END (RSA )?PRIVATE KEY-----/, '-----END PRIVATE KEY-----');

  const pemContents = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
    .trim();

  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  if (!base64Regex.test(pemContents)) {
    throw new Error('Invalid private key: base64 characters invalid');
  }

  const keyBytes = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(dataToSign));
  const sigB64 = b64url(String.fromCharCode(...new Uint8Array(signature)));
  return { jwt: `${dataToSign}.${sigB64}`, header, payload };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const transipApiKey = Deno.env.get('TRANSIP_API_KEY');
    if (!transipApiKey) throw new Error('TRANSIP_API_KEY not configured');

    const fallbackToken = Deno.env.get('TRANSIP_ACCESS_TOKEN');
    const login = Deno.env.get('TRANSIP_LOGIN') || 'atashi';

    if (fallbackToken) {
      console.log('⚠️ Using TRANSIP_ACCESS_TOKEN from secret (bypass /v6/auth)');
      return new Response(
        JSON.stringify({
          success: true,
          bypass: true,
          message: 'Using provided access token',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { jwt, header, payload } = await generateTransIPJWT(transipApiKey);

    const response = await fetch('https://api.transip.nl/v6/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Signature': jwt },
      body: JSON.stringify({
        login,
        nonce: Math.random().toString(36).slice(2),
        read_only: true,
        expiration_time: '30 minutes',
        label: 'Auth Test',
        global_key: false,
      }),
    });

    const raw = await response.text();
    const status = response.status;

    console.log(`🔎 Auth test response ${status}: ${raw}`);

    let token: string | undefined;
    try {
      const json = JSON.parse(raw);
      token = json?.token;
    } catch {}

    return new Response(
      JSON.stringify({
        success: response.ok,
        status,
        raw,
        token_present: !!token,
        claims: { header, payload },
        login,
      }, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: response.ok ? 200 : 500 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('❌ transip-auth-test error:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
