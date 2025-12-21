import { supabase } from "@/integrations/supabase/client";
import { parseBeschikbaarheid } from "./parseBeschikbaarheid";

interface Application {
  id: string;
  email_from: string;
  extracted_data: Record<string, any> | null;
  professional_id?: string | null;
}

interface SyncResult {
  success: boolean;
  fieldsUpdated: number;
  fieldsSynced: string[];
  error?: string;
}

/**
 * Merge arrays without duplicates (case-insensitive)
 */
function mergeArrays(existing: string[] | null, incoming: string[] | null): string[] {
  if (!incoming || incoming.length === 0) return existing || [];
  if (!existing || existing.length === 0) return incoming;

  const existingLower = new Set(existing.map(s => s.toLowerCase()));
  const merged = [...existing];

  for (const item of incoming) {
    if (!existingLower.has(item.toLowerCase())) {
      merged.push(item);
    }
  }

  return merged;
}

/**
 * Synchroniseer data van een applicatie naar een bestaand professional profiel
 * 
 * Merge strategie:
 * - Professional bestaande waarden hebben prioriteit
 * - Alleen lege/null velden worden gevuld met applicatie data
 * - Arrays worden gemerged (geen duplicaten)
 */
export async function syncApplicationToProfessional(
  application: Application,
  professionalId: string
): Promise<SyncResult> {
  const fieldsSynced: string[] = [];

  try {
    // 1. Haal huidige professional data op
    const { data: professional, error: fetchError } = await supabase
      .from('professionals')
      .select('*')
      .eq('id', professionalId)
      .single();

    if (fetchError || !professional) {
      return {
        success: false,
        fieldsUpdated: 0,
        fieldsSynced: [],
        error: `Professional niet gevonden: ${fetchError?.message || 'Onbekende fout'}`
      };
    }

    const extracted = application.extracted_data || {};
    const updates: Record<string, any> = {};

    // 2. Definieer veld mappings: [applicatie_veld, professional_veld, type]
    const fieldMappings: Array<[string, string, 'simple' | 'array' | 'beschikbaarheid']> = [
      // NAW velden - alleen vullen als leeg
      ['telefoon', 'telefoonnummer', 'simple'],
      ['adres', 'adres', 'simple'],
      ['postcode', 'postcode', 'simple'],
      ['woonplaats', 'woonplaats', 'simple'],
      ['geboortedatum', 'geboortedatum', 'simple'],
      
      // Werk gerelateerd
      ['regio', 'regio', 'simple'],
      ['jaren_ervaring', 'jaren_ervaring', 'simple'],
      ['max_reisafstand_km', 'max_reisafstand_km', 'simple'],
      
      // Boolean velden
      ['eigen_vervoer', 'heeft_auto', 'simple'],
      ['leidinggevende_ervaring', 'leidinggevende_ervaring', 'simple'],
      ['nachtdienst_bereid', 'nachtdienst_bereid', 'simple'],
      ['weekenddienst_bereid', 'weekenddienst_bereid', 'simple'],
      
      // Array velden - worden gemerged
      ['ervaring_sector', 'ervaring_sector', 'array'],
      ['doelgroep_ervaring', 'doelgroep_ervaring', 'array'],
      ['certificaten', 'certificaten', 'array'],
      ['opleidingen', 'opleidingen', 'array'],
      ['talen', 'talen', 'array'],
      ['specialisaties', 'specialisaties', 'array'],
      ['regio_voorkeur', 'regio_voorkeur', 'array'],
      ['specifieke_doelgroepen', 'specifieke_doelgroepen', 'array'],
      
      // Beschikbaarheid - speciale parsing
      ['beschikbaarheid', 'beschikbaarheid_uren', 'beschikbaarheid'],
    ];

    // 3. Loop door mappings en bepaal wat gesynct moet worden
    for (const [appField, profField, fieldType] of fieldMappings) {
      const appValue = extracted[appField];
      const profValue = professional[profField];

      if (fieldType === 'simple') {
        // Alleen vullen als professional veld leeg is en applicatie waarde heeft
        if ((profValue === null || profValue === undefined || profValue === '') && 
            appValue !== null && appValue !== undefined && appValue !== '') {
          updates[profField] = appValue;
          fieldsSynced.push(profField);
        }
      } else if (fieldType === 'array') {
        // Merge arrays
        const mergedArray = mergeArrays(profValue as string[] | null, appValue as string[] | null);
        const existingArray = profValue as string[] | null || [];
        
        if (mergedArray.length > existingArray.length) {
          updates[profField] = mergedArray;
          fieldsSynced.push(profField);
        }
      } else if (fieldType === 'beschikbaarheid') {
        // Parse beschikbaarheid string naar JSON
        if ((profValue === null || profValue === undefined) && appValue) {
          const parsed = parseBeschikbaarheid(appValue);
          if (parsed) {
            updates[profField] = parsed;
            fieldsSynced.push(profField);
          }
        }
      }
    }

    // 4. Voer update uit als er wijzigingen zijn
    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();

      const { error: updateError } = await supabase
        .from('professionals')
        .update(updates)
        .eq('id', professionalId);

      if (updateError) {
        throw updateError;
      }

      // 5. Log system event voor AI learning
      const { data: { user } } = await supabase.auth.getUser();
      
      await supabase.from('system_events').insert({
        event_type: 'professional_data_synced',
        entity_type: 'professional',
        entity_id: professionalId,
        org_id: professional.org_id,
        user_id: user?.id || null,
        event_data: {
          source_application_id: application.id,
          fields_synced: fieldsSynced,
          sync_strategy: 'merge_empty_fields',
          trigger: 'goedgekeurd_transition',
          updates_applied: updates
        }
      });
    }

    return {
      success: true,
      fieldsUpdated: fieldsSynced.length,
      fieldsSynced
    };

  } catch (error: any) {
    console.error('Error syncing application to professional:', error);
    return {
      success: false,
      fieldsUpdated: 0,
      fieldsSynced: [],
      error: error?.message || 'Onbekende fout bij synchronisatie'
    };
  }
}
