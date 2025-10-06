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

async function generateTransIPToken(privateKey: string): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: 'atashi',
    aud: 'https://api.transip.nl',
    iat: now,
    exp: now + 3600,
    readonly: false,
    global_key: true
  }

  const encoder = new TextEncoder()
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const dataToSign = `${encodedHeader}.${encodedPayload}`

  // Import the private key
  const pemKey = privateKey.replace(/\\n/g, '\n')
  const pemContents = pemKey.replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))
  
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
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

async function getMailgunDNSRequirements(domain: string, apiKey: string): Promise<MailgunDomainData> {
  console.log(`📋 Getting Mailgun DNS requirements for ${domain}`)
  
  const response = await fetch(`https://api.eu.mailgun.net/v3/domains/${domain}`, {
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

async function verifyMailgunDomain(domain: string, apiKey: string) {
  console.log(`✅ Requesting Mailgun to verify ${domain}`)
  
  const response = await fetch(`https://api.eu.mailgun.net/v3/domains/${domain}/verify`, {
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

    const mailgunDomain = 'apply.citozorg.nl'
    const baseDomain = 'citozorg.nl'
    const subdomain = 'apply'

    console.log('🚀 Starting Mailgun + TransIP DNS Setup')
    console.log(`📧 Mailgun domain: ${mailgunDomain}`)
    console.log(`🌐 Base domain: ${baseDomain}`)

    // Step 1: Get Mailgun DNS requirements
    const mailgunData = await getMailgunDNSRequirements(mailgunDomain, mailgunApiKey)
    
    // Step 2: Generate TransIP token
    console.log('🔑 Generating TransIP authentication token')
    const transipToken = await generateTransIPToken(transipApiKey)
    
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
    
    const verificationResult = await verifyMailgunDomain(mailgunDomain, mailgunApiKey)

    // Step 7: Get updated domain status
    const finalStatus = await getMailgunDNSRequirements(mailgunDomain, mailgunApiKey)

    const report = {
      status: 'success',
      domain: mailgunDomain,
      base_domain: baseDomain,
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
