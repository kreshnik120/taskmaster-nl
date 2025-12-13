import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// TransIP API v6 endpoint
const TRANSIP_API_URL = "https://api.transip.nl/v6";

interface TransIPDnsEntry {
  name: string;
  expire: number;
  type: string;
  content: string;
}

// Generate access token for TransIP API authentication
async function getAccessToken(): Promise<string> {
  const accountName = Deno.env.get("TRANSIP_ACCOUNT_NAME");
  const privateKeyPem = Deno.env.get("TRANSIP_PRIVATE_KEY");

  if (!accountName || !privateKeyPem) {
    throw new Error("TransIP credentials not configured. Please add TRANSIP_ACCOUNT_NAME and TRANSIP_PRIVATE_KEY secrets.");
  }

  // Create request body for token generation
  const requestBody = JSON.stringify({
    login: accountName,
    nonce: crypto.randomUUID(),
    read_only: false,
    expiration_time: "30 minutes",
    label: "lovable-dns-management",
    global_key: true
  });

  // Extract the key content from PEM format
  // Handle both traditional and PKCS8 formats
  let pemContents = privateKeyPem
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/g, "")
    .replace(/-----END (RSA )?PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "")  // Handle escaped newlines from env vars
    .replace(/\s/g, "");

  // Convert base64 to binary
  let binaryKey: Uint8Array;
  try {
    binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  } catch (e) {
    throw new Error(`Failed to decode private key. Make sure it's a valid PEM-encoded RSA private key. Error: ${e}`);
  }

  // Try to import as PKCS8
  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      binaryKey.buffer as ArrayBuffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" },
      false,
      ["sign"]
    );
  } catch (e) {
    console.log("PKCS8 import failed, this may be a PKCS1 key. TransIP requires signing with the private key.");
    throw new Error(`Failed to import private key. TransIP requires a PKCS8 formatted private key. Original error: ${e}`);
  }

  // Sign the request body
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(requestBody)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

  // Request access token from TransIP
  const response = await fetch(`${TRANSIP_API_URL}/auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Signature": signatureB64,
    },
    body: requestBody,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("TransIP auth error:", response.status, errorText);
    throw new Error(`TransIP authentication failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.token;
}

// List DNS records for a domain
async function listDnsRecords(domain: string): Promise<TransIPDnsEntry[]> {
  const token = await getAccessToken();
  
  const response = await fetch(`${TRANSIP_API_URL}/domains/${domain}/dns`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("TransIP API error:", response.status, errorText);
    throw new Error(`Failed to list DNS records: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.dnsEntries || [];
}

// Add a DNS record
async function addDnsRecord(domain: string, entry: TransIPDnsEntry): Promise<void> {
  const token = await getAccessToken();
  
  // First get existing records
  const existingRecords = await listDnsRecords(domain);
  
  // Check if record already exists
  const exists = existingRecords.some(
    r => r.name === entry.name && r.type === entry.type && r.content === entry.content
  );
  
  if (exists) {
    console.log("Record already exists, skipping");
    return;
  }
  
  // Add new record to the list
  const updatedRecords = [...existingRecords, entry];
  
  const response = await fetch(`${TRANSIP_API_URL}/domains/${domain}/dns`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ dnsEntries: updatedRecords }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("TransIP API error:", response.status, errorText);
    throw new Error(`Failed to add DNS record: ${response.status} - ${errorText}`);
  }
}

// Delete a DNS record
async function deleteDnsRecord(domain: string, entry: Partial<TransIPDnsEntry>): Promise<void> {
  const token = await getAccessToken();
  
  // Get existing records
  const existingRecords = await listDnsRecords(domain);
  
  // Filter out the record to delete
  const updatedRecords = existingRecords.filter(
    r => !(r.name === entry.name && r.type === entry.type && 
           (entry.content ? r.content === entry.content : true))
  );
  
  if (updatedRecords.length === existingRecords.length) {
    console.log("Record not found, nothing to delete");
    return;
  }
  
  const response = await fetch(`${TRANSIP_API_URL}/domains/${domain}/dns`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ dnsEntries: updatedRecords }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("TransIP API error:", response.status, errorText);
    throw new Error(`Failed to delete DNS record: ${response.status} - ${errorText}`);
  }
}

// Check MX record status for inbound email
async function checkMxStatus(domain: string): Promise<{
  hasInboundMx: boolean;
  currentMxRecords: TransIPDnsEntry[];
  needsFix: boolean;
}> {
  const records = await listDnsRecords(domain);
  
  const mxRecords = records.filter(r => r.type === "MX");
  const hasInboundMx = mxRecords.some(
    r => r.name === "inbound" && r.content.includes("inbound.resend.com")
  );
  
  return {
    hasInboundMx,
    currentMxRecords: mxRecords,
    needsFix: !hasInboundMx,
  };
}

// Fix MX record for Resend inbound
async function fixMxRecord(domain: string): Promise<{ success: boolean; message: string }> {
  const status = await checkMxStatus(domain);
  
  if (!status.needsFix) {
    return { success: true, message: "MX record already configured correctly" };
  }
  
  // Add the correct MX record for Resend inbound
  await addDnsRecord(domain, {
    name: "inbound",
    expire: 3600,
    type: "MX",
    content: "10 inbound.resend.com",
  });
  
  return { 
    success: true, 
    message: "MX record added: inbound -> inbound.resend.com (priority 10)" 
  };
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, domain = "citozorg.nl", record } = await req.json();

    console.log(`[manage-dns] Action: ${action}, Domain: ${domain}`);

    let result: unknown;

    switch (action) {
      case "list_records":
        result = await listDnsRecords(domain);
        break;

      case "add_record":
        if (!record) {
          throw new Error("Record data required for add_record action");
        }
        await addDnsRecord(domain, record);
        result = { success: true, message: "Record added successfully" };
        break;

      case "delete_record":
        if (!record) {
          throw new Error("Record data required for delete_record action");
        }
        await deleteDnsRecord(domain, record);
        result = { success: true, message: "Record deleted successfully" };
        break;

      case "check_mx_status":
        result = await checkMxStatus(domain);
        break;

      case "fix_mx_record":
        result = await fixMxRecord(domain);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("[manage-dns] Error:", errorMessage);
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: errorStack 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
