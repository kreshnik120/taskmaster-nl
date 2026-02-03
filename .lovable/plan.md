
# Fase 17: Dashboard Agent Context Completering

## Executive Summary

Na grondige audit blijkt dat **5 van de 6 dashboard tabs** geen correcte AI Agent context hebben. De visuele functionaliteit werkt, maar de Agent Router kan niet de juiste specialist-agents aanroepen per tab. Dit plan voegt de ontbrekende configuraties toe.

---

## Audit Resultaten

### Huidige Status

| Tab | URL | Agent Mapping | Status |
|-----|-----|--------------|--------|
| Mijn Werk | `?tab=mijn-werk` → `/` | DEFAULT (learn_agent) | ❌ Incorrect |
| Kalender | `?tab=kalender` → `/kalender` | schedule_agent | ✅ Correct |
| Lijst | `?tab=lijst` → `/lijst` | DEFAULT (learn_agent) | ❌ Ontbreekt |
| Opvolging | `?tab=opvolging` → `/opvolging` | DEFAULT (learn_agent) | ❌ Ontbreekt |
| Team | `?tab=team` | DEFAULT (learn_agent) | ❌ Niet gemapped |
| Recruitment | `?tab=recruitment` | DEFAULT (learn_agent) | ❌ Niet gemapped |

---

## Implementatieplan

### Deel 1: Uitbreiden tabMapping (agentIntents.ts)

**Locatie:** `src/lib/agentIntents.ts` regel 308-315

**Huidige code:**
```typescript
const tabMapping: Record<string, string> = {
  'lijst': '/lijst',
  'kalender': '/kalender',
  'opvolging': '/opvolging',
  'mijn-werk': '/',
};
```

**Nieuwe code:**
```typescript
const tabMapping: Record<string, string> = {
  'mijn-werk': '/mijn-werk',
  'kalender': '/kalender',
  'lijst': '/lijst',
  'opvolging': '/opvolging',
  'team': '/team',
  'recruitment': '/recruitment',
};
```

---

### Deel 2: Toevoegen PAGE_AGENT_CONFIG entries

**Locatie:** `src/lib/agentIntents.ts` na regel 286

**Toe te voegen configuraties:**

```typescript
// Dashboard Tab: Mijn Werk (Personal Focus)
"/mijn-werk": {
  primaryAgent: "task_agent",
  intents: [
    ALL_INTENTS.create_task,
    ALL_INTENTS.update_task,
    ALL_INTENTS.prioritize,
    ALL_INTENTS.schedule_meeting,
  ],
  contextFields: ["user_id", "selected_task_id"],
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
```

---

## Samenvatting Wijzigingen

| Bestand | Type Wijziging | Details |
|---------|---------------|---------|
| `src/lib/agentIntents.ts` | Update tabMapping | +2 tabs (team, recruitment), fix mijn-werk path |
| `src/lib/agentIntents.ts` | Add PAGE_AGENT_CONFIG | +5 nieuwe entries (mijn-werk, lijst, opvolging, team, recruitment) |

**Totaal: 1 bestand, ~50 regels nieuwe code**

---

## Agent Toewijzingen per Tab (Na Fix)

| Tab | Primary Agent | Beschikbare Intents |
|-----|--------------|---------------------|
| **Mijn Werk** | task_agent | create_task, update_task, prioritize, schedule_meeting |
| **Kalender** | schedule_agent | schedule_meeting, reschedule, send_reminder, send_email |
| **Lijst** | task_agent | create_task, update_task, prioritize, assign_task |
| **Opvolging** | task_agent | prioritize, create_task, send_email, schedule_meeting |
| **Team** | report_agent | generate_report, assign_task, create_task, send_email |
| **Recruitment** | candidate_agent | screen_candidate, schedule_interview, request_documents, generate_report |

---

## Verwacht Resultaat

Na implementatie:

1. **ChatWidget** detecteert automatisch de juiste agent per dashboard tab
2. **Quick Actions** in de chat tonen relevante acties per tab context
3. **Intent Detection** werkt correct voor tab-specifieke keywords
4. **Agent Router Proxy** stuurt requests naar de juiste specialist-agents

---

## Visueel Diagram

```text
┌──────────────────────────────────────────────────────────────┐
│  UNIFIED DASHBOARD - AGENT CONTEXT MAPPING                   │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  [Mijn Werk] [Kalender] [Lijst] [Opvolging] [Team] [Rec]│ │
│  │       ↓          ↓         ↓         ↓         ↓     ↓  │ │
│  │   task_agent schedule  task_agent task_agent report cand│ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  URL: /dashboard?tab=lijst                                   │
│                    ↓                                         │
│  getEffectivePath() → "/lijst"                               │
│                    ↓                                         │
│  PAGE_AGENT_CONFIG["/lijst"] → task_agent                    │
│                    ↓                                         │
│  ChatWidget shows: [+ Taak] [Prioriteren] [Toewijzen]        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Acceptatiecriteria

1. Alle 6 dashboard tabs hebben een dedicated PAGE_AGENT_CONFIG entry
2. tabMapping bevat alle 6 tab values
3. ChatWidget toont correcte quick actions per tab
4. useAgentRouter.primaryAgent retourneert juiste agent per tab
5. Intent detection werkt voor tab-specifieke keywords
6. Geen regressie in bestaande pagina-configuraties

---

## Technische Notities

### Waarom /mijn-werk in plaats van /?

Het oorspronkelijke mapping `'mijn-werk': '/'` is problematisch omdat:
- `/` wordt gebruikt als redirect naar `/dashboard?tab=mijn-werk`
- Een lege root config zou conflicteren met andere routes
- Expliciete `/mijn-werk` path is duidelijker en voorkomt edge cases

### Context Fields per Tab

De `contextFields` zijn voorbereid voor toekomstige agent integratie:
- **mijn-werk**: user_id voor persoonlijke taken
- **lijst**: filters voor bulk operations
- **opvolging**: AI score thresholds
- **team**: team member filtering
- **recruitment**: pipeline stage filtering
