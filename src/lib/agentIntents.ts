/**
 * VPS Agent Router Intent Definitions
 * Maps pages to available agents and their intents
 */

export type AgentName =
  | "task_agent"
  | "schedule_agent"
  | "email_agent"
  | "candidate_agent"
  | "search_agent"
  | "report_agent"
  | "match_agent"
  | "learn_agent";

export interface IntentDefinition {
  id: string;
  label: string;
  description: string;
  icon: string;
  agent: AgentName;
  requiresPayload?: string[];
  examples?: string[];
}

export interface PageAgentConfig {
  primaryAgent: AgentName;
  intents: IntentDefinition[];
  contextFields?: string[];
}

// All available intents across the system
export const ALL_INTENTS: Record<string, IntentDefinition> = {
  // Task Agent - Core Operations
  create_task: {
    id: "create_task",
    label: "Taak aanmaken",
    description: "Maak een nieuwe taak aan",
    icon: "📋",
    agent: "task_agent",
    examples: ["Maak een taak om Jan te bellen", "Reminder voor morgen"],
  },
  update_task: {
    id: "update_task",
    label: "Taak bijwerken",
    description: "Werk een bestaande taak bij",
    icon: "✏️",
    agent: "task_agent",
    requiresPayload: ["task_id"],
  },
  prioritize: {
    id: "prioritize",
    label: "Prioriteren",
    description: "Prioriteer taken automatisch",
    icon: "🎯",
    agent: "task_agent",
  },
  assign_task: {
    id: "assign_task",
    label: "Toewijzen",
    description: "Wijs taak toe aan teamlid",
    icon: "👤",
    agent: "task_agent",
    requiresPayload: ["task_id"],
  },

  // Task Agent - Flow Operations (Mijn Werk)
  move_task: {
    id: "move_task",
    label: "Taak verplaatsen",
    description: "Verplaats een taak naar een andere kolom",
    icon: "➡️",
    agent: "task_agent",
    requiresPayload: ["task_id", "target_column"],
    examples: ["Zet deze taak op doing", "Verplaats naar review"],
  },
  bulk_move_tasks: {
    id: "bulk_move_tasks",
    label: "Taken bulk verplaatsen",
    description: "Verplaats meerdere taken tegelijk",
    icon: "📦",
    agent: "task_agent",
    requiresPayload: ["filter_criteria", "target_column"],
    examples: ["Alle urgente taken naar doing", "Verplaats mijn blocked taken"],
  },
  suggest_task_flow: {
    id: "suggest_task_flow",
    label: "Flow optimalisatie",
    description: "Krijg AI-suggesties voor taakverplaatsingen",
    icon: "💡",
    agent: "task_agent",
    examples: ["Optimaliseer mijn workflow", "Welke taken kan ik afronden?"],
  },

  // Schedule Agent
  schedule_meeting: {
    id: "schedule_meeting",
    label: "Afspraak plannen",
    description: "Plan een meeting of gesprek",
    icon: "📅",
    agent: "schedule_agent",
    examples: ["Plan een gesprek met kandidaat morgen", "Vergadering inplannen"],
  },
  reschedule: {
    id: "reschedule",
    label: "Verzetten",
    description: "Verplaats een bestaande afspraak",
    icon: "🔄",
    agent: "schedule_agent",
  },
  send_reminder: {
    id: "send_reminder",
    label: "Herinnering sturen",
    description: "Stuur een reminder voor afspraak",
    icon: "⏰",
    agent: "schedule_agent",
  },

  // Email Agent
  send_email: {
    id: "send_email",
    label: "Email sturen",
    description: "Stel een email op en verstuur",
    icon: "✉️",
    agent: "email_agent",
    examples: ["Stuur een bevestigingsmail", "Email naar klant over plaatsing"],
  },
  draft_email: {
    id: "draft_email",
    label: "Email concept",
    description: "Stel een email concept op",
    icon: "📝",
    agent: "email_agent",
  },

  // Candidate Agent
  screen_candidate: {
    id: "screen_candidate",
    label: "Kandidaat screenen",
    description: "Beoordeel een kandidaat automatisch",
    icon: "🔍",
    agent: "candidate_agent",
    requiresPayload: ["application_id"],
  },
  request_documents: {
    id: "request_documents",
    label: "Documenten opvragen",
    description: "Vraag ontbrekende documenten op",
    icon: "📄",
    agent: "candidate_agent",
  },
  schedule_interview: {
    id: "schedule_interview",
    label: "Gesprek inplannen",
    description: "Plan een sollicitatiegesprek",
    icon: "🎤",
    agent: "candidate_agent",
    requiresPayload: ["application_id"],
  },

  // Search Agent
  search_skills: {
    id: "search_skills",
    label: "Zoek op skills",
    description: "Zoek professionals op vaardigheden",
    icon: "🔎",
    agent: "search_agent",
    examples: ["Zoek verpleegkundige niveau 4", "Wie heeft BIG registratie?"],
  },
  check_availability: {
    id: "check_availability",
    label: "Beschikbaarheid",
    description: "Check beschikbaarheid professional",
    icon: "📆",
    agent: "search_agent",
  },

  // Match Agent
  match_professional: {
    id: "match_professional",
    label: "Match maken",
    description: "Match professional aan locatie",
    icon: "🔗",
    agent: "match_agent",
  },
  search_locations: {
    id: "search_locations",
    label: "Locaties zoeken",
    description: "Zoek passende locaties",
    icon: "📍",
    agent: "match_agent",
  },
  create_vacancy: {
    id: "create_vacancy",
    label: "Vacature aanmaken",
    description: "Maak een nieuwe vacature",
    icon: "📢",
    agent: "match_agent",
  },

  // Report Agent
  generate_report: {
    id: "generate_report",
    label: "Rapport genereren",
    description: "Genereer een rapport",
    icon: "📊",
    agent: "report_agent",
  },

  // WhatsApp specific
  reply_message: {
    id: "reply_message",
    label: "Beantwoorden",
    description: "Beantwoord WhatsApp bericht",
    icon: "💬",
    agent: "candidate_agent",
  },
  create_task_from_chat: {
    id: "create_task_from_chat",
    label: "Taak van chat",
    description: "Maak taak van chatbericht",
    icon: "📋",
    agent: "task_agent",
  },
  lookup_candidate: {
    id: "lookup_candidate",
    label: "Kandidaat opzoeken",
    description: "Zoek kandidaat info op",
    icon: "👤",
    agent: "search_agent",
  },

  // General
  general_query: {
    id: "general_query",
    label: "Vraag stellen",
    description: "Stel een algemene vraag",
    icon: "❓",
    agent: "learn_agent",
  },

  // Planning Agent - Smart Matching & Scheduling
  suggest_professional: {
    id: "suggest_professional",
    label: "Professional suggereren",
    description: "Zoek de best passende professional voor een dienst",
    icon: "✨",
    agent: "match_agent",
    requiresPayload: ["dienst_id"],
    examples: ["Wie past het beste bij deze dienst?", "Stel iemand voor", "Beste match"],
  },
  find_replacement: {
    id: "find_replacement",
    label: "Vervanging zoeken",
    description: "Zoek een vervangende professional",
    icon: "🔄",
    agent: "match_agent",
    requiresPayload: ["dienst_id"],
    examples: ["Zoek vervanging", "Wie kan overnemen?", "Alternatief zoeken"],
  },
  check_dienst_coverage: {
    id: "check_dienst_coverage",
    label: "Bezetting checken",
    description: "Check de bezettingsgraad van diensten",
    icon: "📊",
    agent: "report_agent",
    examples: ["Hoeveel diensten zijn onbezet?", "Bezetting deze week", "Open diensten"],
  },
  plan_week_diensten: {
    id: "plan_week_diensten",
    label: "Week plannen",
    description: "Plan diensten voor een hele week",
    icon: "📅",
    agent: "schedule_agent",
    examples: ["Plan volgende week", "Weekplanning maken", "Rooster invullen"],
  },

  // Facturatie Agent - Factuur & Betaling Management
  create_factuur: {
    id: "create_factuur",
    label: "Factuur aanmaken",
    description: "Maak een nieuwe factuur aan",
    icon: "🧾",
    agent: "report_agent",
    examples: ["Maak een factuur", "Nieuwe factuur aanmaken", "Factuur opstellen"],
  },
  check_openstaand: {
    id: "check_openstaand",
    label: "Openstaand checken",
    description: "Bekijk openstaande en vervallen facturen",
    icon: "💰",
    agent: "report_agent",
    examples: ["Welke facturen staan open?", "Vervallen facturen", "Openstaand bedrag"],
  },
  send_herinnering: {
    id: "send_herinnering",
    label: "Herinnering sturen",
    description: "Verstuur een betalingsherinnering",
    icon: "📬",
    agent: "report_agent",
    requiresPayload: ["factuur_id"],
    examples: ["Stuur een herinnering", "Betalingsherinnering versturen", "Herinnering voor factuur"],
  },
  auto_facturatie: {
    id: "auto_facturatie",
    label: "Auto-facturatie",
    description: "Genereer automatisch facturen vanuit voltooide diensten",
    icon: "⚡",
    agent: "report_agent",
    examples: ["Auto-factureren", "Genereer facturen automatisch", "Diensten factureren"],
  },

  // Professional Agent - Talent Search & Profile Management
  talent_search: {
    id: "talent_search",
    label: "Talent zoeken",
    description: "Zoek professionals met geavanceerde filters",
    icon: "🔎",
    agent: "search_agent",
    examples: ["Zoek een VP3 in Amsterdam", "Talent zoeken", "Beschikbare professionals"],
  },
  profile_completeness: {
    id: "profile_completeness",
    label: "Profiel compleetheid",
    description: "Check en verbeter profiel compleetheid",
    icon: "📋",
    agent: "search_agent",
    examples: ["Welke profielen zijn incompleet?", "Profiel verbeteren", "Ontbrekende gegevens"],
  },
  export_professionals: {
    id: "export_professionals",
    label: "Professionals exporteren",
    description: "Exporteer professionals lijst naar CSV",
    icon: "📤",
    agent: "report_agent",
    examples: ["Exporteer professionals", "CSV download", "Lijst exporteren"],
  },
};

// Page-specific agent configurations
export const PAGE_AGENT_CONFIG: Record<string, PageAgentConfig> = {
  "/sollicitaties": {
    primaryAgent: "candidate_agent",
    intents: [
      ALL_INTENTS.screen_candidate,
      ALL_INTENTS.request_documents,
      ALL_INTENTS.schedule_interview,
      ALL_INTENTS.send_email,
    ],
    contextFields: ["application_id", "candidate_name", "stage"],
  },
  "/kanban": {
    primaryAgent: "task_agent",
    intents: [
      ALL_INTENTS.create_task,
      ALL_INTENTS.update_task,
      ALL_INTENTS.prioritize,
      ALL_INTENTS.assign_task,
    ],
    contextFields: ["board_id", "selected_task_id"],
  },
  "/klanten": {
    primaryAgent: "match_agent",
    intents: [
      ALL_INTENTS.search_locations,
      ALL_INTENTS.match_professional,
      ALL_INTENTS.create_vacancy,
      ALL_INTENTS.send_email,
    ],
    contextFields: ["organization_id", "sublocation_id"],
  },
  "/professionals": {
    primaryAgent: "search_agent",
    intents: [
      ALL_INTENTS.talent_search,
      ALL_INTENTS.search_skills,
      ALL_INTENTS.check_availability,
      ALL_INTENTS.match_professional,
      ALL_INTENTS.profile_completeness,
      ALL_INTENTS.export_professionals,
      ALL_INTENTS.send_email,
    ],
    contextFields: [
      "professional_id",
      "search_query",
      "status_filter",
      "functie_niveau_filter",
    ],
  },
  "/plaatsingen": {
    primaryAgent: "match_agent",
    intents: [
      ALL_INTENTS.match_professional,
      ALL_INTENTS.send_email,
      ALL_INTENTS.create_task,
      ALL_INTENTS.schedule_meeting,
    ],
    contextFields: ["assignment_id", "professional_id", "sublocation_id"],
  },
  "/kalender": {
    primaryAgent: "schedule_agent",
    intents: [
      ALL_INTENTS.schedule_meeting,
      ALL_INTENTS.reschedule,
      ALL_INTENTS.send_reminder,
      ALL_INTENTS.send_email,
    ],
    contextFields: ["selected_date", "event_id"],
  },
  "/whatsapp": {
    primaryAgent: "candidate_agent",
    intents: [
      ALL_INTENTS.reply_message,
      ALL_INTENTS.create_task_from_chat,
      ALL_INTENTS.lookup_candidate,
      ALL_INTENTS.schedule_interview,
    ],
    contextFields: ["conversation_id", "contact_jid", "last_message"],
  },
  // Dashboard Tab: Mijn Werk (Personal Focus with Flow Operations)
  "/mijn-werk": {
    primaryAgent: "task_agent",
    intents: [
      ALL_INTENTS.create_task,
      ALL_INTENTS.update_task,
      ALL_INTENTS.prioritize,
      ALL_INTENTS.move_task,
      ALL_INTENTS.bulk_move_tasks,
      ALL_INTENTS.suggest_task_flow,
      ALL_INTENTS.schedule_meeting,
    ],
    contextFields: [
      "user_id",
      "selected_task_id",
      "active_column_id",
      "dragging_task_id",
      "visible_task_ids",
      "column_task_counts",
    ],
  },
  // Dashboard Tab: Lijst (Full Task List)
  "/lijst": {
    primaryAgent: "task_agent",
    intents: [
      ALL_INTENTS.create_task,
      ALL_INTENTS.update_task,
      ALL_INTENTS.prioritize,
      ALL_INTENTS.assign_task,
    ],
    contextFields: ["filter_status", "filter_priority", "selected_task_ids"],
  },
  // Dashboard Tab: Opvolging (AI-Powered Follow-up)
  "/opvolging": {
    primaryAgent: "task_agent",
    intents: [
      ALL_INTENTS.prioritize,
      ALL_INTENTS.create_task,
      ALL_INTENTS.send_email,
      ALL_INTENTS.schedule_meeting,
    ],
    contextFields: ["ai_score_threshold", "filter_type"],
  },
  // Dashboard Tab: Team Overview
  "/team": {
    primaryAgent: "report_agent",
    intents: [
      ALL_INTENTS.generate_report,
      ALL_INTENTS.assign_task,
      ALL_INTENTS.create_task,
      ALL_INTENTS.send_email,
    ],
    contextFields: ["team_member_id", "date_range"],
  },
  // Dashboard Tab: Recruitment KPIs
  "/recruitment": {
    primaryAgent: "candidate_agent",
    intents: [
      ALL_INTENTS.screen_candidate,
      ALL_INTENTS.schedule_interview,
      ALL_INTENTS.request_documents,
      ALL_INTENTS.generate_report,
    ],
    contextFields: ["pipeline_stage", "urgency_filter"],
  },
  "/planning": {
    primaryAgent: "match_agent",
    intents: [
      ALL_INTENTS.suggest_professional,
      ALL_INTENTS.find_replacement,
      ALL_INTENTS.check_dienst_coverage,
      ALL_INTENTS.plan_week_diensten,
      ALL_INTENTS.send_email,
    ],
    contextFields: [
      "selected_dienst_id",
      "selected_datum",
      "view_mode",
      "selected_professional_id",
    ],
  },
  "/beschikbaarheid": {
    primaryAgent: "schedule_agent",
    intents: [
      ALL_INTENTS.check_availability,
      ALL_INTENTS.suggest_professional,
      ALL_INTENTS.create_task,
      ALL_INTENTS.send_email,
    ],
    contextFields: [
      "selected_week",
      "selected_professional_id",
      "filter_functie_niveau",
    ],
  },
  "/facturatie": {
    primaryAgent: "report_agent",
    intents: [
      ALL_INTENTS.create_factuur,
      ALL_INTENTS.check_openstaand,
      ALL_INTENTS.send_herinnering,
      ALL_INTENTS.auto_facturatie,
    ],
    contextFields: [
      "factuur_id",
      "status_filter",
      "type_filter",
    ],
  },
};

// Default config for unlisted pages
export const DEFAULT_PAGE_CONFIG: PageAgentConfig = {
  primaryAgent: "learn_agent",
  intents: [
    ALL_INTENTS.general_query,
    ALL_INTENTS.create_task,
    ALL_INTENTS.send_email,
    ALL_INTENTS.schedule_meeting,
  ],
};

/**
 * Get effective path considering dashboard tabs
 * Maps /dashboard?tab=lijst to /lijst for agent context detection
 */
/**
 * Tab to path mapping for dashboard agent context
 */
const DASHBOARD_TAB_MAPPING: Record<string, string> = {
  'mijn-werk': '/mijn-werk',
  'kalender': '/kalender',
  'lijst': '/lijst',
  'opvolging': '/opvolging',
  'team': '/team',
  'recruitment': '/recruitment',
};

/**
 * Get effective path considering dashboard tabs
 * Maps /dashboard?tab=lijst to /lijst for agent context detection
 */
export function getEffectivePath(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  
  if (pathname === '/dashboard' && tab) {
    return DASHBOARD_TAB_MAPPING[tab] || pathname;
  }
  
  return pathname;
}

/**
 * Get agent configuration for a specific page
 */
export function getPageAgentConfig(pathname: string, search: string = ''): PageAgentConfig {
  const effectivePath = getEffectivePath(pathname, search);
  
  // Exact match first
  if (PAGE_AGENT_CONFIG[effectivePath]) {
    return PAGE_AGENT_CONFIG[effectivePath];
  }

  // Partial match (e.g., /sollicitaties/123)
  for (const [route, config] of Object.entries(PAGE_AGENT_CONFIG)) {
    if (effectivePath.startsWith(route)) {
      return config;
    }
  }

  return DEFAULT_PAGE_CONFIG;
}

/**
 * Detect intent from natural language input
 * Returns the best matching intent or null
 */
export function detectIntentFromText(text: string, pageConfig: PageAgentConfig): IntentDefinition | null {
  const normalizedText = text.toLowerCase().trim();

  // Check examples in page-specific intents first
  for (const intent of pageConfig.intents) {
    if (intent.examples) {
      for (const example of intent.examples) {
        if (normalizedText.includes(example.toLowerCase())) {
          return intent;
        }
      }
    }

    // Check label match
    if (normalizedText.includes(intent.label.toLowerCase())) {
      return intent;
    }
  }

  // Keyword matching
  const keywordMap: Record<string, string> = {
    taak: "create_task",
    task: "create_task",
    todo: "create_task",
    afspraak: "schedule_meeting",
    meeting: "schedule_meeting",
    plannen: "schedule_meeting",
    email: "send_email",
    mail: "send_email",
    sturen: "send_email",
    zoek: "search_skills",
    vind: "search_skills",
    match: "match_professional",
    koppel: "match_professional",
    screen: "screen_candidate",
    beoordeel: "screen_candidate",
    document: "request_documents",
    gesprek: "schedule_interview",
    interview: "schedule_interview",
    suggestie: "suggest_professional",
    voorstel: "suggest_professional",
    vervanging: "find_replacement",
    bezetting: "check_dienst_coverage",
    rooster: "plan_week_diensten",
    weekplanning: "plan_week_diensten",
    factuur: "create_factuur",
    facturen: "check_openstaand",
    openstaand: "check_openstaand",
    vervallen: "check_openstaand",
    herinnering: "send_herinnering",
    facturatie: "auto_facturatie",
    professional: "talent_search",
    talent: "talent_search",
    profiel: "profile_completeness",
    incompleet: "profile_completeness",
    exporteer: "export_professionals",
  };

  for (const [keyword, intentId] of Object.entries(keywordMap)) {
    if (normalizedText.includes(keyword)) {
      const intent = pageConfig.intents.find((i) => i.id === intentId) || ALL_INTENTS[intentId];
      if (intent) return intent;
    }
  }

  return null;
}
