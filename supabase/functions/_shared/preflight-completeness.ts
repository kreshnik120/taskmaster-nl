/**
 * Preflight Completeness Check
 * Detects missing information BEFORE generating AI response
 * Triggers actions to fetch missing data (e.g., KVK lookup)
 */

interface PreflightResult {
  complete: boolean;
  requiredInfoTypes: string[];
  availableInfoTypes: string[];
  missingInfoTypes: string[];
  actions: Array<{
    type: 'kvk_lookup' | 'tariff_lookup' | 'contact_lookup';
    entity: string;
    reason: string;
  }>;
  knowledgeGaps: string[];
}

/**
 * Detect which information types are required based on the question
 */
function detectRequiredInfoTypes(question: string): string[] {
  const questionLower = question.toLowerCase();
  const required: string[] = [];

  // Address-related
  if (questionLower.match(/\b(adres|straat|postcode|plaats|locatie)\b/)) {
    required.push('address');
  }

  // KVK-related
  if (questionLower.match(/\b(kvk|kvk[-\s]?nummer|handelsregister)\b/)) {
    required.push('kvk_number');
  }

  // BTW-related
  if (questionLower.match(/\b(btw|btw[-\s]?nummer|vat)\b/)) {
    required.push('btw_number');
  }

  // Company info
  if (questionLower.match(/\b(bedrijf|organisatie|onderneming|rechtsvorm)\b/)) {
    required.push('company_info');
  }

  // Tariff/pricing
  if (questionLower.match(/\b(tarief|prijs|kosten|tariev|uurtarief|uurtarieven)\b/)) {
    required.push('tariff');
  }

  // Contact info
  if (questionLower.match(/\b(contact|telefoon|email|telefoonnummer|emailadres)\b/)) {
    required.push('contact');
  }

  // Contract info
  if (questionLower.match(/\b(contract|overeenkomst|afspraak|voorwaarden)\b/)) {
    required.push('contract');
  }

  return required;
}

/**
 * Check which information types are available in the knowledge base
 */
function detectAvailableInfoTypes(knowledgeBase: any[]): string[] {
  const available = new Set<string>();

  for (const kb of knowledgeBase) {
    const category = kb.category?.toLowerCase() || '';
    const key = kb.key?.toLowerCase() || '';
    const value = JSON.stringify(kb.value || {}).toLowerCase();

    // Address
    if (category.includes('adres') || key.includes('adres') || 
        value.match(/\b(straat|postcode|plaats)\b/)) {
      available.add('address');
    }

    // KVK
    if (category.includes('kvk') || key.includes('kvk') || 
        value.match(/\bkvk[-\s]?nummer\b/)) {
      available.add('kvk_number');
    }

    // BTW
    if (category.includes('btw') || key.includes('btw') || 
        value.match(/\bbtw[-\s]?nummer\b/)) {
      available.add('btw_number');
    }

    // Company info
    if (category.includes('bedrijf') || category.includes('organisatie') ||
        key.includes('rechtsvorm') || key.includes('handelsnaam')) {
      available.add('company_info');
    }

    // Tariff
    if (category.includes('tarief') || key.includes('tarief') ||
        key.includes('prijs') || key.includes('uurtarief')) {
      available.add('tariff');
    }

    // Contact
    if (category.includes('contact') || key.includes('telefoon') ||
        key.includes('email')) {
      available.add('contact');
    }

    // Contract
    if (category.includes('contract') || key.includes('contract') ||
        key.includes('overeenkomst')) {
      available.add('contract');
    }
  }

  return Array.from(available);
}

/**
 * Extract entity names from the question (clients, organizations)
 */
function extractEntities(question: string): string[] {
  const entities: string[] = [];
  
  // Common client/company patterns
  const patterns = [
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g, // Capitalized words
    /\b([A-Z]{2,})\b/g, // Acronyms
  ];

  for (const pattern of patterns) {
    const matches = question.matchAll(pattern);
    for (const match of matches) {
      const entity = match[1].trim();
      // Filter out common words
      if (!['Wat', 'Welke', 'Wie', 'Waar', 'Hoe', 'De', 'Het', 'Een'].includes(entity)) {
        entities.push(entity);
      }
    }
  }

  return [...new Set(entities)]; // Remove duplicates
}

/**
 * Main preflight completeness check
 */
export async function preflightCompletenessCheck(
  question: string,
  knowledgeBase: any[],
  orgId: string
): Promise<PreflightResult> {
  const required = detectRequiredInfoTypes(question);
  const available = detectAvailableInfoTypes(knowledgeBase);
  const missing = required.filter(type => !available.includes(type));

  const actions: PreflightResult['actions'] = [];
  const knowledgeGaps: string[] = [];
  const entities = extractEntities(question);

  // Determine actions for missing info
  for (const missingType of missing) {
    switch (missingType) {
      case 'address':
      case 'kvk_number':
      case 'btw_number':
      case 'company_info':
        // These can be fetched via KVK Smart Lookup
        if (entities.length > 0) {
          actions.push({
            type: 'kvk_lookup',
            entity: entities[0], // Use first entity found
            reason: `Missing ${missingType} for ${entities[0]}`
          });
        } else {
          knowledgeGaps.push(`${missingType} requested but no entity detected`);
        }
        break;

      case 'tariff':
        knowledgeGaps.push('Tariff information not in knowledge base');
        break;

      case 'contact':
        knowledgeGaps.push('Contact information not in knowledge base');
        break;

      case 'contract':
        knowledgeGaps.push('Contract information not in knowledge base');
        break;
    }
  }

  return {
    complete: missing.length === 0,
    requiredInfoTypes: required,
    availableInfoTypes: available,
    missingInfoTypes: missing,
    actions: actions,
    knowledgeGaps: knowledgeGaps
  };
}

/**
 * Execute preflight actions (fetch missing data)
 */
export async function executePreflightActions(
  actions: PreflightResult['actions'],
  orgId: string,
  supabase: any
): Promise<{ actionsTaken: number; dataFetched: any[] }> {
  let actionsTaken = 0;
  const dataFetched: any[] = [];

  for (const action of actions) {
    if (action.type === 'kvk_lookup') {
      console.log(`🔍 Preflight: Fetching KVK data for ${action.entity}`);
      
      try {
        const { data: kvkData, error } = await supabase.functions.invoke('kvk-smart-lookup', {
          body: { 
            query: action.entity,
            org_id: orgId,
            skip_cache: false 
          }
        });

        if (!error && kvkData) {
          actionsTaken++;
          dataFetched.push(kvkData);
          console.log(`✅ Preflight: KVK data fetched for ${action.entity}`);
        }
      } catch (error) {
        console.warn(`⚠️ Preflight: KVK lookup failed for ${action.entity}:`, error);
      }
    }
    // Add more action types here as needed
  }

  return { actionsTaken, dataFetched };
}
