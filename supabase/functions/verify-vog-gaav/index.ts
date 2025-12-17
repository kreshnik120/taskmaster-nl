import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GAAV_API_URL = 'https://validatie.nl/api/valideer/';

// GAAV Response codes mapping
const GAAV_RESPONSE_MAP: Record<number, { status: string; description: string; requiresManualReview: boolean }> = {
  0: { status: 'authentic_ok', description: 'Document is authentiek en integer', requiresManualReview: false },
  1: { status: 'authentic_fail', description: 'Document is bekend, maar niet integer', requiresManualReview: false },
  2: { status: 'manual_review', description: 'Document niet bekend bij GAAV', requiresManualReview: true },
  3: { status: 'manual_review', description: 'Validatie tijdelijk niet mogelijk', requiresManualReview: true },
  4: { status: 'manual_review', description: 'Provenance error', requiresManualReview: true },
  5: { status: 'manual_review', description: 'Signature error', requiresManualReview: true },
  6: { status: 'authentic_fail', description: 'Handtekening ongeldig', requiresManualReview: false },
  7: { status: 'manual_review', description: 'Custom validation error', requiresManualReview: true },
};

// VOG validity period in months
const VOG_VALIDITY_MONTHS = 3;

// Screening profile descriptions
const SCREENING_PROFILES: Record<string, string> = {
  '45': 'Gezondheidszorg en welzijn van personen',
  '84': 'Zorg voor minderjarigen',
  '85': 'Zorg voor hulpbehoevende personen',
};

function createAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  );
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Check if VOG issue date is within validity period
function isVogWithinValidity(issueDate: Date): { valid: boolean; daysRemaining: number; expiryDate: Date } {
  const expiryDate = new Date(issueDate);
  expiryDate.setMonth(expiryDate.getMonth() + VOG_VALIDITY_MONTHS);
  
  const now = new Date();
  const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  return {
    valid: daysRemaining > 0,
    daysRemaining,
    expiryDate
  };
}

// Extract issue date from VOG PDF filename or metadata
function extractVogIssueDate(filename: string): Date | null {
  const patterns = [
    /(\d{4})-(\d{2})-(\d{2})/,           // YYYY-MM-DD
    /(\d{2})-(\d{2})-(\d{4})/,           // DD-MM-YYYY
    /(\d{2})(\d{2})(\d{4})/,             // DDMMYYYY
    /(\d{4})(\d{2})(\d{2})/,             // YYYYMMDD
  ];
  
  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      let year: number, month: number, day: number;
      
      if (pattern.source.startsWith('(\\d{4})')) {
        year = parseInt(match[1]);
        month = parseInt(match[2]) - 1;
        day = parseInt(match[3]);
      } else {
        day = parseInt(match[1]);
        month = parseInt(match[2]) - 1;
        year = parseInt(match[3]);
      }
      
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime()) && year > 2000 && year < 2100) {
        return date;
      }
    }
  }
  
  return null;
}

// Extract screening profile from VOG PDF text content
interface VogScreeningInfo {
  profileCode: string | null;
  functieaspecten: string[];
  functieOmschrijving: string | null;
  rawText: string | null;
}

async function extractScreeningProfile(pdfBytes: ArrayBuffer): Promise<VogScreeningInfo> {
  const result: VogScreeningInfo = {
    profileCode: null,
    functieaspecten: [],
    functieOmschrijving: null,
    rawText: null
  };

  try {
    // Convert ArrayBuffer to string for text extraction
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const textContent = decoder.decode(pdfBytes);
    result.rawText = textContent.slice(0, 5000); // Store first 5000 chars for debugging

    // Extract screening profile code (format: "Screeningsprofiel: 45" or "Profiel 45")
    const profilePatterns = [
      /Screeningsprofiel[:\s]+(\d{2})/i,
      /Profiel[:\s]+(\d{2})/i,
      /screening\s*profiel[:\s]+(\d{2})/i,
    ];

    for (const pattern of profilePatterns) {
      const match = textContent.match(pattern);
      if (match) {
        result.profileCode = match[1];
        console.log(`[VERIFY-VOG-GAAV] Extracted profile code: ${result.profileCode}`);
        break;
      }
    }

    // Extract functieaspecten (format: "Functieaspect: 84, 85" or "aspecten 84 en 85")
    const aspectPatterns = [
      /Functieaspect[en]*[:\s]+([0-9,\s]+)/i,
      /aspect[en]*[:\s]+([0-9,\s]+)/i,
      /functie-aspect[en]*[:\s]+([0-9,\s]+)/i,
    ];

    for (const pattern of aspectPatterns) {
      const match = textContent.match(pattern);
      if (match) {
        const aspectStr = match[1];
        const aspects = aspectStr.match(/\d{2}/g) || [];
        result.functieaspecten = aspects;
        console.log(`[VERIFY-VOG-GAAV] Extracted functieaspecten: ${aspects.join(', ')}`);
        break;
      }
    }

    // Extract functie omschrijving (format: "Functie: Begeleider gehandicaptenzorg")
    const functiePatterns = [
      /Functie[:\s]+([^\n\r]+)/i,
      /Beroep[:\s]+([^\n\r]+)/i,
      /Werkzaamheden[:\s]+([^\n\r]+)/i,
    ];

    for (const pattern of functiePatterns) {
      const match = textContent.match(pattern);
      if (match) {
        result.functieOmschrijving = match[1].trim().slice(0, 200);
        console.log(`[VERIFY-VOG-GAAV] Extracted functie omschrijving: ${result.functieOmschrijving}`);
        break;
      }
    }

    // If no profile found in text, try to detect from known keywords
    if (!result.profileCode) {
      // Look for healthcare/zorg keywords indicating profile 45
      const zorgtermen = ['gezondheidszorg', 'verpleging', 'verzorging', 'zorg', 'welzijn', 'hulpverlening'];
      const hasZorgTerms = zorgtermen.some(term => textContent.toLowerCase().includes(term));
      
      if (hasZorgTerms) {
        result.profileCode = '45'; // Assume profile 45 for healthcare
        console.log(`[VERIFY-VOG-GAAV] Inferred profile 45 from healthcare keywords`);
      }

      // Check for minderjarigen (aspect 84)
      const jeugdtermen = ['minderjarig', 'jeugd', 'kind', 'jongere'];
      const hasJeugdTerms = jeugdtermen.some(term => textContent.toLowerCase().includes(term));
      if (hasJeugdTerms && !result.functieaspecten.includes('84')) {
        result.functieaspecten.push('84');
        console.log(`[VERIFY-VOG-GAAV] Inferred functieaspect 84 from youth keywords`);
      }

      // Check for hulpbehoevende (aspect 85)
      const hulptermen = ['hulpbehoevend', 'kwetsbaar', 'zorgbehoevend', 'afhankelijk'];
      const hasHulpTerms = hulptermen.some(term => textContent.toLowerCase().includes(term));
      if (hasHulpTerms && !result.functieaspecten.includes('85')) {
        result.functieaspecten.push('85');
        console.log(`[VERIFY-VOG-GAAV] Inferred functieaspect 85 from vulnerability keywords`);
      }
    }
  } catch (error) {
    console.error('[VERIFY-VOG-GAAV] Error extracting screening profile:', error);
  }

  return result;
}

// Validate screening profile against requirements
interface ProfileValidationResult {
  valid: boolean;
  reason: string;
  requiredProfile: string | null;
  requiredAspecten: string[];
  missingAspecten: string[];
}

async function validateScreeningProfile(
  supabase: ReturnType<typeof createAdminClient>,
  extractedProfile: VogScreeningInfo,
  functieNiveau: string | null,
  doelgroepen: string[] | null
): Promise<ProfileValidationResult> {
  const result: ProfileValidationResult = {
    valid: true,
    reason: '',
    requiredProfile: null,
    requiredAspecten: [],
    missingAspecten: []
  };

  if (!functieNiveau) {
    result.valid = true;
    result.reason = 'Geen functie_niveau bekend - kan profiel niet valideren';
    return result;
  }

  // Lookup requirements for this functie_niveau
  let query = supabase
    .from('vog_screening_requirements')
    .select('*')
    .eq('functie_niveau', functieNiveau);

  // If doelgroepen includes youth, filter for that specific requirement
  const hasYouth = doelgroepen?.some(d => 
    d.toLowerCase().includes('jeugd') || 
    d.toLowerCase().includes('kind') ||
    d.toLowerCase().includes('minderjarig')
  );

  if (hasYouth) {
    query = query.contains('doelgroep', ['Kinderen/Jeugd']);
  } else {
    query = query.eq('doelgroep', '{}');
  }

  const { data: requirements, error } = await query.limit(1);

  if (error || !requirements || requirements.length === 0) {
    console.log(`[VERIFY-VOG-GAAV] No specific requirements found for ${functieNiveau}`);
    // Fall back to default healthcare requirement
    result.requiredProfile = '45';
    result.requiredAspecten = ['85'];
  } else {
    const req = requirements[0];
    result.requiredProfile = req.required_profile_code;
    result.requiredAspecten = req.required_functieaspecten || [];
    console.log(`[VERIFY-VOG-GAAV] Found requirement: profile ${req.required_profile_code}, aspecten ${req.required_functieaspecten?.join(', ')}`);
  }

  // Validate profile code
  if (extractedProfile.profileCode && result.requiredProfile) {
    if (extractedProfile.profileCode !== result.requiredProfile) {
      result.valid = false;
      result.reason = `Verkeerd screeningsprofiel: ${extractedProfile.profileCode} (vereist: ${result.requiredProfile} - ${SCREENING_PROFILES[result.requiredProfile] || 'Onbekend'})`;
      return result;
    }
  }

  // Validate functieaspecten
  if (result.requiredAspecten.length > 0) {
    const extractedAspecten = new Set(extractedProfile.functieaspecten);
    
    for (const required of result.requiredAspecten) {
      if (!extractedAspecten.has(required)) {
        result.missingAspecten.push(required);
      }
    }

    if (result.missingAspecten.length > 0) {
      const missingDescriptions = result.missingAspecten
        .map(a => `${a} (${SCREENING_PROFILES[a] || 'Onbekend'})`)
        .join(', ');
      
      result.valid = false;
      result.reason = `Ontbrekende functieaspecten: ${missingDescriptions}`;
      return result;
    }
  }

  // If we couldn't extract any profile info, flag for manual review
  if (!extractedProfile.profileCode && !extractedProfile.functieaspecten.length) {
    result.valid = false;
    result.reason = 'Kon screeningsprofiel niet extraheren uit document - handmatige controle vereist';
  } else {
    result.reason = 'Screeningsprofiel voldoet aan vereisten';
  }

  return result;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { application_id, vog_file_path, force_revalidation = false } = await req.json();

    if (!application_id || !vog_file_path) {
      return errorResponse('Missing required fields: application_id and vog_file_path');
    }

    console.log(`[VERIFY-VOG-GAAV] Starting verification for application: ${application_id}`);
    
    const supabase = createAdminClient();

    // 1. Get current application state including functie_niveau and doelgroep
    const { data: application, error: appError } = await supabase
      .from('professional_applications')
      .select('id, vog_validation_status, vog_validation_source, extracted_data')
      .eq('id', application_id)
      .single();

    if (appError || !application) {
      return errorResponse(`Application not found: ${appError?.message}`);
    }

    const extractedData = (application.extracted_data as Record<string, unknown>) || {};
    const functieNiveau = extractedData.functie_niveau as string | null;
    const doelgroepen = extractedData.doelgroep_ervaring as string[] | null;

    // Skip if already verified (unless forced)
    if (!force_revalidation && application.vog_validation_status === 'authentic_ok') {
      console.log(`[VERIFY-VOG-GAAV] Already verified, skipping`);
      return jsonResponse({
        success: true,
        skipped: true,
        reason: 'Already verified',
        validation_status: application.vog_validation_status
      });
    }

    // 2. Set status to validating
    await supabase
      .from('professional_applications')
      .update({
        vog_validation_status: 'validating',
        vog_validation_source: 'pending',
        updated_at: new Date().toISOString()
      })
      .eq('id', application_id);

    // 3. Download VOG PDF from storage
    console.log(`[VERIFY-VOG-GAAV] Downloading VOG from: ${vog_file_path}`);
    
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('application-documents')
      .download(vog_file_path);

    if (downloadError || !fileData) {
      console.error(`[VERIFY-VOG-GAAV] Download failed:`, downloadError);
      
      await supabase
        .from('professional_applications')
        .update({
          vog_validation_status: 'manual_review',
          vog_validation_source: 'GAAV_API',
          vog_verification_response: {
            error: 'Download failed',
            message: downloadError?.message,
            timestamp: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', application_id);
      
      return errorResponse(`Failed to download VOG file: ${downloadError?.message}`);
    }

    // 4. Extract screening profile from PDF
    const pdfBytes = await fileData.arrayBuffer();
    const screeningProfile = await extractScreeningProfile(pdfBytes);
    console.log(`[VERIFY-VOG-GAAV] Extracted screening profile:`, JSON.stringify(screeningProfile, null, 2));

    // 5. Submit to GAAV API
    console.log(`[VERIFY-VOG-GAAV] Submitting to GAAV API...`);
    
    const formData = new FormData();
    formData.append('file', fileData, 'vog.pdf');

    let gaavResponseCode = -1;
    let gaavError: string | null = null;

    try {
      const gaavResponse = await fetch(GAAV_API_URL, {
        method: 'POST',
        body: formData
      });

      if (!gaavResponse.ok) {
        throw new Error(`GAAV API returned status ${gaavResponse.status}`);
      }

      const responseData = await gaavResponse.json();
      gaavResponseCode = typeof responseData === 'number' ? responseData : responseData.code ?? responseData.result ?? -1;
      
      console.log(`[VERIFY-VOG-GAAV] GAAV response code: ${gaavResponseCode}`);
    } catch (fetchError) {
      console.error(`[VERIFY-VOG-GAAV] GAAV API error:`, fetchError);
      gaavError = fetchError instanceof Error ? fetchError.message : 'Unknown GAAV API error';
    }

    // 6. Map response to status
    const responseMapping = GAAV_RESPONSE_MAP[gaavResponseCode] ?? {
      status: 'manual_review',
      description: gaavError ?? 'Unknown response code',
      requiresManualReview: true
    };

    let validationStatus = responseMapping.status;
    let vogIssueDate: Date | null = null;
    let vogValidUntil: Date | null = null;
    let expiryCheck: { valid: boolean; daysRemaining: number } | null = null;
    let profileValidation: ProfileValidationResult | null = null;

    // 7. If authentic, check 3-month validity rule and screening profile
    if (validationStatus === 'authentic_ok') {
      // Check issue date
      vogIssueDate = extractVogIssueDate(vog_file_path);
      
      if (vogIssueDate) {
        const validityResult = isVogWithinValidity(vogIssueDate);
        expiryCheck = { valid: validityResult.valid, daysRemaining: validityResult.daysRemaining };
        vogValidUntil = validityResult.expiryDate;
        
        if (!validityResult.valid) {
          console.log(`[VERIFY-VOG-GAAV] VOG is expired (${validityResult.daysRemaining} days past expiry)`);
          validationStatus = 'expired';
        } else if (validityResult.daysRemaining <= 14) {
          console.log(`[VERIFY-VOG-GAAV] VOG expiring soon (${validityResult.daysRemaining} days remaining)`);
        }
      }

      // Validate screening profile
      profileValidation = await validateScreeningProfile(
        supabase,
        screeningProfile,
        functieNiveau,
        doelgroepen
      );

      if (!profileValidation.valid) {
        console.log(`[VERIFY-VOG-GAAV] Profile validation failed: ${profileValidation.reason}`);
        validationStatus = 'wrong_profile';
      }
    }

    // 8. Update application with verification result
    const verificationResponse = {
      gaav_code: gaavResponseCode,
      gaav_description: responseMapping.description,
      gaav_error: gaavError,
      requires_manual_review: responseMapping.requiresManualReview,
      issue_date: vogIssueDate?.toISOString() ?? null,
      valid_until: vogValidUntil?.toISOString() ?? null,
      days_remaining: expiryCheck?.daysRemaining ?? null,
      verified_at: new Date().toISOString(),
      // Screening profile info
      screening_profile: {
        extracted_code: screeningProfile.profileCode,
        extracted_aspecten: screeningProfile.functieaspecten,
        extracted_functie: screeningProfile.functieOmschrijving,
        required_code: profileValidation?.requiredProfile ?? null,
        required_aspecten: profileValidation?.requiredAspecten ?? [],
        missing_aspecten: profileValidation?.missingAspecten ?? [],
        profile_valid: profileValidation?.valid ?? null,
        profile_reason: profileValidation?.reason ?? null
      }
    };

    const { error: updateError } = await supabase
      .from('professional_applications')
      .update({
        vog_validation_status: validationStatus,
        vog_validation_source: 'GAAV_API',
        vog_issue_date: vogIssueDate?.toISOString().split('T')[0] ?? null,
        vog_valid_until: vogValidUntil?.toISOString().split('T')[0] ?? null,
        vog_verification_response: verificationResponse,
        updated_at: new Date().toISOString()
      })
      .eq('id', application_id);

    if (updateError) {
      console.error(`[VERIFY-VOG-GAAV] Update failed:`, updateError);
      return errorResponse(`Failed to update application: ${updateError.message}`);
    }

    // 9. Log system event
    await supabase.from('system_events').insert({
      org_id: '550e8400-e29b-41d4-a716-446655440000', // ABCzorg default
      event_type: 'vog_verification_completed',
      entity_type: 'professional_application',
      entity_id: application_id,
      event_data: {
        validation_status: validationStatus,
        gaav_code: gaavResponseCode,
        days_remaining: expiryCheck?.daysRemaining ?? null,
        profile_valid: profileValidation?.valid ?? null,
        profile_code: screeningProfile.profileCode
      },
      metadata: { source: 'GAAV_API' }
    });

    console.log(`[VERIFY-VOG-GAAV] Verification complete: ${validationStatus}`);

    return jsonResponse({
      success: true,
      validation_status: validationStatus,
      gaav_response: {
        code: gaavResponseCode,
        description: responseMapping.description,
        requires_manual_review: responseMapping.requiresManualReview
      },
      expiry_info: expiryCheck ? {
        issue_date: vogIssueDate?.toISOString(),
        valid_until: vogValidUntil?.toISOString(),
        days_remaining: expiryCheck.daysRemaining,
        is_valid: expiryCheck.valid
      } : null,
      screening_profile: {
        extracted: {
          code: screeningProfile.profileCode,
          aspecten: screeningProfile.functieaspecten,
          functie: screeningProfile.functieOmschrijving
        },
        validation: profileValidation ? {
          valid: profileValidation.valid,
          reason: profileValidation.reason,
          required_code: profileValidation.requiredProfile,
          required_aspecten: profileValidation.requiredAspecten,
          missing_aspecten: profileValidation.missingAspecten
        } : null
      }
    });

  } catch (error) {
    console.error('[VERIFY-VOG-GAAV] Unexpected error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unexpected error', 500);
  }
});
