import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmrexRequest {
  action: 'generate_link' | 'callback' | 'check_status';
  application_id?: string;
  emrex_data?: any;
  session_id?: string;
}

// EMREX NCP (National Contact Point) Configuration
const EMREX_CONFIG = {
  // DUO Netherlands EMREX endpoint
  ncp_url: Deno.env.get("EMREX_NCP_URL") || "https://emrex.duo.nl/ncp",
  // Our callback URL (will be set dynamically)
  callback_base: Deno.env.get("SUPABASE_URL") + "/functions/v1/verify-diploma-emrex",
  // Client ID from DUO registration
  client_id: Deno.env.get("EMREX_CLIENT_ID") || "",
  // Client secret from DUO registration
  client_secret: Deno.env.get("EMREX_CLIENT_SECRET") || "",
};

// Healthcare diploma types we accept
const VALID_DIPLOMA_TYPES = [
  'HBO-V', 'MBO-V', 'VIG', 'Helpende', 'GGZ-agoog',
  'Verpleegkundige', 'Verzorgende', 'Begeleider',
  'Sociaal Werk', 'Maatschappelijk Werk', 'SPH'
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body: EmrexRequest = await req.json();
    const { action } = body;

    console.log(`[EMREX] Action: ${action}`);

    switch (action) {
      case 'generate_link':
        return await generateEmrexLink(supabase, body.application_id!);
      
      case 'callback':
        return await processEmrexCallback(supabase, body.emrex_data, body.session_id);
      
      case 'check_status':
        return await checkVerificationStatus(supabase, body.application_id!);
      
      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[EMREX] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function generateEmrexLink(supabase: any, applicationId: string) {
  console.log(`[EMREX] Generating link for application: ${applicationId}`);

  // Get application details
  const { data: application, error: appError } = await supabase
    .from("professional_applications")
    .select("id, email_from, extracted_data, org_id")
    .eq("id", applicationId)
    .single();

  if (appError || !application) {
    throw new Error(`Application not found: ${applicationId}`);
  }

  // Generate unique session ID for tracking
  const sessionId = crypto.randomUUID();

  // Store EMREX session for tracking
  const { error: sessionError } = await supabase
    .from("application_documents")
    .insert({
      application_id: applicationId,
      document_type: "emrex_session",
      filename: `emrex_session_${sessionId}`,
      file_path: `emrex/${applicationId}/${sessionId}`,
      metadata: {
        session_id: sessionId,
        status: "pending",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      }
    });

  if (sessionError) {
    console.error("[EMREX] Session creation error:", sessionError);
  }

  // Build EMREX request URL
  // Note: This is the standard EMREX NCP flow
  const callbackUrl = `${EMREX_CONFIG.callback_base}?session=${sessionId}`;
  
  // ELMO (European Learning Model) request parameters
  const emrexParams = new URLSearchParams({
    sessionId: sessionId,
    returnUrl: callbackUrl,
    // Request diploma/qualification data
    scope: "diploma qualification",
    // Client identification
    clientId: EMREX_CONFIG.client_id || "citozorg-recruitment",
  });

  // The actual EMREX link that candidate clicks
  // This redirects to DUO/Mijn Overheid where they login with DigiD
  const emrexLink = `${EMREX_CONFIG.ncp_url}/request?${emrexParams.toString()}`;

  // Update application with EMREX session info
  await supabase
    .from("professional_applications")
    .update({
      diploma_validation_status: "emrex_invited",
      extracted_data: {
        ...application.extracted_data,
        emrex_session_id: sessionId,
        emrex_invited_at: new Date().toISOString()
      }
    })
    .eq("id", applicationId);

  // Log event for AI learning
  await supabase.from("ai_learning_events").insert({
    org_id: application.org_id,
    event_type: "emrex_invitation_sent",
    context: {
      application_id: applicationId,
      session_id: sessionId
    },
    outcome: "pending"
  });

  console.log(`[EMREX] Link generated for ${applicationId}, session: ${sessionId}`);

  return new Response(
    JSON.stringify({
      success: true,
      emrex_link: emrexLink,
      session_id: sessionId,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function processEmrexCallback(supabase: any, emrexData: any, sessionId?: string) {
  console.log(`[EMREX] Processing callback for session: ${sessionId}`);

  if (!sessionId) {
    throw new Error("Missing session ID in callback");
  }

  // Find the application by EMREX session
  const { data: applications, error: findError } = await supabase
    .from("professional_applications")
    .select("*")
    .contains("extracted_data", { emrex_session_id: sessionId });

  if (findError || !applications?.length) {
    // Try finding via application_documents
    const { data: docs } = await supabase
      .from("application_documents")
      .select("application_id")
      .eq("document_type", "emrex_session")
      .ilike("filename", `%${sessionId}%`)
      .single();

    if (!docs) {
      throw new Error(`No application found for session: ${sessionId}`);
    }

    // Get the application
    const { data: app } = await supabase
      .from("professional_applications")
      .select("*")
      .eq("id", docs.application_id)
      .single();

    if (!app) {
      throw new Error(`Application not found for session: ${sessionId}`);
    }

    return await processEmrexData(supabase, app, emrexData, sessionId);
  }

  return await processEmrexData(supabase, applications[0], emrexData, sessionId);
}

async function processEmrexData(supabase: any, application: any, emrexData: any, sessionId: string) {
  console.log(`[EMREX] Processing data for application: ${application.id}`);

  // Parse ELMO (European Learning Model) data
  // EMREX returns data in ELMO XML format, typically converted to JSON
  const diplomas = parseElmoData(emrexData);

  if (!diplomas || diplomas.length === 0) {
    // No diplomas found - update status
    await supabase
      .from("professional_applications")
      .update({
        diploma_validation_status: "emrex_no_results",
        extracted_data: {
          ...application.extracted_data,
          emrex_completed_at: new Date().toISOString(),
          emrex_result: "no_diplomas_found"
        }
      })
      .eq("id", application.id);

    return new Response(
      JSON.stringify({
        success: false,
        message: "Geen diploma's gevonden via EMREX",
        session_id: sessionId
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Check if any diploma matches healthcare requirements
  const healthcareDiploma = findHealthcareDiploma(diplomas);

  let validationStatus = "emrex_verified";
  let validationResult = "verified";

  if (!healthcareDiploma) {
    validationStatus = "emrex_no_match";
    validationResult = "no_healthcare_diploma";
  }

  // Store diploma document record
  await supabase.from("application_documents").insert({
    application_id: application.id,
    document_type: "diploma",
    filename: `emrex_diploma_${sessionId}.json`,
    file_path: `emrex/${application.id}/${sessionId}/diploma.json`,
    is_verified: validationStatus === "emrex_verified",
    verified_at: new Date().toISOString(),
    metadata: {
      source: "emrex",
      session_id: sessionId,
      diplomas: diplomas,
      matched_diploma: healthcareDiploma,
      verification_date: new Date().toISOString()
    }
  });

  // Update application with verified diploma
  await supabase
    .from("professional_applications")
    .update({
      diploma_validation_status: validationStatus,
      extracted_data: {
        ...application.extracted_data,
        emrex_completed_at: new Date().toISOString(),
        emrex_result: validationResult,
        verified_diploma: healthcareDiploma,
        all_diplomas: diplomas
      }
    })
    .eq("id", application.id);

  // Log success event
  await supabase.from("ai_learning_events").insert({
    org_id: application.org_id,
    event_type: "emrex_verification_completed",
    context: {
      application_id: application.id,
      session_id: sessionId,
      diplomas_found: diplomas.length,
      healthcare_diploma_found: !!healthcareDiploma
    },
    outcome: healthcareDiploma ? "success" : "no_match"
  });

  console.log(`[EMREX] Verification completed for ${application.id}: ${validationStatus}`);

  return new Response(
    JSON.stringify({
      success: true,
      validation_status: validationStatus,
      diplomas_found: diplomas.length,
      healthcare_diploma: healthcareDiploma,
      session_id: sessionId
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

function parseElmoData(emrexData: any): any[] {
  // ELMO data structure parsing
  // EMREX returns ELMO XML which may be converted to JSON
  
  if (!emrexData) return [];

  // Handle different EMREX response formats
  const diplomas: any[] = [];

  try {
    // Standard ELMO structure
    if (emrexData.elmo?.learningOpportunitySpecification) {
      const specs = Array.isArray(emrexData.elmo.learningOpportunitySpecification)
        ? emrexData.elmo.learningOpportunitySpecification
        : [emrexData.elmo.learningOpportunitySpecification];

      for (const spec of specs) {
        diplomas.push({
          title: spec.title || spec.name,
          type: spec.type || "diploma",
          level: spec.iscedCode || spec.eqfLevel,
          institution: spec.providingInstitution?.name,
          date: spec.dateAwarded || spec.completionDate,
          credential_id: spec.identifier
        });
      }
    }

    // Alternative: direct diploma array
    if (emrexData.diplomas && Array.isArray(emrexData.diplomas)) {
      diplomas.push(...emrexData.diplomas);
    }

    // Alternative: qualification array
    if (emrexData.qualifications && Array.isArray(emrexData.qualifications)) {
      for (const qual of emrexData.qualifications) {
        diplomas.push({
          title: qual.title || qual.name,
          type: qual.qualificationType || "diploma",
          level: qual.level,
          institution: qual.awardingBody,
          date: qual.dateAwarded
        });
      }
    }
  } catch (e) {
    console.error("[EMREX] Error parsing ELMO data:", e);
  }

  return diplomas;
}

function findHealthcareDiploma(diplomas: any[]): any | null {
  // Find diploma that matches healthcare requirements
  
  for (const diploma of diplomas) {
    const title = (diploma.title || "").toLowerCase();
    const type = (diploma.type || "").toLowerCase();

    // Check against valid healthcare diploma types
    for (const validType of VALID_DIPLOMA_TYPES) {
      const searchTerm = validType.toLowerCase();
      
      if (title.includes(searchTerm) || type.includes(searchTerm)) {
        return {
          ...diploma,
          matched_type: validType
        };
      }
    }

    // Additional healthcare-specific keywords
    const healthcareKeywords = [
      'verpleeg', 'zorg', 'verzorg', 'ggz', 'jeugd', 
      'maatschappelijk', 'sociaal', 'begeleider', 'helpende',
      'mbo-v', 'hbo-v', 'vig', 'spw', 'sph'
    ];

    for (const keyword of healthcareKeywords) {
      if (title.includes(keyword)) {
        return {
          ...diploma,
          matched_keyword: keyword
        };
      }
    }
  }

  return null;
}

async function checkVerificationStatus(supabase: any, applicationId: string) {
  const { data: application, error } = await supabase
    .from("professional_applications")
    .select("id, diploma_validation_status, extracted_data")
    .eq("id", applicationId)
    .single();

  if (error || !application) {
    throw new Error(`Application not found: ${applicationId}`);
  }

  return new Response(
    JSON.stringify({
      application_id: applicationId,
      status: application.diploma_validation_status,
      emrex_session_id: application.extracted_data?.emrex_session_id,
      emrex_invited_at: application.extracted_data?.emrex_invited_at,
      emrex_completed_at: application.extracted_data?.emrex_completed_at,
      verified_diploma: application.extracted_data?.verified_diploma
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
