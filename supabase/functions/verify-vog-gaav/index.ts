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
  // Try to extract date from filename patterns like "VOG_2024-01-15.pdf" or "vog-15012024.pdf"
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
        // YYYY first
        year = parseInt(match[1]);
        month = parseInt(match[2]) - 1;
        day = parseInt(match[3]);
      } else {
        // DD first
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

    // 1. Get current application state
    const { data: application, error: appError } = await supabase
      .from('professional_applications')
      .select('id, vog_validation_status, vog_validation_source')
      .eq('id', application_id)
      .single();

    if (appError || !application) {
      return errorResponse(`Application not found: ${appError?.message}`);
    }

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
      
      // Update status to manual review
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

    // 4. Submit to GAAV API
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

    // 5. Map response to status
    const responseMapping = GAAV_RESPONSE_MAP[gaavResponseCode] ?? {
      status: 'manual_review',
      description: gaavError ?? 'Unknown response code',
      requiresManualReview: true
    };

    let validationStatus = responseMapping.status;
    let vogIssueDate: Date | null = null;
    let vogValidUntil: Date | null = null;
    let expiryCheck: { valid: boolean; daysRemaining: number } | null = null;

    // 6. If authentic, check 3-month validity rule
    if (validationStatus === 'authentic_ok') {
      // Try to extract issue date from filename
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
    }

    // 7. Update application with verification result
    const { error: updateError } = await supabase
      .from('professional_applications')
      .update({
        vog_validation_status: validationStatus,
        vog_validation_source: 'GAAV_API',
        vog_issue_date: vogIssueDate?.toISOString().split('T')[0] ?? null,
        vog_valid_until: vogValidUntil?.toISOString().split('T')[0] ?? null,
        vog_verification_response: {
          gaav_code: gaavResponseCode,
          gaav_description: responseMapping.description,
          gaav_error: gaavError,
          requires_manual_review: responseMapping.requiresManualReview,
          issue_date: vogIssueDate?.toISOString() ?? null,
          valid_until: vogValidUntil?.toISOString() ?? null,
          days_remaining: expiryCheck?.daysRemaining ?? null,
          verified_at: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', application_id);

    if (updateError) {
      console.error(`[VERIFY-VOG-GAAV] Update failed:`, updateError);
      return errorResponse(`Failed to update application: ${updateError.message}`);
    }

    // 8. Log system event
    await supabase.from('system_events').insert({
      org_id: '550e8400-e29b-41d4-a716-446655440000', // ABCzorg default
      event_type: 'vog_verification_completed',
      entity_type: 'professional_application',
      entity_id: application_id,
      event_data: {
        validation_status: validationStatus,
        gaav_code: gaavResponseCode,
        days_remaining: expiryCheck?.daysRemaining ?? null
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
      } : null
    });

  } catch (error) {
    console.error('[VERIFY-VOG-GAAV] Unexpected error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unexpected error', 500);
  }
});
