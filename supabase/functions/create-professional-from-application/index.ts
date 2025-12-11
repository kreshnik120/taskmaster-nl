import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

/**
 * Phase 3: Create Professional from Application
 * 
 * Automatically creates a professional profile when an application reaches 'goedgekeurd' stage.
 * Triggers document request flow for VOG and diplomas.
 */

interface CreateProfessionalRequest {
  application_id: string;
  trigger_source?: 'database_trigger' | 'manual' | 'api';
}

// Auto-determine provincie based on regio
function bepaalProvincie(regio: string | null): string | null {
  if (!regio) return null;
  
  const regioLower = regio.toLowerCase();
  
  if (regioLower.includes('brabant') || regioLower.includes('eindhoven') || 
      regioLower.includes('tilburg') || regioLower.includes('breda') || 
      regioLower.includes('helmond') || regioLower.includes('oss')) {
    return 'Noord-Brabant';
  }
  
  if (regioLower.includes('limburg') || regioLower.includes('maastricht') || 
      regioLower.includes('venlo') || regioLower.includes('sittard') || 
      regioLower.includes('heerlen') || regioLower.includes('roermond')) {
    return 'Limburg';
  }
  
  if (regioLower.includes('gelderland') || regioLower.includes('nijmegen') || 
      regioLower.includes('arnhem') || regioLower.includes('apeldoorn') || 
      regioLower.includes('ede') || regioLower.includes('doetinchem')) {
    return 'Gelderland';
  }
  
  if (regioLower.includes('utrecht') || regioLower.includes('amersfoort') || 
      regioLower.includes('veenendaal') || regioLower.includes('nieuwegein')) {
    return 'Utrecht';
  }
  
  if (regioLower.includes('amsterdam') || regioLower.includes('haarlem') || 
      regioLower.includes('zaanstad') || regioLower.includes('alkmaar') || 
      regioLower.includes('noord-holland')) {
    return 'Noord-Holland';
  }
  
  if (regioLower.includes('rotterdam') || regioLower.includes('den haag') || 
      regioLower.includes('leiden') || regioLower.includes('dordrecht') || 
      regioLower.includes('zuid-holland')) {
    return 'Zuid-Holland';
  }
  
  if (regioLower.includes('overijssel') || regioLower.includes('enschede') || 
      regioLower.includes('zwolle') || regioLower.includes('almelo') || 
      regioLower.includes('deventer') || regioLower.includes('hengelo')) {
    return 'Overijssel';
  }
  
  return null;
}

// Map form values to database enum values
const werkvormMapping: Record<string, string> = {
  'abcito': 'ABCito constructie',
  'uitzend': 'Uitzendkracht',
  'uitzendkracht': 'Uitzendkracht',
  'zzp': 'ZZP',
  'beide': 'Beide'
};

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createAdminClient();
    const body: CreateProfessionalRequest = await req.json();
    const { application_id, trigger_source = 'api' } = body;

    if (!application_id) {
      return errorResponse('application_id is required', 400);
    }

    console.log(`🚀 [Create Professional] Starting for application ${application_id} (trigger: ${trigger_source})`);

    // =====================================================
    // STEP 1: Fetch Application Data
    // =====================================================
    const { data: application, error: appError } = await supabase
      .from('professional_applications')
      .select('*')
      .eq('id', application_id)
      .single();

    if (appError || !application) {
      console.error('❌ Application not found:', appError);
      return errorResponse('Application not found', 404);
    }

    // Check if already converted
    if (application.professional_id) {
      console.log('⚠️ Application already converted to professional:', application.professional_id);
      return jsonResponse({
        success: false,
        error: 'already_converted',
        professional_id: application.professional_id,
        message: 'Application already has a linked professional'
      });
    }

    const extractedData = application.extracted_data || {};

    // =====================================================
    // STEP 2: Validate Required Fields
    // =====================================================
    if (!extractedData.naam) {
      console.error('❌ Missing required field: naam');
      return errorResponse('Missing required field: naam', 400);
    }

    // functie_niveau is important but we'll allow creation with a default if missing
    const functieNiveau = extractedData.functie_niveau || 'Onbekend';

    // =====================================================
    // STEP 3: Determine Organization
    // =====================================================
    const assignedOrg = extractedData.assigned_organization;
    let orgId: string | null = null;

    if (assignedOrg) {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id')
        .eq('name', assignedOrg)
        .maybeSingle();
      
      orgId = orgData?.id || null;
    }

    // Fallback to CitoZorg as default
    if (!orgId) {
      orgId = '650e8400-e29b-41d4-a716-446655440001'; // CitoZorg
    }

    console.log(`📌 [Create Professional] Using org_id: ${orgId} (${assignedOrg || 'fallback'})`);

    // =====================================================
    // STEP 4: Check for Duplicate Professional
    // =====================================================
    const normalizedEmail = application.email_from?.trim().toLowerCase();
    
    if (normalizedEmail) {
      const { data: duplicateCheck } = await supabase
        .rpc('check_duplicate_email', { 
          p_email: normalizedEmail, 
          p_table: 'professionals' 
        });
      
      const existingProfessional = duplicateCheck?.[0] || null;

      if (existingProfessional) {
        console.log('⚠️ Duplicate professional found:', existingProfessional.id);
        
        // Link application to existing professional
        await supabase
          .from('professional_applications')
          .update({ professional_id: existingProfessional.id })
          .eq('id', application_id);

        return jsonResponse({
          success: false,
          error: 'duplicate_professional',
          professional_id: existingProfessional.id,
          professional_name: existingProfessional.naam,
          message: 'Linked to existing professional'
        });
      }
    }

    // =====================================================
    // STEP 5: Create Professional Record
    // =====================================================
    const mappedWerkvorm = extractedData.werkvorm 
      ? (werkvormMapping[extractedData.werkvorm.toLowerCase()] || extractedData.werkvorm)
      : null;

    // Determine initial status: pending_documents if VOG/diplomas needed
    const hasVog = !!extractedData.vog_file_path || !!extractedData.vog_date;
    const hasDiplomas = !!(extractedData.diploma_file_paths?.length > 0);
    const initialStatus = (hasVog && hasDiplomas) ? 'beschikbaar' : 'beschikbaar_pending_documents';

    const professionalData = {
      org_id: orgId,
      full_name: extractedData.naam,
      functie_niveau: functieNiveau,
      werkvorm: mappedWerkvorm,
      regio: extractedData.regio || null,
      provincie: bepaalProvincie(extractedData.regio),
      telefoonnummer: extractedData.telefoon || null,
      email: application.email_from,
      heeft_auto: extractedData.eigen_vervoer || false,
      skills: extractedData.ervaring_sector || [],
      status: initialStatus,
      tags: extractedData.doelgroep_ervaring || [],
      // NAW fields
      woonplaats: extractedData.woonplaats || null,
      postcode: extractedData.postcode || null,
      adres: extractedData.adres || null,
      geboortedatum: extractedData.geboortedatum || null,
      profile_photo_url: extractedData.profile_photo_url || null,
      // Matching fields
      ervaring_sector: extractedData.ervaring_sector || [],
      doelgroep_ervaring: extractedData.doelgroep_ervaring || [],
      jaren_ervaring: extractedData.jaren_ervaring || null,
      leidinggevende_ervaring: extractedData.leidinggevende_ervaring || false,
      nachtdienst_bereid: extractedData.nachtdienst_bereid || false,
      weekenddienst_bereid: extractedData.weekenddienst_bereid || false,
      // Extended data fields
      certificaten: extractedData.certificaten || [],
      opleidingen: extractedData.opleidingen || [],
      talen: extractedData.talen || [],
      regio_voorkeur: extractedData.regio_voorkeur || [],
      specifieke_doelgroepen: extractedData.specifieke_doelgroepen || [],
      max_reisafstand_km: extractedData.max_reisafstand_km || null,
      specialisaties: extractedData.specialisaties || [],
      // Document tracking
      vog_date: extractedData.vog_date || null,
      vog_file_path: extractedData.vog_file_path || null,
    };

    console.log(`📝 [Create Professional] Creating professional: ${professionalData.full_name}`);

    const { data: newProfessional, error: insertError } = await supabase
      .from('professionals')
      .insert(professionalData)
      .select()
      .single();

    if (insertError) {
      console.error('❌ Failed to create professional:', insertError);
      return errorResponse(`Failed to create professional: ${insertError.message}`, 500);
    }

    console.log(`✅ [Create Professional] Created professional: ${newProfessional.id}`);

    // =====================================================
    // STEP 6: Link Application to Professional
    // =====================================================
    const { error: linkError } = await supabase
      .from('professional_applications')
      .update({ 
        professional_id: newProfessional.id,
        pipeline_stage: 'goedgekeurd' // Ensure stage is set
      })
      .eq('id', application_id);

    if (linkError) {
      console.error('⚠️ Failed to link application:', linkError);
    }

    // =====================================================
    // STEP 7: Log System Event for AI Learning
    // =====================================================
    await supabase.from('system_events').insert({
      event_type: 'professional_created_from_application',
      entity_type: 'professional',
      entity_id: newProfessional.id,
      org_id: orgId,
      event_data: {
        source_application_id: application_id,
        functie_niveau: functieNiveau,
        werkvorm: extractedData.werkvorm,
        regio: extractedData.regio,
        completeness_at_conversion: application.completeness_score,
        conversion_trigger: trigger_source,
        documents_status: {
          has_vog: hasVog,
          has_diplomas: hasDiplomas,
          initial_status: initialStatus
        }
      },
      metadata: {}
    });

    // =====================================================
    // STEP 8: Create Document Request Goal (if needed)
    // =====================================================
    const missingDocuments: string[] = [];
    if (!hasVog) missingDocuments.push('VOG (Verklaring Omtrent Gedrag)');
    if (!hasDiplomas) missingDocuments.push('Diploma/Certificaten');

    if (missingDocuments.length > 0) {
      console.log(`📄 [Create Professional] Creating document request goal for: ${missingDocuments.join(', ')}`);

      // Calculate deadline (7 days from now)
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 7);

      await supabase.from('agent_goals').insert({
        org_id: orgId,
        goal_type: 'professional_document_collection',
        goal_description: `Verzamel documenten voor ${extractedData.naam}: ${missingDocuments.join(', ')}`,
        status: 'pending',
        priority: 8, // High priority
        deadline: deadline.toISOString(),
        input_data: {
          professional_id: newProfessional.id,
          application_id: application_id,
          candidate_email: application.email_from,
          candidate_name: extractedData.naam,
          missing_documents: missingDocuments,
          has_vog: hasVog,
          has_diplomas: hasDiplomas
        }
      });

      console.log(`✅ [Create Professional] Document collection goal created`);
    }

    // =====================================================
    // STEP 9: Return Success Response
    // =====================================================
    return jsonResponse({
      success: true,
      professional_id: newProfessional.id,
      professional_name: newProfessional.full_name,
      initial_status: initialStatus,
      documents_requested: missingDocuments.length > 0,
      missing_documents: missingDocuments,
      message: `Professional ${newProfessional.full_name} aangemaakt${missingDocuments.length > 0 ? ', documenten worden opgevraagd' : ''}`
    });

  } catch (error: unknown) {
    console.error('❌ [Create Professional] Unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(message, 500);
  }
});
