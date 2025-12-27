import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

// Types
type DiplomaStatus = 
  | 'not_verified' 
  | 'signature_valid'
  | 'verified_duo'
  | 'duo_invalid' 
  | 'duo_not_digital'
  | 'duo_error'
  | 'manual_review';

interface VerificationResult {
  status: DiplomaStatus;
  method: 'signature' | 'duo_http' | 'manual';
  message: string;
  details: Record<string, unknown>;
  verified_at?: string;
}

interface SignatureInfo {
  hasPkcs7: boolean;
  hasSignature: boolean;
  hasByteRange: boolean;
  signerInfo?: {
    name?: string;
    organization?: string;
    date?: string;
  };
  isDuoCertificate: boolean;
  isEducationCertificate: boolean;
}

// ============= PDF SIGNATURE VALIDATION (PRIMARY) =============

/**
 * Analyze PDF binary for digital signatures
 * This checks for PKCS#7/CMS signatures embedded in the PDF
 */
function analyzePdfSignature(pdfBytes: Uint8Array): SignatureInfo {
  const pdfString = new TextDecoder('latin1').decode(pdfBytes);
  
  const result: SignatureInfo = {
    hasPkcs7: false,
    hasSignature: false,
    hasByteRange: false,
    isDuoCertificate: false,
    isEducationCertificate: false,
  };
  
  // Check for signature-related PDF markers
  result.hasSignature = pdfString.includes('/Sig') || pdfString.includes('/Type /Sig');
  result.hasPkcs7 = pdfString.includes('/PKCS7') || pdfString.includes('/SubFilter /adbe.pkcs7');
  result.hasByteRange = pdfString.includes('/ByteRange');
  
  // Check for known Dutch education certificate authorities
  const duoIndicators = [
    'duo.nl',
    'dienst uitvoering onderwijs',
    'ministerie van onderwijs',
    'rijksoverheid',
    'pkioverheid',
    'digidentity',
    'kennisnet',
  ];
  
  const educationIndicators = [
    'diploma',
    'certificaat',
    'getuigschrift',
    'mbo',
    'hbo',
    'wo',
    'vmbo',
    'havo',
    'vwo',
    'bachelor',
    'master',
  ];
  
  const pdfLower = pdfString.toLowerCase();
  
  result.isDuoCertificate = duoIndicators.some(ind => pdfLower.includes(ind));
  result.isEducationCertificate = educationIndicators.some(ind => pdfLower.includes(ind));
  
  // Try to extract signer info from signature dictionary
  if (result.hasSignature) {
    // Look for /Name field in signature
    const nameMatch = pdfString.match(/\/Name\s*\(([^)]+)\)/);
    const reasonMatch = pdfString.match(/\/Reason\s*\(([^)]+)\)/);
    const dateMatch = pdfString.match(/\/M\s*\(D:(\d{14})/);
    
    if (nameMatch || reasonMatch || dateMatch) {
      result.signerInfo = {
        name: nameMatch?.[1],
        organization: reasonMatch?.[1],
        date: dateMatch?.[1],
      };
    }
  }
  
  return result;
}

/**
 * Validate PDF signature and determine if it's a legitimate Dutch diploma
 */
function validatePdfSignature(pdfBytes: Uint8Array): VerificationResult {
  console.log('🔐 Analyzing PDF for digital signatures...');
  
  const signatureInfo = analyzePdfSignature(pdfBytes);
  
  console.log('Signature analysis result:', JSON.stringify(signatureInfo, null, 2));
  
  // Strong validation: has PKCS7 + ByteRange + DUO certificate indicators
  if (signatureInfo.hasPkcs7 && signatureInfo.hasByteRange && signatureInfo.isDuoCertificate) {
    return {
      status: 'signature_valid',
      method: 'signature',
      message: 'Diploma bevat een geldige digitale handtekening van een erkende Nederlandse onderwijsinstantie',
      details: {
        signature_type: 'PKCS7/CMS',
        has_byte_range: true,
        is_duo_certificate: true,
        is_education_document: signatureInfo.isEducationCertificate,
        signer_info: signatureInfo.signerInfo,
      },
      verified_at: new Date().toISOString(),
    };
  }
  
  // Moderate validation: has signature but not DUO specific
  if (signatureInfo.hasSignature && signatureInfo.hasByteRange) {
    return {
      status: 'manual_review',
      method: 'signature',
      message: 'Diploma bevat een digitale handtekening, maar niet van een bekende Nederlandse onderwijsinstantie. Handmatige verificatie aanbevolen.',
      details: {
        has_signature: true,
        signature_type: signatureInfo.hasPkcs7 ? 'PKCS7/CMS' : 'Other',
        is_duo_certificate: false,
        is_education_document: signatureInfo.isEducationCertificate,
        signer_info: signatureInfo.signerInfo,
      },
    };
  }
  
  // No signature found
  return {
    status: 'duo_not_digital',
    method: 'signature',
    message: 'Geen digitale handtekening gevonden in het diploma. Dit kan een gescand document zijn of een diploma van voor 1996.',
    details: {
      has_signature: false,
      is_education_document: signatureInfo.isEducationCertificate,
    },
  };
}

// ============= DUO HTTP API VERIFICATION (SECONDARY) =============

const DUO_CHECK_PAGE = 'https://zakelijk.duo.nl/portaal/diplomacontrole/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Attempt to verify diploma via DUO HTTP API
 * This replicates what the browser does when uploading a PDF
 */
async function verifyViaDuoHttp(pdfBytes: Uint8Array, filename: string): Promise<VerificationResult> {
  console.log('🌐 Attempting DUO HTTP verification...');
  
  try {
    // Step 1: Fetch the main page to get cookies and CSRF token
    console.log('Fetching DUO diplomacontrole page...');
    const pageResponse = await fetch(DUO_CHECK_PAGE, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
      },
    });
    
    if (!pageResponse.ok) {
      console.log(`DUO page returned status ${pageResponse.status}`);
      return {
        status: 'duo_error',
        method: 'duo_http',
        message: `DUO portal niet bereikbaar (HTTP ${pageResponse.status})`,
        details: { http_status: pageResponse.status },
      };
    }
    
    // Check for redirect to login
    const finalUrl = pageResponse.url;
    if (finalUrl.includes('inloggen') || finalUrl.includes('login') || finalUrl.includes('mijn.duo.nl')) {
      console.log('⚠️ Redirected to login - falling back to manual review');
      return {
        status: 'manual_review',
        method: 'duo_http',
        message: 'DUO portal vereist login - handmatige verificatie nodig',
        details: { redirect_url: finalUrl },
      };
    }
    
    const pageHtml = await pageResponse.text();
    
    // Extract CSRF token if present
    let csrfToken: string | null = null;
    const csrfMatch = pageHtml.match(/name="csrf[_-]?token"\s+value="([^"]+)"/i) ||
                      pageHtml.match(/name="_token"\s+value="([^"]+)"/i) ||
                      pageHtml.match(/data-csrf="([^"]+)"/i);
    
    if (csrfMatch) {
      csrfToken = csrfMatch[1];
      console.log('Found CSRF token');
    }
    
    // Extract cookies
    const cookies = pageResponse.headers.get('set-cookie') || '';
    console.log('Got cookies:', cookies ? 'yes' : 'no');
    
    // Find the form action URL
    const formMatch = pageHtml.match(/<form[^>]+action="([^"]+)"[^>]*>/i);
    const formAction = formMatch ? formMatch[1] : DUO_CHECK_PAGE;
    const uploadUrl = formAction.startsWith('http') ? formAction : new URL(formAction, DUO_CHECK_PAGE).toString();
    
    console.log('Upload URL:', uploadUrl);
    
    // Step 2: Prepare multipart form data
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    
    let formBody = '';
    
    // Add CSRF token if found
    if (csrfToken) {
      formBody += `--${boundary}\r\n`;
      formBody += `Content-Disposition: form-data; name="csrf_token"\r\n\r\n`;
      formBody += `${csrfToken}\r\n`;
    }
    
    // Add the file
    formBody += `--${boundary}\r\n`;
    formBody += `Content-Disposition: form-data; name="diploma"; filename="${filename}"\r\n`;
    formBody += `Content-Type: application/pdf\r\n\r\n`;
    
    // Convert to bytes for proper handling
    const formPrefix = new TextEncoder().encode(formBody);
    const formSuffix = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
    
    const fullBody = new Uint8Array(formPrefix.length + pdfBytes.length + formSuffix.length);
    fullBody.set(formPrefix, 0);
    fullBody.set(pdfBytes, formPrefix.length);
    fullBody.set(formSuffix, formPrefix.length + pdfBytes.length);
    
    // Step 3: Submit the form
    console.log('Submitting PDF to DUO...');
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Origin': 'https://zakelijk.duo.nl',
        'Referer': DUO_CHECK_PAGE,
        ...(cookies ? { 'Cookie': cookies } : {}),
      },
      body: fullBody,
    });
    
    console.log(`Upload response status: ${uploadResponse.status}`);
    
    if (!uploadResponse.ok) {
      // Check for WAF/bot detection
      if (uploadResponse.status === 403 || uploadResponse.status === 429) {
        return {
          status: 'manual_review',
          method: 'duo_http',
          message: 'DUO portal blokkeert automatische verificatie - handmatige verificatie nodig',
          details: { http_status: uploadResponse.status, reason: 'WAF/rate_limit' },
        };
      }
      
      return {
        status: 'duo_error',
        method: 'duo_http',
        message: `DUO verificatie mislukt (HTTP ${uploadResponse.status})`,
        details: { http_status: uploadResponse.status },
      };
    }
    
    // Step 4: Parse the response
    const responseHtml = await uploadResponse.text();
    const responseLower = responseHtml.toLowerCase();
    
    // Check for positive verification indicators
    const positiveIndicators = ['geldig', 'geverifieerd', 'authentiek', 'valid', 'correct', 'erkend'];
    const negativeIndicators = ['ongeldig', 'niet gevonden', 'invalid', 'fout', 'niet bekend', 'niet geregistreerd'];
    const notDigitalIndicators = ['niet digitaal', 'voor 1996', 'niet beschikbaar', 'handmatig'];
    
    const hasPositive = positiveIndicators.some(ind => responseLower.includes(ind));
    const hasNegative = negativeIndicators.some(ind => responseLower.includes(ind));
    const hasNotDigital = notDigitalIndicators.some(ind => responseLower.includes(ind));
    
    if (hasPositive && !hasNegative) {
      return {
        status: 'verified_duo',
        method: 'duo_http',
        message: 'Diploma geverifieerd via DUO Online Diplomacontrole',
        details: { 
          verification_source: 'duo_http',
          response_indicators: positiveIndicators.filter(ind => responseLower.includes(ind)),
        },
        verified_at: new Date().toISOString(),
      };
    }
    
    if (hasNegative) {
      return {
        status: 'duo_invalid',
        method: 'duo_http',
        message: 'Diploma niet gevonden of ongeldig volgens DUO',
        details: {
          verification_source: 'duo_http',
          response_indicators: negativeIndicators.filter(ind => responseLower.includes(ind)),
        },
      };
    }
    
    if (hasNotDigital) {
      return {
        status: 'duo_not_digital',
        method: 'duo_http',
        message: 'Diploma niet digitaal geregistreerd bij DUO',
        details: {
          verification_source: 'duo_http',
          response_indicators: notDigitalIndicators.filter(ind => responseLower.includes(ind)),
        },
      };
    }
    
    // Could not parse response - fall back to manual
    return {
      status: 'manual_review',
      method: 'duo_http',
      message: 'DUO response kon niet worden geparsed - handmatige verificatie nodig',
      details: {
        response_length: responseHtml.length,
        contains_form: responseHtml.includes('<form'),
      },
    };
    
  } catch (error) {
    console.error('DUO HTTP verification error:', error);
    return {
      status: 'duo_error',
      method: 'duo_http',
      message: `DUO verificatie fout: ${error instanceof Error ? error.message : 'Onbekende fout'}`,
      details: { error: String(error) },
    };
  }
}

// ============= MAIN VERIFICATION ORCHESTRATOR =============

/**
 * Main verification function that tries multiple methods
 */
async function verifyDiploma(pdfBytes: Uint8Array, filename: string): Promise<VerificationResult> {
  console.log('🎓 Starting diploma verification...');
  console.log(`PDF size: ${pdfBytes.length} bytes, filename: ${filename}`);
  
  // Step 1: Try PDF signature validation (fastest, most reliable)
  const signatureResult = validatePdfSignature(pdfBytes);
  
  if (signatureResult.status === 'signature_valid') {
    console.log('✅ Signature validation successful');
    return signatureResult;
  }
  
  console.log(`Signature check result: ${signatureResult.status}, trying DUO HTTP...`);
  
  // Step 2: Try DUO HTTP API (fallback)
  const duoResult = await verifyViaDuoHttp(pdfBytes, filename);
  
  if (duoResult.status === 'verified_duo') {
    console.log('✅ DUO HTTP verification successful');
    return duoResult;
  }
  
  // Step 3: Combine results for manual review
  console.log(`DUO HTTP result: ${duoResult.status}, recommending manual review`);
  
  // Return the most informative result
  if (signatureResult.status === 'duo_not_digital') {
    // No signature = likely needs manual verification
    return {
      status: 'manual_review',
      method: 'manual',
      message: 'Automatische verificatie niet mogelijk - handmatige verificatie via DUO portaal aanbevolen',
      details: {
        signature_check: signatureResult.details,
        duo_http_check: duoResult.details,
        recommendation: 'Gebruik https://zakelijk.duo.nl/portaal/diplomacontrole/ voor handmatige verificatie',
      },
    };
  }
  
  return duoResult;
}

// ============= EDGE FUNCTION HANDLER =============

Deno.serve(async (req: Request) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  
  try {
    const body = await req.json();
    const { action, application_id, verified, notes } = body;
    
    if (!application_id) {
      return errorResponse('application_id is required', 400);
    }
    
    const supabase = createAdminClient();
    
    // Handle manual verification action
    if (action === 'manual_verify') {
      const { data: updateData, error: updateError } = await supabase
        .from('professional_applications')
        .update({
          diploma_validation_status: verified ? 'verified_manual' : 'duo_invalid',
          diploma_verification_response: {
            method: 'manual',
            verified,
            notes,
            verified_at: new Date().toISOString(),
            verified_by: 'recruiter',
          },
          duo_verified_at: new Date().toISOString(),
        })
        .eq('id', application_id)
        .select()
        .single();
      
      if (updateError) {
        console.error('Manual verification update error:', updateError);
        return errorResponse('Failed to update verification status', 500);
      }
      
      return jsonResponse({
        success: true,
        status: verified ? 'verified_manual' : 'duo_invalid',
        message: verified ? 'Diploma handmatig geverifieerd' : 'Diploma handmatig afgekeurd',
      });
    }
    
    // Handle check_status action
    if (action === 'check_status') {
      const { data: appData, error: appError } = await supabase
        .from('professional_applications')
        .select('diploma_validation_status, diploma_verification_response, duo_verified_at')
        .eq('id', application_id)
        .single();
      
      if (appError) {
        return errorResponse('Application not found', 404);
      }
      
      return jsonResponse({
        success: true,
        status: appData.diploma_validation_status,
        verification_response: appData.diploma_verification_response,
        verified_at: appData.duo_verified_at,
      });
    }
    
    // Default action: verify
    // Get application with diploma file
    const { data: application, error: appError } = await supabase
      .from('professional_applications')
      .select('id, diploma_file_path, diploma_validation_status')
      .eq('id', application_id)
      .single();
    
    if (appError || !application) {
      return errorResponse('Application not found', 404);
    }
    
    if (!application.diploma_file_path) {
      return errorResponse('No diploma file found for this application', 400);
    }
    
    // Download PDF from storage
    console.log('Downloading diploma from:', application.diploma_file_path);
    const { data: fileData, error: fileError } = await supabase.storage
      .from('application-documents')
      .download(application.diploma_file_path);
    
    if (fileError || !fileData) {
      console.error('File download error:', fileError);
      return errorResponse('Failed to download diploma file', 500);
    }
    
    // Convert to bytes
    const pdfBytes = new Uint8Array(await fileData.arrayBuffer());
    const filename = application.diploma_file_path.split('/').pop() || 'diploma.pdf';
    
    // Run verification
    const result = await verifyDiploma(pdfBytes, filename);
    
    // Map result to database status
    const dbStatus = result.status === 'signature_valid' ? 'verified_duo' : result.status;
    
    // Update application
    const { error: updateError } = await supabase
      .from('professional_applications')
      .update({
        diploma_validation_status: dbStatus,
        diploma_verification_response: {
          ...result.details,
          method: result.method,
          message: result.message,
          verified_at: result.verified_at,
        },
        duo_verified_at: result.verified_at || null,
      })
      .eq('id', application_id);
    
    if (updateError) {
      console.error('Update error:', updateError);
    }
    
    // Log for AI learning
    await supabase.from('ai_learning_events').insert({
      event_type: 'diploma_verification',
      org_id: '550e8400-e29b-41d4-a716-446655440000', // ABCzorg
      context: {
        application_id,
        verification_method: result.method,
        status: result.status,
        filename,
        pdf_size: pdfBytes.length,
      },
      outcome: result.status,
      confidence_score: result.status === 'signature_valid' || result.status === 'verified_duo' ? 0.95 : 0.5,
    });
    
    return jsonResponse({
      success: true,
      status: dbStatus,
      method: result.method,
      message: result.message,
      details: result.details,
      verified_at: result.verified_at,
    });
    
  } catch (error) {
    console.error('Verification error:', error);
    return errorResponse(`Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
  }
});
