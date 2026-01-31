
# VPS Agent Router Integratie Plan

## Architectuur Overzicht

De integratie verbindt de Lovable frontend met jullie VPS Agent Router (`srv1304497.hstgr.cloud:3002`) en maakt het mogelijk om:
1. AI Agents aan te roepen vanuit elke pagina
2. Taken daadwerkelijk uit te voeren (niet alleen chat)
3. Het systeem te laten leren van feedback

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LOVABLE FRONTEND                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────────────────────────┐  │
│  │ ChatWidget  │   │ AgentActionUI │   │ Page-Specific Agent Triggers    │  │
│  │ (existing)  │   │ (new)         │   │ (QuickActions per route)        │  │
│  └──────┬──────┘   └───────┬───────┘   └─────────────┬───────────────────┘  │
│         │                  │                         │                       │
│         └──────────────────┴─────────────────────────┘                       │
│                              │                                               │
│                    ┌─────────▼─────────┐                                     │
│                    │ useAgentRouter()  │  ← New hook for VPS communication  │
│                    │ Intent Detection  │                                     │
│                    │ Context Enrichment│                                     │
│                    └─────────┬─────────┘                                     │
└──────────────────────────────┼───────────────────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │  agent-router-proxy │  ← New Edge Function
                    │  (Supabase)          │
                    └──────────┬──────────┘
                               │ HTTPS POST
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     VPS AGENT ROUTER                                          │
│                 srv1304497.hstgr.cloud:3002                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐    │
│   │                     INTENT CLASSIFIER                                │    │
│   │                     (12 Intents)                                     │    │
│   └─────────────────────────────────────────────────────────────────────┘    │
│                              │                                               │
│   ┌──────────────────────────▼──────────────────────────────────────────┐   │
│   │                        AGENT DISPATCHER                              │   │
│   └──────────────────────────┬──────────────────────────────────────────┘   │
│                              │                                               │
│   ┌──────┬──────┬──────┬─────┴────┬──────┬──────┬──────┬──────┐             │
│   │Task  │Sched │Email │Candidate │Search│Report│Match │Learn │             │
│   │Agent │Agent │Agent │Agent     │Agent │Agent │Agent │Agent │             │
│   └──────┴──────┴──────┴──────────┴──────┴──────┴──────┴──────┘             │
│                                                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐    │
│   │                     LEARNING ENGINE                                  │    │
│   │  ↔ Feedback Collection  ↔ Pattern Recognition  ↔ Model Updates     │    │
│   └─────────────────────────────────────────────────────────────────────┘    │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Fase 1: Edge Function Proxy (Backend)

Creëer een nieuwe Edge Function die als secure proxy fungeert naar de VPS.

**Bestand:** `supabase/functions/agent-router-proxy/index.ts`

**Features:**
- Authenticatie via JWT (alleen ingelogde gebruikers)
- API key voor VPS communicatie (via Supabase secret)
- Timeout handling (30s)
- Structured logging
- Error normalization

**Endpoint structuur:**
```typescript
POST /functions/v1/agent-router-proxy
{
  "intent": "create_task" | "schedule_meeting" | "send_email" | ...,
  "payload": { ... context-specific data ... },
  "page_context": "/sollicitaties" | "/kanban" | ...
}
```

**Response:**
```typescript
{
  "success": true,
  "agent": "task_agent",
  "action_taken": "task_created",
  "result": { ... },
  "suggestions": ["...", "..."],  // Follow-up suggesties
  "learn_id": "uuid"  // Voor feedback loop
}
```

---

## Fase 2: Frontend Hook (useAgentRouter)

**Bestand:** `src/hooks/useAgentRouter.ts`

Een React hook die:
- Intent detectie doet op basis van user input
- Page context meestuurt
- Streaming responses ondersteunt
- Loading/error states managed
- Feedback submission afhandelt

**API:**
```typescript
const {
  executeIntent,      // Voer een intent uit
  detectIntent,       // Detecteer intent uit tekst
  submitFeedback,     // Stuur feedback naar Learning Engine
  isExecuting,        // Loading state
  lastResult,         // Laatste resultaat
  availableIntents,   // Intents voor huidige pagina
} = useAgentRouter();
```

---

## Fase 3: Enhanced ChatWidget

**Bestand:** `src/components/AIAssistant/ChatWidget.tsx` (modificatie)

Uitbreidingen:
1. **Agent Mode Toggle** - Schakel tussen "Chat" en "Agent" modus
2. **Intent Suggestions** - Toon beschikbare acties per pagina
3. **Action Preview** - Toon wat de agent gaat doen voordat het gebeurt
4. **Execution Feedback** - Real-time status updates
5. **Learning Integration** - Thumbs up/down voor agent resultaten

```text
┌────────────────────────────────────────┐
│  🤖 ABCzorg Agent          [Chat|Agent]│
├────────────────────────────────────────┤
│                                        │
│  💬 Wat wil je doen?                   │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ Quick Actions (page-specific)    │  │
│  │ ┌────────┐ ┌────────┐ ┌────────┐ │  │
│  │ │📋 Taak │ │📅 Plan │ │✉️ Email│ │  │
│  │ └────────┘ └────────┘ └────────┘ │  │
│  └──────────────────────────────────┘  │
│                                        │
│  [___________________________] [Send]  │
│                                        │
├────────────────────────────────────────┤
│  ⚡ Agent executing: task_agent        │
│  ████████░░░░░░ 60%                    │
│  Creating task "Follow-up Jan"...      │
└────────────────────────────────────────┘
```

---

## Fase 4: Page-Specific Agent Triggers

Elke pagina krijgt geoptimaliseerde agent-acties.

**Mapping:**

| Route | Primaire Intents | Agent |
|-------|-----------------|-------|
| `/sollicitaties` | screen_candidate, request_documents, schedule_interview | Candidate Agent |
| `/kanban` | create_task, update_task, prioritize, assign | Task Agent |
| `/klanten` | search_locations, match_professional, create_vacancy | Match Agent |
| `/professionals` | search_skills, check_availability, send_update | Search Agent |
| `/plaatsingen` | extend_placement, end_placement, create_evaluation | Placement Agent |
| `/kalender` | schedule_meeting, reschedule, send_reminder | Schedule Agent |
| `/whatsapp` | reply_message, create_task_from_chat, lookup_candidate | WhatsApp Agent |

---

## Fase 5: Learning Engine Integration

**Feedback Loop:**
```text
User Action → Agent Execution → Result Display → User Feedback
                                                      │
                    ┌─────────────────────────────────┘
                    ▼
            Learning Engine (VPS)
                    │
                    ├─ Pattern Recognition
                    ├─ Success Rate Tracking
                    └─ Model Fine-tuning
```

**Feedback Types:**
1. **Implicit**: Task completion, time-to-action, follow-up required
2. **Explicit**: Thumbs up/down, correction, "not what I meant"
3. **Contextual**: Page dwell time, action sequence

**Database:**
- Nieuwe tabel `agent_feedback` voor structured feedback
- Koppeling met `ai_knowledge_base` voor learning

---

## Bestanden om te Creëren/Wijzigen

### Nieuwe bestanden:
1. `supabase/functions/agent-router-proxy/index.ts` - Edge function proxy
2. `src/hooks/useAgentRouter.ts` - Frontend hook
3. `src/components/AIAssistant/AgentModePanel.tsx` - Agent UI component
4. `src/lib/agentIntents.ts` - Intent definitions en page mappings

### Te wijzigen:
1. `src/components/AIAssistant/ChatWidget.tsx` - Integreer agent mode
2. `src/components/AIAssistant/AgentActionCard.tsx` - Uitbreiden voor VPS agents
3. `supabase/config.toml` - Nieuwe function registreren

### Database:
- Nieuwe tabel: `agent_feedback`
- Nieuwe tabel: `agent_executions` (execution logging)

---

## VPS API Contract

De VPS Agent Router moet de volgende endpoints ondersteunen:

```typescript
// Intent Execution
POST /api/v1/execute
{
  "intent": "create_task",
  "payload": { ... },
  "context": {
    "user_id": "uuid",
    "org_id": "uuid",
    "page": "/kanban",
    "session_id": "uuid"
  }
}

// Response
{
  "success": true,
  "agent": "task_agent",
  "execution_id": "uuid",
  "result": { ... },
  "next_actions": [
    { "label": "Add subtask", "intent": "add_subtask", "prefill": {...} }
  ]
}

// Feedback Submission
POST /api/v1/feedback
{
  "execution_id": "uuid",
  "rating": "positive" | "negative" | "correction",
  "correction_data": { ... }  // Optional
}
```

---

## Veiligheid

1. **API Key Rotatie**: VPS API key als Supabase secret
2. **JWT Validatie**: Alleen geauthenticeerde requests
3. **Rate Limiting**: Max 10 agent calls per minuut per user
4. **Input Sanitization**: Alle payloads valideren
5. **Audit Logging**: Elke agent-actie loggen

---

## Implementatie Volgorde

1. **Week 1**: Edge Function proxy + basis hook
2. **Week 2**: ChatWidget agent mode + page mappings
3. **Week 3**: Learning feedback integration
4. **Week 4**: Testing, optimalisatie, documentatie

---

## Volgende Stap

Start met het creëren van de `agent-router-proxy` Edge Function en de `useAgentRouter` hook als fundament voor de integratie.
