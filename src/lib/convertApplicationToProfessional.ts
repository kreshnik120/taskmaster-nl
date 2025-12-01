import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Auto-determine provincie based on regio
 */
function bepaalProvincie(regio: string | null): string | null {
  if (!regio) return null;
  
  const regioLower = regio.toLowerCase();
  
  // Noord-Brabant
  if (regioLower.includes('brabant') || regioLower.includes('eindhoven') || 
      regioLower.includes('tilburg') || regioLower.includes('breda') || 
      regioLower.includes('helmond') || regioLower.includes('oss')) {
    return 'Noord-Brabant';
  }
  
  // Limburg
  if (regioLower.includes('limburg') || regioLower.includes('maastricht') || 
      regioLower.includes('venlo') || regioLower.includes('sittard') || 
      regioLower.includes('heerlen') || regioLower.includes('roermond')) {
    return 'Limburg';
  }
  
  // Gelderland
  if (regioLower.includes('gelderland') || regioLower.includes('nijmegen') || 
      regioLower.includes('arnhem') || regioLower.includes('apeldoorn') || 
      regioLower.includes('ede') || regioLower.includes('doetinchem')) {
    return 'Gelderland';
  }
  
  // Utrecht
  if (regioLower.includes('utrecht') || regioLower.includes('amersfoort') || 
      regioLower.includes('veenendaal') || regioLower.includes('nieuwegein')) {
    return 'Utrecht';
  }
  
  // Noord-Holland
  if (regioLower.includes('amsterdam') || regioLower.includes('haarlem') || 
      regioLower.includes('zaanstad') || regioLower.includes('alkmaar') || 
      regioLower.includes('noord-holland')) {
    return 'Noord-Holland';
  }
  
  // Zuid-Holland
  if (regioLower.includes('rotterdam') || regioLower.includes('den haag') || 
      regioLower.includes('leiden') || regioLower.includes('dordrecht') || 
      regioLower.includes('zuid-holland')) {
    return 'Zuid-Holland';
  }
  
  // Overijssel
  if (regioLower.includes('overijssel') || regioLower.includes('enschede') || 
      regioLower.includes('zwolle') || regioLower.includes('almelo') || 
      regioLower.includes('deventer') || regioLower.includes('hengelo')) {
    return 'Overijssel';
  }
  
  return null;
}

interface Application {
  id: string;
  email_from: string;
  extracted_data: any;
  completeness_score: number | null;
}

interface ConversionResult {
  success: boolean;
  professionalId?: string;
  professionalName?: string;
  error?: string;
}

/**
 * Convert a professional application to a professional profile
 * Used for both manual (via button) and automatic (via drag-drop) conversion
 */
export async function convertApplicationToProfessional(
  application: Application,
  options: { showToast?: boolean; silent?: boolean } = {}
): Promise<ConversionResult> {
  const { showToast = true, silent = false } = options;

  // Validation
  if (!application.extracted_data?.naam || !application.extracted_data?.functie_niveau) {
    if (showToast) {
      toast.error("Naam en functie niveau zijn verplicht");
    }
    return { success: false, error: "Missing required fields" };
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      if (showToast) {
        toast.error("Je moet ingelogd zijn");
      }
      return { success: false, error: "Not authenticated" };
    }

    // Bepaal org_id op basis van toegewezen bemiddelingsbureau
    const assignedOrg = application.extracted_data?.assigned_organization;
    let orgId: string | null = null;
    
    if (assignedOrg) {
      // Haal de org_id op basis van bureau naam (ABCzorg of CitoZorg)
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id')
        .eq('name', assignedOrg)
        .maybeSingle();
      
      orgId = orgData?.id || null;
    }
    
    // Fallback: eerste organisatie van gebruiker als geen bureau toegewezen
    if (!orgId) {
      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      
      orgId = userOrg?.org_id || null;
    }

    if (!orgId) {
      if (showToast) {
        toast.error("Geen organisatie gevonden");
      }
      return { success: false, error: "No organization found" };
    }

    // Check for duplicate professional by email
    const { data: existingProfessional } = await supabase
      .from('professionals')
      .select('id, full_name')
      .eq('email', application.email_from)
      .maybeSingle();

    if (existingProfessional) {
      if (showToast) {
        toast.error(`Professional bestaat al: ${existingProfessional.full_name}`);
      }
      return { 
        success: false, 
        error: "Duplicate professional",
        professionalId: existingProfessional.id,
        professionalName: existingProfessional.full_name
      };
    }

    // Map form values to database enum values
    const werkvormMapping: Record<string, string> = {
      'abcito': 'ABCito constructie',
      'uitzend': 'Uitzendkracht',
      'uitzendkracht': 'Uitzendkracht',
      'zzp': 'ZZP',
      'beide': 'Beide'
    };

    const mappedWerkvorm = application.extracted_data.werkvorm 
      ? (werkvormMapping[application.extracted_data.werkvorm.toLowerCase()] || application.extracted_data.werkvorm)
      : null;

    // Map application data to professional
    const professionalData = {
      org_id: orgId,
      full_name: application.extracted_data.naam,
      functie_niveau: application.extracted_data.functie_niveau,
      werkvorm: mappedWerkvorm,
      regio: application.extracted_data.regio || null,
      provincie: bepaalProvincie(application.extracted_data.regio),
      telefoonnummer: application.extracted_data.telefoon || null,
      email: application.email_from,
      heeft_auto: application.extracted_data.eigen_vervoer || false,
      skills: application.extracted_data.ervaring_sector || [],
      status: 'actief',
      tags: application.extracted_data.doelgroep_ervaring || []
    };

    // Create professional
    const { data: newProfessional, error: professionalError } = await supabase
      .from('professionals')
      .insert(professionalData)
      .select()
      .single();

    if (professionalError) throw professionalError;

    // Link application to professional
    const { error: updateError } = await supabase
      .from('professional_applications')
      .update({ professional_id: newProfessional.id })
      .eq('id', application.id);

    if (updateError) throw updateError;

    // Log system event for AI learning
    await supabase.from('system_events').insert({
      event_type: 'professional_created_from_application',
      entity_type: 'professional',
      entity_id: newProfessional.id,
      org_id: orgId,
      user_id: user.id,
      event_data: {
        source_application_id: application.id,
        functie_niveau: application.extracted_data.functie_niveau,
        werkvorm: application.extracted_data.werkvorm,
        regio: application.extracted_data.regio,
        completeness_at_conversion: application.completeness_score,
        conversion_trigger: silent ? 'automatic_drag_drop' : 'manual_button'
      }
    });

    if (showToast) {
      toast.success(`Professional profiel aangemaakt voor ${newProfessional.full_name}!`);
    }

    return { 
      success: true, 
      professionalId: newProfessional.id,
      professionalName: newProfessional.full_name
    };
  } catch (error) {
    console.error('Error converting to professional:', error);
    if (showToast) {
      toast.error("Fout bij aanmaken professional profiel");
    }
    return { success: false, error: String(error) };
  }
}
