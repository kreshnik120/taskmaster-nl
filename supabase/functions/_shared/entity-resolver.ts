/**
 * Entity Resolution & Context
 * Disambiguates entities, applies temporal filtering, and traverses relationships
 */

interface EntityContext {
  entityName: string;
  entityType: string;
  knowledgeId?: string;
  relationships: Array<{
    relatedEntity: string;
    relationshipType: string;
    confidence: number;
  }>;
  temporalContext?: {
    validFrom?: string;
    validTo?: string;
    isHistorical: boolean;
    isCurrent: boolean;
  };
}

/**
 * Resolve entity from question and get context
 */
export async function resolveEntity(
  entityName: string,
  question: string,
  orgId: string,
  supabase: any
): Promise<EntityContext | null> {
  console.log(`🔍 Resolving entity: "${entityName}"`);

  // Try to find entity in knowledge base
  const { data: knowledgeItems, error: kbError } = await supabase
    .from('ai_knowledge_base')
    .select('id, category, key, value, valid_from, valid_to')
    .or(`key.ilike.%${entityName}%,value->>name.ilike.%${entityName}%,value->>bedrijfsnaam.ilike.%${entityName}%`)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .limit(5);

  if (kbError || !knowledgeItems || knowledgeItems.length === 0) {
    console.log(`⚠️ Entity "${entityName}" not found in knowledge base`);
    return null;
  }

  // Detect entity type from category
  const firstItem = knowledgeItems[0];
  let entityType = 'unknown';
  
  if (firstItem.category?.includes('klant') || firstItem.category?.includes('client')) {
    entityType = 'client';
  } else if (firstItem.category?.includes('bedrijf') || firstItem.category?.includes('organisatie')) {
    entityType = 'organization';
  } else if (firstItem.category?.includes('professional') || firstItem.category?.includes('zzp')) {
    entityType = 'professional';
  }

  // Get relationships
  const relationships = await getEntityRelationships(entityName, orgId, supabase);

  // Determine temporal context from question
  const temporalContext = extractTemporalContext(question, firstItem);

  return {
    entityName,
    entityType,
    knowledgeId: firstItem.id,
    relationships,
    temporalContext
  };
}

/**
 * Get entity relationships from the database
 */
async function getEntityRelationships(
  entityName: string,
  orgId: string,
  supabase: any
): Promise<EntityContext['relationships']> {
  const { data: relationships, error } = await supabase.rpc('get_entity_relationships', {
    entity_name_param: entityName,
    org_id_param: orgId,
    max_depth: 2
  });

  if (error || !relationships) {
    return [];
  }

  return relationships.map((rel: any) => ({
    relatedEntity: rel.related_entity,
    relationshipType: rel.relationship,
    confidence: rel.confidence
  }));
}

/**
 * Extract temporal context from question
 */
function extractTemporalContext(
  question: string,
  knowledgeItem: any
): EntityContext['temporalContext'] {
  const questionLower = question.toLowerCase();
  const now = new Date();

  // Check for historical references
  const isHistorical = questionLower.match(/\b(was|waren|had|vorig|vorige|toen|destijds|eerder)\b/);
  
  // Extract year references
  const yearMatch = questionLower.match(/\b(20\d{2}|19\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : now.getFullYear();

  // Check if knowledge item has validity dates
  const validFrom = knowledgeItem.valid_from ? new Date(knowledgeItem.valid_from) : null;
  const validTo = knowledgeItem.valid_to ? new Date(knowledgeItem.valid_to) : null;

  let isCurrent = true;
  
  if (validFrom && validFrom > now) {
    isCurrent = false; // Future item
  }
  
  if (validTo && validTo < now) {
    isCurrent = false; // Expired item
  }

  return {
    validFrom: validFrom?.toISOString(),
    validTo: validTo?.toISOString(),
    isHistorical: !!isHistorical || year < now.getFullYear(),
    isCurrent
  };
}

/**
 * Apply temporal filter to knowledge base results
 */
export function applyTemporalFilter(
  knowledgeItems: any[],
  temporalContext?: EntityContext['temporalContext']
): any[] {
  if (!temporalContext) {
    // No temporal context, return only current items
    const now = new Date();
    return knowledgeItems.filter(item => {
      const validFrom = item.valid_from ? new Date(item.valid_from) : null;
      const validTo = item.valid_to ? new Date(item.valid_to) : null;
      
      const isValid = (!validFrom || validFrom <= now) && (!validTo || validTo >= now);
      return isValid;
    });
  }

  if (temporalContext.isHistorical) {
    // Return historical items (even if expired)
    return knowledgeItems;
  }

  // Return only current items
  return knowledgeItems.filter(item => {
    const validFrom = item.valid_from ? new Date(item.valid_from) : null;
    const validTo = item.valid_to ? new Date(item.valid_to) : null;
    const now = new Date();
    
    return (!validFrom || validFrom <= now) && (!validTo || validTo >= now);
  });
}

/**
 * Expand knowledge via entity relationships
 */
export async function expandViaRelationships(
  knowledgeItems: any[],
  orgId: string,
  supabase: any
): Promise<any[]> {
  const expanded = [...knowledgeItems];
  const processedIds = new Set(knowledgeItems.map(item => item.id || item.knowledge_id));

  for (const item of knowledgeItems) {
    const entityName = item.key || item.value?.name || item.value?.bedrijfsnaam;
    
    if (!entityName) continue;

    // Get relationships for this entity
    const { data: relationships } = await supabase.rpc('get_entity_relationships', {
      entity_name_param: entityName,
      org_id_param: orgId,
      max_depth: 1
    });

    if (!relationships || relationships.length === 0) continue;

    // For each relationship, fetch related knowledge
    for (const rel of relationships) {
      if (rel.confidence < 0.7) continue; // Skip low-confidence relationships

      const { data: relatedKnowledge, error } = await supabase
        .from('ai_knowledge_base')
        .select('*')
        .or(`key.ilike.%${rel.related_entity}%,value->>name.ilike.%${rel.related_entity}%`)
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .limit(3);

      if (error || !relatedKnowledge) continue;

      for (const relKb of relatedKnowledge) {
        if (!processedIds.has(relKb.id)) {
          expanded.push({
            ...relKb,
            _via_relationship: {
              from: entityName,
              type: rel.relationship,
              to: rel.related_entity
            }
          });
          processedIds.add(relKb.id);
        }
      }
    }
  }

  console.log(`🔗 Expanded ${knowledgeItems.length} items to ${expanded.length} via relationships`);
  return expanded;
}

/**
 * Disambiguate entity mentions in question
 */
export async function disambiguateEntities(
  question: string,
  orgId: string,
  supabase: any
): Promise<Map<string, EntityContext>> {
  const entities = extractEntityMentions(question);
  const resolved = new Map<string, EntityContext>();

  for (const entity of entities) {
    const context = await resolveEntity(entity, question, orgId, supabase);
    if (context) {
      resolved.set(entity, context);
    }
  }

  return resolved;
}

/**
 * Extract entity mentions from question
 */
function extractEntityMentions(question: string): string[] {
  const entities: string[] = [];
  
  // Capitalized words (proper nouns)
  const capitalizedPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  const capitalizedMatches = question.matchAll(capitalizedPattern);
  
  for (const match of capitalizedMatches) {
    const entity = match[1].trim();
    // Filter out common question words
    if (!['Wat', 'Welke', 'Wie', 'Waar', 'Hoe', 'Wanneer', 'De', 'Het', 'Een'].includes(entity)) {
      entities.push(entity);
    }
  }

  // Acronyms
  const acronymPattern = /\b([A-Z]{2,})\b/g;
  const acronymMatches = question.matchAll(acronymPattern);
  
  for (const match of acronymMatches) {
    entities.push(match[1]);
  }

  return [...new Set(entities)]; // Remove duplicates
}
