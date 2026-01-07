// ============================================================================
// ENTERPRISE REACT AI AGENT: Unified Tool Registry
// ============================================================================
// Consolidates 30+ tools from ai-chat and ai-agent-orchestrator
// Each tool has: name, description, category, parameters, handler reference
// ============================================================================

import type { ToolDefinition } from './react-agent-types.ts';

/**
 * Complete unified tool registry for the ReAct Agent
 * Tools are organized by category for efficient selection
 */
export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  // ═══════════════════════════════════════════════════════════════════
  // DATABASE QUERY TOOLS (read-only)
  // ═══════════════════════════════════════════════════════════════════
  
  query_professionals: {
    name: 'query_professionals',
    description: 'Doorzoek de professionals database op basis van functie, regio, beschikbaarheid, werkvorm, of specialismen. Geeft een lijst van professionals terug.',
    category: 'database',
    parameters: {
      type: 'object',
      properties: {
        functie_niveau: { type: 'string', description: 'Functieniveau zoals Verpleegkundige niveau 4, Verzorgende IG niveau 3, etc.' },
        regio: { type: 'string', description: 'Regio of provincie waar de professional werkzaam kan zijn' },
        beschikbaarheid: { type: 'string', description: 'Beschikbaarheid in uren of dagen per week' },
        werkvorm: { type: 'string', description: 'Werkvorm: ZZP, Uitzendkracht, Detachering, Payroll' },
        sector: { type: 'string', description: 'Zorgsector: GGZ, GHZ, VVT, Jeugdzorg' },
        limit: { type: 'number', description: 'Maximum aantal resultaten (default: 10)' },
      },
      required: [],
    },
    requires_approval: false,
  },

  query_applications: {
    name: 'query_applications',
    description: 'Doorzoek sollicitaties op basis van pipeline fase, naam, email, of completeness. Geeft sollicitatie details terug inclusief extracted_data.',
    category: 'database',
    parameters: {
      type: 'object',
      properties: {
        pipeline_stage: { type: 'string', description: 'Pipeline fase: nieuw, intake, screening, interview, aangenomen, afgewezen' },
        candidate_name: { type: 'string', description: 'Naam van de kandidaat (partial match)' },
        email: { type: 'string', description: 'Email adres van de kandidaat' },
        min_completeness: { type: 'number', description: 'Minimum completeness percentage (0-100)' },
        limit: { type: 'number', description: 'Maximum aantal resultaten (default: 10)' },
      },
      required: [],
    },
    requires_approval: false,
  },

  query_worklocations: {
    name: 'query_worklocations',
    description: 'Doorzoek werklocaties (sublocations) op basis van sector, plaats, provincie, doelgroep, of gezochte functies.',
    category: 'database',
    parameters: {
      type: 'object',
      properties: {
        sector: { type: 'string', description: 'Zorgsector: GGZ, GHZ, VVT, Jeugdzorg' },
        plaats: { type: 'string', description: 'Stad of gemeente' },
        provincie: { type: 'string', description: 'Provincie naam' },
        doelgroep: { type: 'string', description: 'Doelgroep: LVB, Autisme, Psychiatrie, Ouderen, NAH' },
        gezochte_functie: { type: 'string', description: 'Functie die gezocht wordt' },
        limit: { type: 'number', description: 'Maximum aantal resultaten (default: 10)' },
      },
      required: [],
    },
    requires_approval: false,
  },

  query_tasks: {
    name: 'query_tasks',
    description: 'Doorzoek taken op basis van status, type, prioriteit, of deadline. Geeft taak details terug.',
    category: 'database',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Taak status: todo, in_progress, done, cancelled' },
        task_type: { type: 'string', description: 'Type taak' },
        priority: { type: 'string', description: 'Prioriteit: low, medium, high, urgent' },
        due_before: { type: 'string', description: 'Deadline voor (ISO date string)' },
        limit: { type: 'number', description: 'Maximum aantal resultaten (default: 10)' },
      },
      required: [],
    },
    requires_approval: false,
  },

  query_clients: {
    name: 'query_clients',
    description: 'Doorzoek klantorganisaties op basis van naam, type, of regio. Geeft organisatie en locatie informatie terug.',
    category: 'database',
    parameters: {
      type: 'object',
      properties: {
        organization_name: { type: 'string', description: 'Naam van de organisatie (partial match)' },
        sector: { type: 'string', description: 'Zorgsector' },
        provincie: { type: 'string', description: 'Provincie' },
        limit: { type: 'number', description: 'Maximum aantal resultaten (default: 10)' },
      },
      required: [],
    },
    requires_approval: false,
  },

  query_vacancies: {
    name: 'query_vacancies',
    description: 'Doorzoek vacatures op basis van functie, locatie, of status. Geeft vacature details terug.',
    category: 'database',
    parameters: {
      type: 'object',
      properties: {
        functie: { type: 'string', description: 'Functie titel' },
        sublocation_id: { type: 'string', description: 'Werklocatie ID' },
        status: { type: 'string', description: 'Vacature status: open, filled, closed' },
        limit: { type: 'number', description: 'Maximum aantal resultaten (default: 10)' },
      },
      required: [],
    },
    requires_approval: false,
  },

  query_placements: {
    name: 'query_placements',
    description: 'Doorzoek plaatsingen (assignments) op basis van professional, locatie, of status.',
    category: 'database',
    parameters: {
      type: 'object',
      properties: {
        professional_id: { type: 'string', description: 'Professional UUID' },
        sublocation_id: { type: 'string', description: 'Werklocatie UUID' },
        status: { type: 'string', description: 'Plaatsing status: active, pending, completed, cancelled' },
        limit: { type: 'number', description: 'Maximum aantal resultaten (default: 10)' },
      },
      required: [],
    },
    requires_approval: false,
  },

  // ═══════════════════════════════════════════════════════════════════
  // ACTION TOOLS (write operations)
  // ═══════════════════════════════════════════════════════════════════

  send_email: {
    name: 'send_email',
    description: 'Verstuur een email naar een kandidaat of klant. Gebruikt AI om de email content te genereren.',
    category: 'action',
    parameters: {
      type: 'object',
      properties: {
        recipient_email: { type: 'string', description: 'Email adres van de ontvanger', required: true },
        recipient_name: { type: 'string', description: 'Naam van de ontvanger', required: true },
        email_type: { type: 'string', description: 'Type email: welcome, followup_question, document_request, interview_confirmation, interview_availability_request, rejection, status_update', required: true },
        subject: { type: 'string', description: 'Email onderwerp' },
        context: { type: 'object', description: 'Extra context voor email generatie' },
        application_id: { type: 'string', description: 'Gerelateerde sollicitatie ID' },
      },
      required: ['recipient_email', 'recipient_name', 'email_type'],
    },
    requires_approval: false,
  },

  schedule_interview: {
    name: 'schedule_interview',
    description: 'Plan een interview in met een kandidaat. Vraagt eerst beschikbaarheid op, daarna bevestiging.',
    category: 'action',
    parameters: {
      type: 'object',
      properties: {
        application_id: { type: 'string', description: 'Sollicitatie ID', required: true },
        candidate_email: { type: 'string', description: 'Email van de kandidaat', required: true },
        candidate_name: { type: 'string', description: 'Naam van de kandidaat' },
        interview_type: { type: 'string', description: 'Type interview: phone, video, in_person' },
        duration_minutes: { type: 'number', description: 'Duur in minuten (default: 30)' },
      },
      required: ['application_id', 'candidate_email'],
    },
    requires_approval: false,
  },

  request_documents: {
    name: 'request_documents',
    description: 'Vraag documenten op bij een kandidaat. Stuurt een email met een lijst van benodigde documenten.',
    category: 'action',
    parameters: {
      type: 'object',
      properties: {
        application_id: { type: 'string', description: 'Sollicitatie ID', required: true },
        candidate_email: { type: 'string', description: 'Email van de kandidaat', required: true },
        candidate_name: { type: 'string', description: 'Naam van de kandidaat' },
        documents: { type: 'array', description: 'Lijst van benodigde documenten', required: true },
        deadline: { type: 'string', description: 'Deadline (ISO date)' },
        urgent: { type: 'boolean', description: 'Is urgent?' },
      },
      required: ['application_id', 'candidate_email', 'documents'],
    },
    requires_approval: false,
  },

  create_calendar_event: {
    name: 'create_calendar_event',
    description: 'Maak een kalenderafspraak aan voor een interview of meeting.',
    category: 'action',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Titel van de afspraak', required: true },
        start_time: { type: 'string', description: 'Start tijd (ISO datetime)', required: true },
        end_time: { type: 'string', description: 'Eind tijd (ISO datetime)', required: true },
        attendees: { type: 'array', description: 'Email adressen van deelnemers', required: true },
        location: { type: 'string', description: 'Locatie of video link' },
        description: { type: 'string', description: 'Beschrijving' },
      },
      required: ['title', 'start_time', 'end_time', 'attendees'],
    },
    requires_approval: false,
  },

  update_pipeline_stage: {
    name: 'update_pipeline_stage',
    description: 'Verplaats een sollicitatie naar een andere pipeline fase. Valideert compliance gates.',
    category: 'action',
    parameters: {
      type: 'object',
      properties: {
        application_id: { type: 'string', description: 'Sollicitatie ID', required: true },
        new_stage: { type: 'string', description: 'Nieuwe pipeline fase', required: true },
        reason: { type: 'string', description: 'Reden voor de overgang' },
      },
      required: ['application_id', 'new_stage'],
    },
    requires_approval: false,
  },

  create_task: {
    name: 'create_task',
    description: 'Maak een nieuwe taak aan voor opvolging.',
    category: 'action',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Taak titel', required: true },
        description: { type: 'string', description: 'Taak beschrijving' },
        due_date: { type: 'string', description: 'Deadline (ISO date)' },
        priority: { type: 'string', description: 'Prioriteit: low, medium, high, urgent' },
        assignee_id: { type: 'string', description: 'User ID van assignee' },
        related_application_id: { type: 'string', description: 'Gerelateerde sollicitatie' },
      },
      required: ['title'],
    },
    requires_approval: false,
  },

  reject_application: {
    name: 'reject_application',
    description: 'Wijs een sollicitatie af. VEREIST MENSELIJKE GOEDKEURING.',
    category: 'action',
    parameters: {
      type: 'object',
      properties: {
        application_id: { type: 'string', description: 'Sollicitatie ID', required: true },
        rejection_reason: { type: 'string', description: 'Reden voor afwijzing', required: true },
        send_email: { type: 'boolean', description: 'Stuur afwijzingsmail?' },
      },
      required: ['application_id', 'rejection_reason'],
    },
    requires_approval: true,
  },

  delete_professional: {
    name: 'delete_professional',
    description: 'Verwijder een professional uit het systeem. VEREIST MENSELIJKE GOEDKEURING.',
    category: 'action',
    parameters: {
      type: 'object',
      properties: {
        professional_id: { type: 'string', description: 'Professional ID', required: true },
        reason: { type: 'string', description: 'Reden voor verwijdering', required: true },
      },
      required: ['professional_id', 'reason'],
    },
    requires_approval: true,
  },

  // ═══════════════════════════════════════════════════════════════════
  // KNOWLEDGE TOOLS
  // ═══════════════════════════════════════════════════════════════════

  search_knowledge: {
    name: 'search_knowledge',
    description: 'Doorzoek de AI kennisbank semantisch. Vindt relevante informatie over tarieven, beleid, procedures, of klant-specifieke data.',
    category: 'knowledge',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Zoekquery in natuurlijke taal', required: true },
        category: { type: 'string', description: 'Filter op categorie' },
        client_id: { type: 'string', description: 'Filter op specifieke klant' },
        limit: { type: 'number', description: 'Maximum aantal resultaten (default: 10)' },
      },
      required: ['query'],
    },
    requires_approval: false,
  },

  save_knowledge: {
    name: 'save_knowledge',
    description: 'Sla nieuwe kennis op in de AI kennisbank. Wordt gevalideerd en geëmbed.',
    category: 'knowledge',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Kenniscategorie', required: true },
        key: { type: 'string', description: 'Unieke sleutel voor de kennis', required: true },
        value: { type: 'object', description: 'Kenniswaarde als JSON object', required: true },
        source: { type: 'string', description: 'Bron van de kennis' },
        confidence_score: { type: 'number', description: 'Betrouwbaarheidsscore (0-1)' },
      },
      required: ['category', 'key', 'value'],
    },
    requires_approval: false,
  },

  log_learning_event: {
    name: 'log_learning_event',
    description: 'Log een learning event voor analyse en self-improvement.',
    category: 'knowledge',
    parameters: {
      type: 'object',
      properties: {
        event_type: { type: 'string', description: 'Type event: chat_interaction, pipeline_transition, feedback', required: true },
        context: { type: 'object', description: 'Event context data', required: true },
        outcome: { type: 'string', description: 'Resultaat: success, failure, partial' },
      },
      required: ['event_type', 'context'],
    },
    requires_approval: false,
  },

  // ═══════════════════════════════════════════════════════════════════
  // SEARCH & MATCHING TOOLS
  // ═══════════════════════════════════════════════════════════════════

  calculate_match_score: {
    name: 'calculate_match_score',
    description: 'Bereken de match score tussen een professional/kandidaat en een werklocatie of vacature.',
    category: 'search',
    parameters: {
      type: 'object',
      properties: {
        professional_id: { type: 'string', description: 'Professional of sollicitatie ID' },
        sublocation_id: { type: 'string', description: 'Werklocatie ID' },
        vacancy_id: { type: 'string', description: 'Vacature ID' },
      },
      required: [],
    },
    requires_approval: false,
  },

  find_matches: {
    name: 'find_matches',
    description: 'Vind de beste matches voor een kandidaat of werklocatie.',
    category: 'search',
    parameters: {
      type: 'object',
      properties: {
        application_id: { type: 'string', description: 'Sollicitatie ID om matches voor te vinden' },
        sublocation_id: { type: 'string', description: 'Werklocatie ID om kandidaten voor te vinden' },
        min_score: { type: 'number', description: 'Minimum match score (0-100)' },
        limit: { type: 'number', description: 'Maximum aantal matches' },
      },
      required: [],
    },
    requires_approval: false,
  },

  // ═══════════════════════════════════════════════════════════════════
  // ORCHESTRATION TOOLS
  // ═══════════════════════════════════════════════════════════════════

  create_agent_goal: {
    name: 'create_agent_goal',
    description: 'Creëer een nieuwe agent goal voor async verwerking via de legacy orchestrator.',
    category: 'orchestration',
    parameters: {
      type: 'object',
      properties: {
        goal_type: { type: 'string', description: 'Type goal', required: true },
        goal_description: { type: 'string', description: 'Beschrijving van het doel', required: true },
        input_data: { type: 'object', description: 'Input data voor de goal', required: true },
        priority: { type: 'number', description: 'Prioriteit (1-10)' },
        deadline: { type: 'string', description: 'Deadline (ISO datetime)' },
      },
      required: ['goal_type', 'goal_description', 'input_data'],
    },
    requires_approval: false,
  },

  request_human_approval: {
    name: 'request_human_approval',
    description: 'Vraag menselijke goedkeuring voor een kritieke actie. Pauzeert de agent tot goedkeuring.',
    category: 'orchestration',
    parameters: {
      type: 'object',
      properties: {
        action_type: { type: 'string', description: 'Type actie waarvoor goedkeuring nodig is', required: true },
        reason: { type: 'string', description: 'Reden waarom goedkeuring nodig is', required: true },
        input_data: { type: 'object', description: 'Data van de geplande actie', required: true },
        risk_level: { type: 'string', description: 'Risico niveau: low, medium, high, critical' },
      },
      required: ['action_type', 'reason', 'input_data'],
    },
    requires_approval: false,
  },

  // ═══════════════════════════════════════════════════════════════════
  // SPECIALIST TOOLS (Master Prompt ondersteuning)
  // ═══════════════════════════════════════════════════════════════════

  check_recruiter_availability: {
    name: 'check_recruiter_availability',
    description: 'Check beschikbare interview slots in de agenda voor de komende 7 dagen. Geeft 3-6 opties terug (ma-vr 09:00-17:00).',
    category: 'action',
    parameters: {
      type: 'object',
      properties: {
        recruiter_id: { type: 'string', description: 'Recruiter user ID (optioneel, default = owner)' },
        date_range_days: { type: 'number', description: 'Aantal dagen vooruit te kijken (default: 7)' },
        slot_duration_minutes: { type: 'number', description: 'Gewenste duur per slot (default: 30)' },
      },
      required: [],
    },
    requires_approval: false,
  },

  record_interview_feedback: {
    name: 'record_interview_feedback',
    description: 'Registreer interview feedback van een medewerker. Wijzigt automatisch pipeline status naar screening of afgewezen.',
    category: 'action',
    parameters: {
      type: 'object',
      properties: {
        application_id: { type: 'string', description: 'Sollicitatie ID', required: true },
        outcome: { type: 'string', description: 'Uitkomst: positive, negative, on_hold', required: true },
        notes: { type: 'string', description: 'Feedback notities' },
        interviewer_name: { type: 'string', description: 'Naam van interviewer' },
      },
      required: ['application_id', 'outcome'],
    },
    requires_approval: false,
  },

  trigger_document_verification: {
    name: 'trigger_document_verification',
    description: 'Start verificatie voor een specifiek document (Diploma via DUO, VOG via GAAV).',
    category: 'action',
    parameters: {
      type: 'object',
      properties: {
        application_id: { type: 'string', description: 'Sollicitatie ID', required: true },
        document_type: { type: 'string', description: 'Type: diploma, vog', required: true },
        document_path: { type: 'string', description: 'Pad naar document in storage (optioneel)' },
      },
      required: ['application_id', 'document_type'],
    },
    requires_approval: false,
  },
};

/**
 * Get tools by category
 */
export function getToolsByCategory(category: ToolDefinition['category']): ToolDefinition[] {
  return Object.values(TOOL_REGISTRY).filter(tool => tool.category === category);
}

/**
 * Get all tool names
 */
export function getAllToolNames(): string[] {
  return Object.keys(TOOL_REGISTRY);
}

/**
 * Get tool definitions for AI prompt
 */
export function getToolDefinitionsForPrompt(): string {
  return Object.values(TOOL_REGISTRY)
    .map(tool => {
      const params = Object.entries(tool.parameters.properties)
        .map(([name, prop]) => {
          const req = tool.parameters.required.includes(name) ? ' (required)' : '';
          return `    - ${name}${req}: ${prop.description}`;
        })
        .join('\n');
      
      const approval = tool.requires_approval ? ' ⚠️ VEREIST MENSELIJKE GOEDKEURING' : '';
      
      return `${tool.name}${approval}
  Description: ${tool.description}
  Category: ${tool.category}
  Parameters:
${params}`;
    })
    .join('\n\n');
}

/**
 * Check if a tool requires human approval
 */
export function toolRequiresApproval(toolName: string): boolean {
  return TOOL_REGISTRY[toolName]?.requires_approval ?? false;
}

/**
 * Validate tool parameters against schema
 */
export function validateToolParameters(
  toolName: string, 
  params: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const tool = TOOL_REGISTRY[toolName];
  if (!tool) {
    return { valid: false, errors: [`Unknown tool: ${toolName}`] };
  }

  const errors: string[] = [];
  
  // Check required parameters
  for (const required of tool.parameters.required) {
    if (params[required] === undefined || params[required] === null) {
      errors.push(`Missing required parameter: ${required}`);
    }
  }

  // Check parameter types (basic validation)
  for (const [name, value] of Object.entries(params)) {
    const propDef = tool.parameters.properties[name];
    if (!propDef) continue; // Allow extra parameters
    
    if (propDef.type === 'string' && typeof value !== 'string') {
      errors.push(`Parameter ${name} should be a string`);
    }
    if (propDef.type === 'number' && typeof value !== 'number') {
      errors.push(`Parameter ${name} should be a number`);
    }
    if (propDef.type === 'boolean' && typeof value !== 'boolean') {
      errors.push(`Parameter ${name} should be a boolean`);
    }
    if (propDef.type === 'array' && !Array.isArray(value)) {
      errors.push(`Parameter ${name} should be an array`);
    }
    if (propDef.type === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) {
      errors.push(`Parameter ${name} should be an object`);
    }
  }

  return { valid: errors.length === 0, errors };
}
