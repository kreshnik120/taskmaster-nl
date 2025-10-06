import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TransIPDNSEntry {
  name: string;
  expire: number;
  type: string;
  content: string;
}

interface QuickChecks {
  mx_ok: boolean;
  spf_ok: boolean;
  dkim_ok: boolean;
  tracking_ok: boolean;
}

interface AuditResult {
  success: boolean;
  total_entries: number;
  filtered_entries: TransIPDNSEntry[];
  quick_checks: QuickChecks;
  notes: string[];
  error?: string;
}

async function generateTransIPToken(privateKey: string): Promise<string> {
  console.log('🔑 Generating TransIP authentication token');
  
  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const payload = {
    iss: "citozorg",
    aud: "https://api.transip.nl",
    nbf: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    readonly: true
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const dataToSign = `${headerB64}.${payloadB64}`;

  const privateKeyFormatted = privateKey
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/, '-----BEGIN PRIVATE KEY-----')
    .replace(/-----END (RSA )?PRIVATE KEY-----/, '-----END PRIVATE KEY-----');

  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = privateKeyFormatted
    .replace(pemHeader, '')
    .replace(pemFooter, '')
    .replace(/\s/g, '');

  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(dataToSign)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${dataToSign}.${signatureB64}`;
}

async function getCurrentTransIPDNS(domain: string, token: string): Promise<TransIPDNSEntry[]> {
  console.log(`📡 Fetching current DNS records from TransIP for ${domain}`);
  
  const response = await fetch(`https://api.transip.nl/v6/domains/${domain}/dns`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ TransIP API error: ${response.status} - ${errorText}`);
    throw new Error(`TransIP API error: ${response.status}`);
  }

  const data = await response.json();
  console.log(`✅ Retrieved ${data.dnsEntries?.length || 0} DNS entries`);
  return data.dnsEntries || [];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔍 TransIP DNS Audit starting...');

    const transipApiKey = Deno.env.get('TRANSIP_API_KEY');
    if (!transipApiKey) {
      throw new Error('TRANSIP_API_KEY not configured');
    }

    const { base_domain = 'citozorg.nl', filter_subdomain = 'apply' } = await req.json();
    console.log(`📋 Auditing domain: ${base_domain}, subdomain: ${filter_subdomain}`);

    // Generate TransIP token
    const token = await generateTransIPToken(transipApiKey);

    // Get all DNS records
    const allEntries = await getCurrentTransIPDNS(base_domain, token);
    console.log(`📊 Total entries in TransIP: ${allEntries.length}`);

    // Filter for relevant subdomain records
    const subdomain = filter_subdomain;
    const filteredEntries = allEntries.filter(entry => {
      const name = entry.name.toLowerCase();
      return (
        name === subdomain ||
        name === `@` ||
        name.includes(subdomain) ||
        name.includes('mailgun') ||
        name.includes('domainkey')
      );
    });

    console.log(`🎯 Filtered entries: ${filteredEntries.length}`);

    // Quick checks
    const quick_checks: QuickChecks = {
      mx_ok: false,
      spf_ok: false,
      dkim_ok: false,
      tracking_ok: false
    };

    const notes: string[] = [];

    // Check MX records
    const mxRecords = filteredEntries.filter(e => 
      e.type === 'MX' && 
      e.name === subdomain &&
      (e.content.includes('mxa.eu.mailgun.org') || e.content.includes('mxb.eu.mailgun.org'))
    );
    quick_checks.mx_ok = mxRecords.length >= 2;
    if (!quick_checks.mx_ok) {
      notes.push(`⚠️ Missing or incomplete MX records for ${subdomain} (expected mxa.eu.mailgun.org and mxb.eu.mailgun.org)`);
    }

    // Check SPF record
    const spfRecord = filteredEntries.find(e => 
      e.type === 'TXT' && 
      e.name === subdomain &&
      e.content.includes('v=spf1') &&
      e.content.includes('include:mailgun.org')
    );
    quick_checks.spf_ok = !!spfRecord;
    if (!quick_checks.spf_ok) {
      notes.push(`⚠️ Missing SPF TXT record for ${subdomain} (expected: v=spf1 include:mailgun.org ~all)`);
    }

    // Check DKIM records
    const dkimRecords = filteredEntries.filter(e => 
      e.type === 'TXT' && 
      e.name.includes('domainkey') &&
      e.name.includes(subdomain) &&
      e.content.includes('k=rsa')
    );
    quick_checks.dkim_ok = dkimRecords.length > 0;
    if (!quick_checks.dkim_ok) {
      notes.push(`⚠️ Missing DKIM TXT records (expected at default._domainkey.${subdomain} or similar)`);
    }

    // Check tracking CNAME
    const trackingRecord = filteredEntries.find(e => 
      e.type === 'CNAME' && 
      e.name === `email.${subdomain}` &&
      e.content.includes('eu.mailgun.org')
    );
    quick_checks.tracking_ok = !!trackingRecord;
    if (!quick_checks.tracking_ok) {
      notes.push(`⚠️ Missing tracking CNAME (expected: email.${subdomain} -> eu.mailgun.org)`);
    }

    if (notes.length === 0) {
      notes.push('✅ All expected Mailgun DNS records found in TransIP!');
    }

    const result: AuditResult = {
      success: true,
      total_entries: allEntries.length,
      filtered_entries: filteredEntries,
      quick_checks,
      notes
    };

    console.log('✅ Audit complete');
    console.log(`Quick checks: MX=${quick_checks.mx_ok}, SPF=${quick_checks.spf_ok}, DKIM=${quick_checks.dkim_ok}, Tracking=${quick_checks.tracking_ok}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ TransIP DNS Audit error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        total_entries: 0,
        filtered_entries: [],
        quick_checks: { mx_ok: false, spf_ok: false, dkim_ok: false, tracking_ok: false },
        notes: [`Error: ${errorMessage}`]
      } as AuditResult),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
