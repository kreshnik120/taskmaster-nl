import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Healthcare diploma niveau mapping
const NIVEAU_MAPPING: Record<string, { niveau: number; aliases: string[] }> = {
  'Helpende': { niveau: 2, aliases: ['Helpende Zorg', 'Helpende Zorg en Welzijn', 'NV2', 'Niveau 2', 'MBO 2', 'MBO-2'] },
  'VIG': { niveau: 3, aliases: ['Verzorgende IG', 'Verzorgende', 'NV3', 'Niveau 3', 'MBO 3', 'MBO-3', 'Verzorgende-IG'] },
  'Verpleegkundige MBO': { niveau: 4, aliases: ['MBO-V', 'MBO Verpleegkundige', 'NV4', 'Niveau 4', 'MBO 4', 'VP4', 'Verpleegkundige niveau 4'] },
  'HBO-V': { niveau: 6, aliases: ['HBO Verpleegkundige', 'Bachelor Verpleegkunde', 'NV6', 'Niveau 6', 'HBO', 'BN', 'Bachelor Nursing'] },
  'Begeleider': { niveau: 3, aliases: ['Persoonlijk Begeleider', 'Maatschappelijke Zorg', 'Begeleider GZ', 'MZ', 'PB'] },
  'GGZ-agoog': { niveau: 5, aliases: ['SPH', 'Sociaal Pedagogisch Hulpverlener', 'MWD', 'Maatschappelijk Werk', 'Social Work'] },
};

// Extract niveau from a function/diploma string
function extractNiveau(input: string | null | undefined): { niveau: number | null; functie: string | null } {
  if (!input) return { niveau: null, functie: null };
  
  const normalized = input.trim().toLowerCase();
  
  // Direct match with mapping keys
  for (const [functie, data] of Object.entries(NIVEAU_MAPPING)) {
    if (functie.toLowerCase() === normalized) {
      return { niveau: data.niveau, functie };
    }
    
    // Check aliases
    for (const alias of data.aliases) {
      if (alias.toLowerCase() === normalized || normalized.includes(alias.toLowerCase())) {
        return { niveau: data.niveau, functie };
      }
    }
  }
  
  // Try to extract niveau number directly
  const niveauMatch = normalized.match(/(?:niveau|nv|mbo)\s*(\d)/i);
  if (niveauMatch) {
    return { niveau: parseInt(niveauMatch[1]), functie: input };
  }
  
  return { niveau: null, functie: input };
}

// Compare CV niveau with diploma niveau
function compareNiveaus(
  cvFunctie: string | null, 
  diplomaInfo: any
): { 
  match: boolean; 
  mismatchType: 'cv_higher' | 'cv_lower' | 'unknown' | null;
  cvNiveau: number | null;
  diplomaNiveau: number | null;
  message: string;
} {
  const cvExtracted = extractNiveau(cvFunctie);
  
  // Try to extract diploma niveau from various fields
  let diplomaNiveau: number | null = null;
  let diplomaFunctie: string | null = null;
  
  if (diplomaInfo?.extracted_niveau) {
    diplomaNiveau = diplomaInfo.extracted_niveau;
    diplomaFunctie = diplomaInfo.extracted_functie || diplomaInfo.diploma_naam;
  } else if (diplomaInfo?.diploma_naam) {
    const extracted = extractNiveau(diplomaInfo.diploma_naam);
    diplomaNiveau = extracted.niveau;
    diplomaFunctie = extracted.functie;
  } else if (diplomaInfo?.opleiding) {
    const extracted = extractNiveau(diplomaInfo.opleiding);
    diplomaNiveau = extracted.niveau;
    diplomaFunctie = extracted.functie;
  }
  
  // If we can't determine either niveau, it's unknown
  if (cvExtracted.niveau === null || diplomaNiveau === null) {
    return {
      match: false,
      mismatchType: 'unknown',
      cvNiveau: cvExtracted.niveau,
      diplomaNiveau,
      message: 'Kon niveau niet automatisch bepalen - handmatige controle vereist'
    };
  }
  
  // Compare niveaus
  if (cvExtracted.niveau === diplomaNiveau) {
    return {
      match: true,
      mismatchType: null,
      cvNiveau: cvExtracted.niveau,
      diplomaNiveau,
      message: `CV en diploma komen overeen (beide niveau ${cvExtracted.niveau})`
    };
  }
  
  if (cvExtracted.niveau > diplomaNiveau) {
    return {
      match: false,
      mismatchType: 'cv_higher',
      cvNiveau: cvExtracted.niveau,
      diplomaNiveau,
      message: `CV vermeldt niveau ${cvExtracted.niveau} (${cvFunctie}) maar diploma bewijst niveau ${diplomaNiveau}`
    };
  }
  
  // CV niveau is lower than diploma (not a problem, just informational)
  return {
    match: true,
    mismatchType: 'cv_lower',
    cvNiveau: cvExtracted.niveau,
    diplomaNiveau,
    message: `Diploma (niveau ${diplomaNiveau}) is hoger dan CV vermeldt (niveau ${cvExtracted.niveau}) - geen probleem`
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { application_id, diploma_info } = await req.json();

    if (!application_id) {
      return new Response(
        JSON.stringify({ error: 'application_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[validate-diploma-level] Starting validation for:', application_id);

    // Fetch application data
    const { data: application, error: appError } = await supabase
      .from('professional_applications')
      .select('id, org_id, extracted_data, diploma_validation_status, diploma_verification_response')
      .eq('id', application_id)
      .single();

    if (appError || !application) {
      console.error('[validate-diploma-level] Application not found:', appError);
      return new Response(
        JSON.stringify({ error: 'Application not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get CV functie_niveau from extracted_data
    const extractedData = application.extracted_data as any;
    const cvFunctieNiveau = extractedData?.functie_niveau?.value || extractedData?.functie_niveau;
    
    // Get diploma info from verification response or provided diploma_info
    const diplomaVerification = application.diploma_verification_response || diploma_info || {};
    
    console.log('[validate-diploma-level] CV functie:', cvFunctieNiveau);
    console.log('[validate-diploma-level] Diploma info:', diplomaVerification);

    // Perform comparison
    const comparison = compareNiveaus(cvFunctieNiveau, diplomaVerification);
    
    console.log('[validate-diploma-level] Comparison result:', comparison);

    // If there's a mismatch where CV claims higher niveau, create an alert
    if (!comparison.match && comparison.mismatchType === 'cv_higher') {
      console.log('[validate-diploma-level] CV niveau higher than diploma - creating alert');
      
      // Update extracted_data with mismatch info
      const updatedExtractedData = {
        ...extractedData,
        diploma_level_mismatch: {
          detected_at: new Date().toISOString(),
          cv_functie: cvFunctieNiveau,
          cv_niveau: comparison.cvNiveau,
          diploma_niveau: comparison.diplomaNiveau,
          mismatch_type: comparison.mismatchType,
          message: comparison.message,
          status: 'pending_review'
        }
      };

      await supabase
        .from('professional_applications')
        .update({ extracted_data: updatedExtractedData })
        .eq('id', application_id);

      // Log to ai_learning_events for future AI improvements
      await supabase.from('ai_learning_events').insert({
        org_id: application.org_id,
        event_type: 'diploma_level_mismatch',
        context: {
          application_id,
          cv_functie_niveau: cvFunctieNiveau,
          cv_niveau: comparison.cvNiveau,
          diploma_niveau: comparison.diplomaNiveau,
          mismatch_type: comparison.mismatchType,
          diploma_verification: diplomaVerification
        },
        outcome: null, // Will be filled after recruiter action
        confidence_score: 0.9
      });

      // Create business intelligence alert
      await supabase.from('business_intelligence').insert({
        org_id: application.org_id,
        intelligence_type: 'diploma_mismatch',
        title: `Diploma niveau discrepantie: ${cvFunctieNiveau}`,
        description: comparison.message,
        data: {
          application_id,
          cv_functie: cvFunctieNiveau,
          cv_niveau: comparison.cvNiveau,
          diploma_niveau: comparison.diplomaNiveau,
          mismatch_type: comparison.mismatchType
        },
        severity: 'medium',
        priority: 'high',
        status: 'active'
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        match: comparison.match,
        mismatch_type: comparison.mismatchType,
        cv_niveau: comparison.cvNiveau,
        diploma_niveau: comparison.diplomaNiveau,
        message: comparison.message,
        requires_review: comparison.mismatchType === 'cv_higher' || comparison.mismatchType === 'unknown'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[validate-diploma-level] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
