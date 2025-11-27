import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

    // Get organization ID
    const { data: orgData } = await supabase
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    if (!orgData) {
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

    // Map application data to professional
    const professionalData = {
      org_id: orgData.org_id,
      full_name: application.extracted_data.naam,
      functie_niveau: application.extracted_data.functie_niveau,
      werkvorm: application.extracted_data.werkvorm || null,
      regio: application.extracted_data.regio || null,
      telefoonnummer: application.extracted_data.telefoon || null,
      email: application.email_from,
      heeft_auto: application.extracted_data.eigen_vervoer || false,
      skills: application.extracted_data.ervaring_sector || [],
      status: 'beschikbaar',
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
      org_id: orgData.org_id,
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
