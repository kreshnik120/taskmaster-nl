import { corsHeaders, jsonResponse, logInfo, logWarning } from '../_shared/core.ts';

/**
 * auto-send-interview-slots - DEPRECATED
 * 
 * ⚠️ DEZE FUNCTIE IS UITGESCHAKELD
 * 
 * Fysieke gesprekken worden nu HANDMATIG gepland door recruiters via de UI.
 * De recruiter vult gesprek_datum in wanneer kandidaat documenten heeft ingediend.
 * 
 * De nieuwe recruitment flow is (6-stage pipeline):
 * 1. nieuw → intake_verstuurd (welkomstmail)
 * 2. intake_verstuurd → gesprek_gepland (HANDMATIG door recruiter: gesprek_datum invullen)
 * 3. gesprek_gepland → screening (NA positieve gesprek_feedback door recruiter)
 * 4. screening → goedgekeurd (VOG geverifieerd)
 * 5. goedgekeurd → geplaatst
 * 
 * NOTE: Er is GEEN 'docs_compleet' stage meer in de 6-stage pipeline.
 * Documenten worden verzameld tijdens 'intake_verstuurd' stage.
 * 
 * Deze functie retourneert nu alleen een bericht dat interview planning handmatig is.
 */

interface AutoInterviewRequest {
  application_id?: string;
  trigger_source?: string;
  force?: boolean;
  alternative_attempt?: number;
  include_completion_message?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: AutoInterviewRequest = await req.json();
    const { application_id, trigger_source = 'unknown' } = body;

    logWarning('AutoSendInterviewSlots', 'DEPRECATED: Interview planning is nu handmatig', {
      application_id,
      trigger_source
    });

    logInfo('AutoSendInterviewSlots', 'Functie uitgeschakeld - recruiters plannen gesprekken via UI', {
      new_flow: [
        'nieuw → intake_verstuurd',
        'intake_verstuurd → gesprek_gepland (HANDMATIG)',
        'gesprek_gepland → screening (na positieve feedback)',
        'screening → goedgekeurd',
        'goedgekeurd → geplaatst'
      ]
    });

    return jsonResponse({
      success: false,
      deprecated: true,
      reason: 'function_disabled',
      message: 'Interview planning is nu handmatig. Recruiters plannen gesprekken via de UI wanneer kandidaat documenten heeft ingediend.',
      new_flow: {
        description: 'Fysieke gesprekken worden handmatig gepland door recruiters (6-stage pipeline)',
        stages: [
          { from: 'nieuw', to: 'intake_verstuurd', trigger: 'welkomstmail verzonden' },
          { from: 'intake_verstuurd', to: 'gesprek_gepland', trigger: 'HANDMATIG: recruiter vult gesprek_datum in' },
          { from: 'gesprek_gepland', to: 'screening', trigger: 'HANDMATIG: positieve gesprek_feedback door recruiter' },
          { from: 'screening', to: 'goedgekeurd', trigger: 'VOG geverifieerd' },
          { from: 'goedgekeurd', to: 'geplaatst', trigger: 'plaatsing bij klant' }
        ]
      },
      action_required: 'Gebruik de Sollicitaties UI om gesprek_datum in te vullen voor kandidaten in "intake_verstuurd" stage',
      application_id
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logWarning('AutoSendInterviewSlots', `Error (deprecated function): ${errorMessage}`);
    
    return jsonResponse({
      success: false,
      deprecated: true,
      reason: 'function_disabled',
      message: 'Interview planning is nu handmatig via de UI.',
      error: errorMessage
    });
  }
});
