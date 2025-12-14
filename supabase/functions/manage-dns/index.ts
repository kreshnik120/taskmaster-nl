const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TRANSIP_API_URL = "https://api.transip.nl/v6";

interface TransIPDnsEntry {
  name: string;
  expire: number;
  type: string;
  content: string;
}

// Base64URL encode
function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Generate JWT and get access token from TransIP
async function getAccessToken(): Promise<string> {
  const privateKeyPem = Deno.env.get("TRANSIP_PRIVATE_KEY");
  const accountName = Deno.env.get("TRANSIP_ACCOUNT_NAME");
  
  if (!privateKeyPem) {
    throw new Error("TRANSIP_PRIVATE_KEY secret not configured");
  }
  if (!accountName) {
    throw new Error("TRANSIP_ACCOUNT_NAME secret not configured");
  }

  console.log(`[TransIP] Generating JWT for account: ${accountName}`);
  
  // Convert PEM to binary - handle both PKCS#1 and PKCS#8 formats
  let pemContent = privateKeyPem.trim();
  
  // Remove headers/footers and newlines
  pemContent = pemContent
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, '')
    .replace(/-----END RSA PRIVATE KEY-----/g, '')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  
  // Decode base64
  const binaryString = atob(pemContent);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // Import the key - try PKCS#8 first, then PKCS#1
  let privateKey: CryptoKey;
  try {
    privateKey = await crypto.subtle.importKey(
      "pkcs8",
      bytes,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" },
      false,
      ["sign"]
    );
  } catch {
    // Try wrapping PKCS#1 in PKCS#8 structure
    console.log("[TransIP] PKCS#8 import failed, trying PKCS#1 wrapper...");
    
    // PKCS#8 wrapper for RSA PKCS#1 key
    const pkcs8Header = new Uint8Array([
      0x30, 0x82, // SEQUENCE
      0x00, 0x00, // length placeholder (will be filled)
      0x02, 0x01, 0x00, // INTEGER version = 0
      0x30, 0x0d, // SEQUENCE (AlgorithmIdentifier)
      0x06, 0x09, // OID
      0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, // rsaEncryption
      0x05, 0x00, // NULL
      0x04, 0x82, // OCTET STRING
      0x00, 0x00, // length placeholder (will be filled)
    ]);
    
    // Calculate lengths
    const innerLength = bytes.length;
    const outerLength = innerLength + 22;
    
    // Create wrapped key
    const wrappedKey = new Uint8Array(outerLength + 4);
    wrappedKey.set(pkcs8Header);
    
    // Fill in lengths
    wrappedKey[2] = (outerLength >> 8) & 0xff;
    wrappedKey[3] = outerLength & 0xff;
    wrappedKey[24] = (innerLength >> 8) & 0xff;
    wrappedKey[25] = innerLength & 0xff;
    
    // Add the key data
    wrappedKey.set(bytes, 26);
    
    try {
      privateKey = await crypto.subtle.importKey(
        "pkcs8",
        wrappedKey,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" },
        false,
        ["sign"]
      );
    } catch (e2) {
      console.error("[TransIP] Key import failed:", e2);
      throw new Error("Failed to import private key. Ensure it's a valid RSA key.");
    }
  }
  
  console.log("[TransIP] Private key imported successfully");
  
  // Create JWT header and payload
  const header = { alg: "RS512", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();
  
  const payload = {
    iss: accountName,
    sub: accountName,
    aud: "api.transip.nl",
    jti: nonce,
    iat: now,
    exp: now + 300, // 5 minutes
  };
  
  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  
  // Sign the JWT
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput)
  );
  
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));
  const jwt = `${signingInput}.${signatureB64}`;
  
  console.log("[TransIP] JWT generated, requesting access token...");

  // Exchange JWT for access token
  const authResponse = await fetch(`${TRANSIP_API_URL}/auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Signature": jwt,
    },
    body: JSON.stringify({
      login: accountName,
      nonce: nonce,
      read_only: false,
      expiration_time: "1 hour",
      label: "lovable-dns-" + Date.now(),
      global_key: true,
    }),
  });

  if (!authResponse.ok) {
    const errorText = await authResponse.text();
    console.error("[TransIP] Auth error:", authResponse.status, errorText);
    throw new Error(`TransIP auth failed: ${authResponse.status} - ${errorText}`);
  }

  const authData = await authResponse.json();
  console.log("[TransIP] Access token obtained successfully");
  
  return authData.token;
}

// Helper to list records with existing token
async function listDnsRecordsWithToken(domain: string, token: string): Promise<TransIPDnsEntry[]> {
  const response = await fetch(`${TRANSIP_API_URL}/domains/${domain}/dns`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to list DNS records: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.dnsEntries || [];
}

// List DNS records for a domain
async function listDnsRecords(domain: string): Promise<TransIPDnsEntry[]> {
  const token = await getAccessToken();
  return listDnsRecordsWithToken(domain, token);
}

// Add a DNS record
async function addDnsRecord(domain: string, entry: TransIPDnsEntry): Promise<void> {
  const token = await getAccessToken();
  
  // First get existing records
  const existingRecords = await listDnsRecordsWithToken(domain, token);
  
  // Check if record already exists
  const exists = existingRecords.some(
    r => r.name === entry.name && r.type === entry.type && r.content === entry.content
  );
  
  if (exists) {
    console.log("[TransIP] Record already exists, skipping");
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
    console.error("[TransIP] API error:", response.status, errorText);
    throw new Error(`Failed to add DNS record: ${response.status} - ${errorText}`);
  }
}

// Delete a DNS record
async function deleteDnsRecord(domain: string, entry: Partial<TransIPDnsEntry>): Promise<void> {
  const token = await getAccessToken();
  
  // Get existing records
  const existingRecords = await listDnsRecordsWithToken(domain, token);
  
  // Filter out the record to delete
  const updatedRecords = existingRecords.filter(
    r => !(r.name === entry.name && r.type === entry.type && 
           (entry.content ? r.content === entry.content : true))
  );
  
  if (updatedRecords.length === existingRecords.length) {
    console.log("[TransIP] Record not found, nothing to delete");
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
    console.error("[TransIP] API error:", response.status, errorText);
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
