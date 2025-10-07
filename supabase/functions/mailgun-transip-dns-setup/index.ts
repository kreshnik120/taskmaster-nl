import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TransIPDNSEntry {
  name: string
  expire: number
  type: string
  content: string
}

interface MailgunDNSRecord {
  record_type: string
  valid: string
  name: string
  value: string
  priority?: number
}

interface MailgunDomainData {
  sending_dns_records: MailgunDNSRecord[]
  receiving_dns_records: MailgunDNSRecord[]
  state: string
}

async function generateTransIPJWT(privateKey: string): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const jti = crypto.randomUUID()
  
  const payload = {
    iss: 'api.transip.nl',
    aud: 'api.transip.nl',
    jti: jti,
    iat: now,
    nbf: now,
    exp: now + 3600,
    readonly: false
  }

  const encoder = new TextEncoder()
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const dataToSign = `${encodedHeader}.${encodedPayload}`

  // Handle different key formats and normalize
  let pemKey = privateKey.trim()
  
  // Replace literal \n with actual newlines
  pemKey = pemKey.replace(/\\n/g, '\n')
  
  // Ensure proper PEM headers
  if (!pemKey.includes('-----BEGIN')) {
    throw new Error('Invalid private key format: Missing PEM headers. Key must start with -----BEGIN PRIVATE KEY-----')
  }
  
  // Normalize PEM headers to standard format
  pemKey = pemKey.replace(/-----BEGIN (RSA )?PRIVATE KEY-----/, '-----BEGIN PRIVATE KEY-----')
  pemKey = pemKey.replace(/-----END (RSA )?PRIVATE KEY-----/, '-----END PRIVATE KEY-----')
  
  // Extract base64 content (remove headers and all whitespace)
  const pemContents = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
    .trim()
  
  // Validate base64 content
  if (!pemContents || pemContents.length === 0) {
    throw new Error('Invalid private key: No key content found after removing PEM headers')
  }
  
  // Validate base64 characters
  const base64Regex = /^[A-Za-z0-9+/]+=*$/
  if (!base64Regex.test(pemContents)) {
    throw new Error('Invalid private key: Contains invalid base64 characters. Ensure key is properly formatted.')
  }
  
  let binaryKey: Uint8Array
  try {
    binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))
  } catch (e) {
    throw new Error(`Failed to decode private key: ${e instanceof Error ? e.message : 'Invalid base64'}. Ensure key is in PKCS#8 PEM format.`)
  }
  
  // Create a proper ArrayBuffer for crypto.subtle.importKey
  const keyBuffer = new Uint8Array(binaryKey)
  
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(dataToSign)
  )

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  return `${dataToSign}.${encodedSignature}`
}

async function getTransIPAccessToken(privateKey: string): Promise<string> {
  console.log('🔐 Requesting access token from TransIP /v6/auth')
  
  const jwt = await generateTransIPJWT(privateKey)
  
  const response = await fetch('https://api.transip.nl/v6/auth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Signature': jwt
    },
    body: JSON.stringify({
      login: 'atashi',
      nonce: Math.random().toString(36).substring(2, 15),
      read_only: false,
      expiration_time: '30 minutes',
      label: 'Mailgun DNS Setup',
      global_key: true
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`❌ TransIP auth failed: ${response.status} - ${errorText}`)
    throw new Error(`TransIP authentication failed: ${response.status}. Check: 1) issuer is "atashi", 2) private key format (PKCS#8), 3) key is valid`)
  }

  const data = await response.json()
  console.log('✅ Access token received from TransIP')
  return data.token
}

async function getMailgunDNSRequirements(domain: string, apiKey: string, baseUrl: string = 'https://api.eu.mailgun.net/v3'): Promise<MailgunDomainData> {
  console.log(`📋 Getting Mailgun DNS requirements for ${domain}`)
  
  const response = await fetch(`${baseUrl}/domains/${domain}`, {
    headers: {
      'Authorization': `Basic ${btoa(`api:${apiKey}`)}`
    }
  })

  if (!response.ok) {
    throw new Error(`Mailgun API error: ${response.status} ${await response.text()}`)
  }

  const data = await response.json()
  console.log('✅ Mailgun domain data retrieved')
  
  return {
    sending_dns_records: data.domain?.sending_dns_records || [],
    receiving_dns_records: data.domain?.receiving_dns_records || [],
    state: data.domain?.state || 'unverified'
  }
}

async function getCurrentTransIPDNS(domain: string, token: string): Promise<TransIPDNSEntry[]> {
  console.log(`🔍 Checking current DNS records for ${domain}`)
  
  const response = await fetch(`https://api.transip.nl/v6/domains/${domain}/dns`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`TransIP API error: ${response.status} ${await response.text()}`)
  }

  const data = await response.json()
  console.log(`✅ Found ${data.dnsEntries?.length || 0} existing DNS records`)
  
  return data.dnsEntries || []
}

async function updateTransIPDNS(domain: string, token: string, dnsEntries: TransIPDNSEntry[]) {
  console.log(`📝 Updating DNS records for ${domain}`)
  
  const response = await fetch(`https://api.transip.nl/v6/domains/${domain}/dns`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      dnsEntries: dnsEntries
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`TransIP DNS update error: ${response.status} ${errorText}`)
  }

  console.log('✅ DNS records updated successfully')
}

async function verifyMailgunDomain(domain: string, apiKey: string, baseUrl: string = 'https://api.eu.mailgun.net/v3') {
  console.log(`✅ Requesting Mailgun to verify ${domain}`)
  
  const response = await fetch(`${baseUrl}/domains/${domain}/verify`, {
    method: 'PUT',
    headers: {
      'Authorization': `Basic ${btoa(`api:${apiKey}`)}`
    }
  })

  if (!response.ok) {
    throw new Error(`Mailgun verify error: ${response.status} ${await response.text()}`)
  }

  const data = await response.json()
  console.log('✅ Mailgun verification requested')
  
  return data
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const mailgunApiKey = Deno.env.get('MAILGUN_API_KEY')
    const transipApiKey = Deno.env.get('TRANSIP_API_KEY')

    if (!mailgunApiKey) {
      throw new Error('MAILGUN_API_KEY not configured')
    }

    if (!transipApiKey) {
      throw new Error('TRANSIP_API_KEY not configured')
    }

    const { add_dmarc = false, dmarc_value = 'v=DMARC1; p=none; pct=100; fo=1; ri=3600; rua=mailto:fa9f1045@dmarc.mailgun.org,mailto:e0604c4b@inbox.ondmarc.com; ruf=mailto:fa9f1045@dmarc.mailgun.org,mailto:e0604c4b@inbox.ondmarc.com;' } = await req.json()
    
    const mailgunDomain = 'apply.citozorg.nl'
    const baseDomain = 'citozorg.nl'
    const subdomain = 'apply'

    console.log('🚀 Starting Mailgun + TransIP DNS Setup')
    console.log(`📧 Mailgun domain: ${mailgunDomain}`)
    console.log(`🌐 Base domain: ${baseDomain}`)
    console.log(`🛡️ DMARC toevoegen: ${add_dmarc}`)

    // Auto-detect Mailgun region
    let mailgunRegion = 'EU'
    let mailgunBaseUrl = 'https://api.eu.mailgun.net/v3'
    
    try {
      const testResponse = await fetch(`${mailgunBaseUrl}/domains/${mailgunDomain}`, {
        headers: {
          'Authorization': `Basic ${btoa(`api:${mailgunApiKey}`)}`,
        },
      })
      
      if (!testResponse.ok && testResponse.status === 401) {
        mailgunRegion = 'US'
        mailgunBaseUrl = 'https://api.mailgun.net/v3'
        console.log('🌎 Using US region for Mailgun API')
      } else {
        console.log('🇪🇺 Using EU region for Mailgun API')
      }
    } catch (error) {
      console.log('⚠️ Region detection failed, defaulting to EU')
    }

    // Step 1: Get Mailgun DNS requirements
    const mailgunData = await getMailgunDNSRequirements(mailgunDomain, mailgunApiKey, mailgunBaseUrl)
    
    // Step 2: Get TransIP access token via /v6/auth
    console.log('🔑 Getting TransIP access token')
    const transipToken = await getTransIPAccessToken(transipApiKey)
    
    // Step 3: Get current DNS records
    const currentDNS = await getCurrentTransIPDNS(baseDomain, transipToken)
    
    // Step 4: Prepare required DNS records
    const requiredRecords: TransIPDNSEntry[] = []
    const actionsTaken: string[] = []

    // Add MX records from Mailgun
    for (const record of mailgunData.receiving_dns_records) {
      if (record.record_type === 'MX') {
        const recordName = subdomain // apply
        const existingMX = currentDNS.find(
          r => r.type === 'MX' && r.name === recordName && r.content.includes(record.value)
        )
        
        if (!existingMX) {
          requiredRecords.push({
            name: recordName,
            expire: 3600,
            type: 'MX',
            content: `${record.priority} ${record.value}`
          })
          actionsTaken.push(`✅ MX record ${record.value} toegevoegd voor ${recordName}.${baseDomain}`)
        } else {
          actionsTaken.push(`ℹ️ MX record ${record.value} was al correct`)
        }
      }
    }

    // Add TXT records (SPF, DKIM) from Mailgun
    for (const record of mailgunData.sending_dns_records) {
      if (record.record_type === 'TXT') {
        let recordName = record.name.replace(`.${mailgunDomain}`, '')
        if (recordName === mailgunDomain) {
          recordName = subdomain // For root domain records
        } else if (recordName.includes('.')) {
          // For records like smtp._domainkey.apply.citozorg.nl
          recordName = recordName.replace(`.${subdomain}`, '')
        }
        
        const existingTXT = currentDNS.find(
          r => r.type === 'TXT' && r.name === recordName && r.content === record.value
        )
        
        if (!existingTXT) {
          requiredRecords.push({
            name: recordName,
            expire: 3600,
            type: 'TXT',
            content: record.value
          })
          actionsTaken.push(`✅ TXT record ${recordName} toegevoegd (${record.valid || 'SPF/DKIM'})`)
        } else {
          actionsTaken.push(`ℹ️ TXT record ${recordName} was al correct`)
        }
      }

      // Add CNAME records from Mailgun
      if (record.record_type === 'CNAME') {
        let recordName = record.name.replace(`.${mailgunDomain}`, '')
        if (recordName.includes(`.${subdomain}`)) {
          recordName = recordName.replace(`.${subdomain}`, '')
        }
        
        const existingCNAME = currentDNS.find(
          r => r.type === 'CNAME' && r.name === recordName && r.content === record.value
        )
        
        if (!existingCNAME) {
          requiredRecords.push({
            name: recordName,
            expire: 3600,
            type: 'CNAME',
            content: record.value
          })
          actionsTaken.push(`✅ CNAME record ${recordName} → ${record.value} toegevoegd`)
        } else {
          actionsTaken.push(`ℹ️ CNAME record ${recordName} was al correct`)
        }
      }
    }

    // Add DMARC record if requested
    if (add_dmarc) {
      const dmarcName = `_dmarc.${subdomain}`
      const existingDMARC = currentDNS.find(
        r => r.type === 'TXT' && r.name === dmarcName
      )
      
      if (!existingDMARC) {
        requiredRecords.push({
          name: dmarcName,
          expire: 3600,
          type: 'TXT',
          content: dmarc_value
        })
        actionsTaken.push(`✅ DMARC record toegevoegd voor ${dmarcName}.${baseDomain}`)
      } else {
        actionsTaken.push(`ℹ️ DMARC record ${dmarcName} was al aanwezig`)
      }
    }

    // Step 5: Update DNS if needed
    if (requiredRecords.length > 0) {
      console.log(`📝 Adding ${requiredRecords.length} new DNS records`)
      
      // Combine existing records with new ones
      const allRecords = [...currentDNS, ...requiredRecords]
      await updateTransIPDNS(baseDomain, transipToken, allRecords)
    } else {
      console.log('ℹ️ All DNS records already correct')
      actionsTaken.push('ℹ️ Alle DNS records waren al correct geconfigureerd')
    }

    // Step 6: Wait a bit for DNS propagation, then verify with Mailgun
    console.log('⏳ Waiting 5 seconds for DNS propagation...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    const verificationResult = await verifyMailgunDomain(mailgunDomain, mailgunApiKey, mailgunBaseUrl)

    // Step 7: Get updated domain status
    const finalStatus = await getMailgunDNSRequirements(mailgunDomain, mailgunApiKey, mailgunBaseUrl)

    const report = {
      success: true,
      status: 'success',
      domain: mailgunDomain,
      base_domain: baseDomain,
      mailgun_region: mailgunRegion,
      mailgun_state: finalStatus.state,
      mailgun_verified: finalStatus.state === 'active',
      actions_taken: actionsTaken,
      dns_records_added: requiredRecords.length,
      verification_result: verificationResult,
      next_steps: finalStatus.state === 'active'
        ? [
            '✅ Alle DNS records zijn correct!',
            '✅ Mailgun domein is geverifieerd!',
            '✅ Je kan nu emails versturen via personeel@apply.citozorg.nl'
          ]
        : [
            '⏳ DNS records zijn aangemaakt',
            '⏳ Wacht 10-15 minuten voor volledige DNS propagatie',
            '⏳ Run deze functie opnieuw om verificatie te controleren'
          ]
    }

    console.log('🎉 DNS Setup complete!')
    console.log(JSON.stringify(report, null, 2))

    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    console.error('❌ Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({
      status: 'error',
      error: errorMessage,
      details: 'Check edge function logs for more information'
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
