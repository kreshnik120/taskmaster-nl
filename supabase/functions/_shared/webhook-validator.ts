/**
 * Verifies Svix webhook signature from Resend using Web Crypto API
 * Prevents replay attacks by checking timestamp freshness (max 5 minutes)
 * @returns true if signature is valid, false otherwise
 */
export async function verifySvixSignature(
  payload: string,
  headers: Headers,
  secret: string
): Promise<boolean> {
  const signature = headers.get("svix-signature");
  const timestamp = headers.get("svix-timestamp");
  const id = headers.get("svix-id");

  if (!signature || !timestamp || !id) {
    console.error("❌ Missing Svix headers", { 
      hasSignature: !!signature, 
      hasTimestamp: !!timestamp, 
      hasId: !!id 
    });
    return false;
  }

  // Check timestamp freshness (max 5 minutes old to prevent replay attacks)
  const now = Math.floor(Date.now() / 1000);
  const webhookTimestamp = parseInt(timestamp, 10);
  const timeDiff = Math.abs(now - webhookTimestamp);
  
  if (timeDiff > 300) {
    console.error("❌ Webhook timestamp too old", { 
      timeDiff, 
      maxAge: 300,
      webhookTimestamp,
      currentTimestamp: now 
    });
    return false;
  }

  // Compute expected signature using Web Crypto API
  // Svix/Resend secrets have format "whsec_<base64>" - we need to strip prefix and decode
  const signedContent = `${id}.${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  
  // Strip whsec_ prefix if present and base64-decode the secret
  const secretPart = secret.startsWith('whsec_') ? secret.substring(6) : secret;
  const keyData = Uint8Array.from(atob(secretPart), c => c.charCodeAt(0));
  
  const messageData = encoder.encode(signedContent);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  const expectedSignature = btoa(String.fromCharCode(...signatureArray));

  // Parse signature header (format: "v1,signature1 v1,signature2")
  const signatures = signature.split(" ").map(s => {
    const parts = s.split(",");
    return parts.length > 1 ? parts[1] : parts[0];
  });
  
  const isValid = signatures.some(sig => sig === expectedSignature);
  
  if (!isValid) {
    console.error("❌ Signature mismatch", {
      expected: expectedSignature.substring(0, 20) + "...",
      received: signatures[0]?.substring(0, 20) + "..."
    });
  } else {
    console.log("✅ Webhook signature verified", { id, timeDiff });
  }
  
  return isValid;
}
