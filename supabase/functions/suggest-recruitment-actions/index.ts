import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ActionSuggestion {
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recruitment_action_type: 'call' | 'interview' | 'contract' | 'reference_check' | 'custom';
  reasoning: string;
  confidence: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { application_id, old_stage, new_stage } = await req.json();

    if (!application_id || !new_stage) {
      throw new Error('Missing required fields: application_id, new_stage');
    }

    console.log(`Generating action suggestion for application ${application_id}: ${old_stage} → ${new_stage}`);

    // Fetch application details
    const { data: application, error: appError } = await supabase
      .from('professional_applications')
      .select(`
        *,
        professionals:professional_id(full_name, functie_niveau, skills, regio)
      `)
      .eq('id', application_id)
      .single();

    if (appError) throw appError;

    // Generate AI-driven suggestion based on stage
    const suggestion = generateSuggestion(application, old_stage, new_stage);

    console.log('Generated suggestion:', suggestion);

    return new Response(
      JSON.stringify({ 
        success: true,
        suggestion 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in suggest-recruitment-actions:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: (error as Error).message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});

function generateSuggestion(
  application: any,
  oldStage: string,
  newStage: string
): ActionSuggestion {
  const candidateName = application.professionals?.full_name || application.email_from;
  const completeness = application.completeness_score || 0;
  const missingInfo = Array.isArray(application.missing_info) ? application.missing_info : [];

  // Stage-specific suggestions
  switch (newStage) {
    case 'screening':
      // Just moved to screening → need to call candidate
      if (completeness < 70) {
        return {
          title: `Bel ${candidateName} voor aanvullende informatie`,
          description: `Sollicitatie is ${completeness}% compleet. Ontbrekende informatie: ${missingInfo.join(', ')}. Bel kandidaat om ontbrekende gegevens te verzamelen.`,
          priority: 'HIGH',
          recruitment_action_type: 'call',
          reasoning: `Compleetheid is laag (${completeness}%). Direct contact nodig voor verificatie.`,
          confidence: 0.9
        };
      } else {
        return {
          title: `Bel ${candidateName} voor screeningsgesprek`,
          description: `Sollicitatie is compleet. Voer telefonisch screeningsgesprek uit om geschiktheid te beoordelen en beschikbaarheid te verifiëren.`,
          priority: 'MEDIUM',
          recruitment_action_type: 'call',
          reasoning: 'Sollicitatie is compleet, tijd voor telefonische screening.',
          confidence: 0.85
        };
      }

    case 'interview':
      // Moved to interview → schedule formal interview
      return {
        title: `Plan interview met ${candidateName}`,
        description: `Kandidaat heeft screening succesvol doorlopen. Plan een formeel interview op kantoor of online om vaardigheden en ervaring diepgaand te bespreken.`,
        priority: 'HIGH',
        recruitment_action_type: 'interview',
        reasoning: 'Kandidaat is door screening heen, tijd voor diepgaand interview.',
        confidence: 0.95
      };

    case 'goedgekeurd':
      // Moved to approved → prepare contract or check references
      if (missingInfo.includes('referenties') || missingInfo.includes('referentie')) {
        return {
          title: `Check referenties ${candidateName}`,
          description: `Kandidaat is goedgekeurd maar referenties ontbreken. Neem contact op met eerdere werkgevers voor referentiecheck voordat contract wordt opgesteld.`,
          priority: 'HIGH',
          recruitment_action_type: 'reference_check',
          reasoning: 'Referenties zijn vereist voordat contract kan worden aangeboden.',
          confidence: 0.9
        };
      } else {
        return {
          title: `Contract opmaken voor ${candidateName}`,
          description: `Kandidaat is volledig goedgekeurd en referenties zijn geverifieerd. Maak arbeidscontract op met correcte functie, salaris en startdatum.`,
          priority: 'CRITICAL',
          recruitment_action_type: 'contract',
          reasoning: 'Alle checks zijn voltooid, tijd om contract aan te bieden.',
          confidence: 0.95
        };
      }

    case 'geplaatst':
      // Placed → onboarding or final administrative tasks
      return {
        title: `Onboarding voorbereiden voor ${candidateName}`,
        description: `Kandidaat is geplaatst. Bereid onboarding voor: werkplek regelen, accounts aanmaken, introductieschema opstellen, en welkomstmail versturen.`,
        priority: 'MEDIUM',
        recruitment_action_type: 'custom',
        reasoning: 'Kandidaat start binnenkort, onboarding moet geregeld worden.',
        confidence: 0.8
      };

    case 'nieuw':
      // Moved back to new? Probably needs review
      return {
        title: `Herbeoordeel sollicitatie ${candidateName}`,
        description: `Sollicitatie is teruggezet naar 'Nieuw'. Controleer waarom en bepaal volgende stappen.`,
        priority: 'LOW',
        recruitment_action_type: 'custom',
        reasoning: 'Onverwachte statusverandering, handmatige review vereist.',
        confidence: 0.5
      };

    default:
      // Generic fallback
      return {
        title: `Vervolgactie voor ${candidateName}`,
        description: `Bepaal de volgende stap voor deze kandidaat in fase: ${newStage}`,
        priority: 'MEDIUM',
        recruitment_action_type: 'custom',
        reasoning: 'Geen specifieke actie gedefinieerd voor deze fase.',
        confidence: 0.6
      };
  }
}
