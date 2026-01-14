# AI Agent Goal Types - Enterprise Documentatie

> **Versie:** 3.0.0-enterprise  
> **Laatst bijgewerkt:** 2026-01-14  
> **Eigenaar:** AI Systems Team ABCzorg/CitoZorg

Dit document definieert alle AI Agent goal types die binnen het recruitment systeem worden gebruikt. Het dient als referentie voor ontwikkelaars en als configuratiegids voor het AI Agent Orchestrator systeem.

---

## Inhoudsopgave

1. [Architectuur Overzicht](#1-architectuur-overzicht)
2. [Goal Lifecycle](#2-goal-lifecycle)
3. [Goal Type Definities](#3-goal-type-definities)
4. [Action Types](#4-action-types)
5. [Prioriteit & Scheduling](#5-prioriteit--scheduling)
6. [Error Handling](#6-error-handling)
7. [Monitoring & Metrics](#7-monitoring--metrics)

---

## 1. Architectuur Overzicht

### 1.1 Systeemcomponenten

```mermaid
graph TB
    A[System Events] --> B[Master Scheduler]
    B --> C[AI Agent Orchestrator]
    C --> D[Goal Planning]
    D --> E[Action Queue]
    E --> F[Action Execution]
    F --> G[Edge Functions]
    G --> H[External Services]
    
    subgraph "Database"
        I[agent_goals]
        J[agent_actions]
        K[agent_task_queue]
    end
    
    C --> I
    D --> J
    E --> K
```

### 1.2 Execution Flow

1. **Event Trigger**: System event of handmatige trigger
2. **Goal Creation**: Nieuw doel in `agent_goals` tabel
3. **Planning Phase**: AI genereert action plan
4. **Queue Population**: Actions naar `agent_task_queue`
5. **Execution**: Orchestrator voert actions uit
6. **Completion**: Goal status update naar `completed`

### 1.3 Pipeline Flow (v3.0)

```mermaid
graph LR
    A[nieuw] --> B[intake_verstuurd]
    B --> C[docs_compleet]
    C --> D[gesprek_gepland]
    D --> E[screening]
    E --> F[goedgekeurd]
    F --> G[geplaatst]
    
    style C fill:#10b981
    style D fill:#8b5cf6
    style E fill:#f59e0b
```

**Kritieke transities:**
- `docs_compleet → gesprek_gepland`: **HANDMATIG** (recruiter vult gesprek_datum in)
- `gesprek_gepland → screening`: **HANDMATIG** (recruiter geeft positieve feedback)

---

## 2. Goal Lifecycle

### 2.1 Goal Statuses

| Status | Beschrijving | Volgende Status |
|--------|--------------|-----------------|
| `pending` | Nieuw aangemaakt, wacht op planning | `planning` |
| `planning` | AI genereert action plan | `executing` |
| `executing` | Actions worden uitgevoerd | `completed` / `failed` |
| `completed` | Succesvol afgerond | - |
| `failed` | Gefaald na max retries | - |
| `cancelled` | Handmatig geannuleerd | - |

### 2.2 Status Transitions

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> planning
    planning --> executing
    executing --> completed
    executing --> failed
    pending --> cancelled
    planning --> cancelled
    executing --> cancelled
    completed --> [*]
    failed --> [*]
    cancelled --> [*]
```

---

## 3. Goal Type Definities

### 3.1 Application Intake Goals

#### `send_welcome_and_intake`

**Doel**: Verstuur welkomstmail en intake vragen naar nieuwe kandidaat.

| Eigenschap | Waarde |
|------------|--------|
| **Trigger** | Nieuwe applicatie aangemaakt |
| **Prioriteit** | 10 (hoogste) |
| **Input Data** | `{ application_id, email, naam }` |
| **Output Actions** | `send_welcome_email`, `send_intake_questions` |
| **Pipeline Update** | `nieuw → intake_verstuurd` |
| **Success Criteria** | Email succesvol verzonden |

```typescript
// Voorbeeld input_data
{
  "application_id": "uuid",
  "candidate_email": "email@example.com",
  "candidate_name": "Jan de Vries",
  "org_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

#### `application_intake_completion`

**Doel**: Verzamel ontbrekende informatie van kandidaat.

| Eigenschap | Waarde |
|------------|--------|
| **Trigger** | Missing info > 0 na initiële intake |
| **Prioriteit** | 8 |
| **Input Data** | `{ application_id, missing_info[], attempt_count }` |
| **Output Actions** | `send_followup_question` |
| **Max Attempts** | 5 |
| **Cooldown** | 24 uur tussen attempts |

```typescript
// Voorbeeld input_data
{
  "application_id": "uuid",
  "missing_info": ["telefoonnummer", "regio", "beschikbaarheid"],
  "attempt_count": 1,
  "previous_attempts": []
}
```

---

#### `send_reply_response`

**Doel**: Verwerk kandidaat email reply en genereer intelligent antwoord.

| Eigenschap | Waarde |
|------------|--------|
| **Trigger** | Inkomende email via Resend webhook |
| **Prioriteit** | 9 |
| **Input Data** | `{ application_id, email_content, response_type }` |
| **Output Actions** | `analyze_reply`, `update_application`, `send_response` |
| **Pipeline Update** | `intake_verstuurd → docs_compleet` (indien CV + diploma + 70%) |
| **Response Types** | `acceptance`, `rejection`, `question`, `info_provided` |

---

### 3.2 Document Verification Goals

#### `verify_diploma`

**Doel**: Verifieer diploma via EMREX/DUO.

| Eigenschap | Waarde |
|------------|--------|
| **Trigger** | Diploma document geüpload |
| **Prioriteit** | 7 |
| **Input Data** | `{ application_id, document_path, claimed_niveau }` |
| **Output Actions** | `emrex_verification`, `update_verification_status` |
| **Pipeline Impact** | Vereist voor `docs_compleet` stage |

---

#### `request_vog`

**Doel**: Vraag VOG aan bij kandidaat (alleen bij screening stage).

| Eigenschap | Waarde |
|------------|--------|
| **Trigger** | Transitie naar `screening` stage (na positieve gesprek feedback) |
| **Prioriteit** | 9 |
| **Input Data** | `{ application_id, candidate_email, candidate_name }` |
| **Output Actions** | `send_vog_request_email` |
| **Timing** | ⚠️ ALLEEN bij screening - VOG max 3 maanden oud requirement |

```typescript
// Voorbeeld input_data
{
  "application_id": "uuid",
  "candidate_email": "email@example.com",
  "candidate_name": "Jan de Vries",
  "vog_max_age_months": 3
}
```

---

#### `verify_vog`

**Doel**: Verifieer VOG document via GAAV API.

| Eigenschap | Waarde |
|------------|--------|
| **Trigger** | VOG document geüpload |
| **Prioriteit** | 7 |
| **Input Data** | `{ application_id, document_path }` |
| **Output Actions** | `gaav_api_check`, `update_verification_status` |
| **Pipeline Impact** | Vereist voor `screening → goedgekeurd` transitie |

---

### 3.3 Recruiter Notification Goals

#### `notify_candidate_ready_for_interview`

**Doel**: Notificeer recruiter dat kandidaat klaar is voor fysiek gesprek.

| Eigenschap | Waarde |
|------------|--------|
| **Trigger** | Transitie naar `docs_compleet` stage |
| **Prioriteit** | 8 |
| **Input Data** | `{ application_id, candidate_name, completeness_score }` |
| **Output Actions** | `create_recruiter_notification` |
| **Type** | `candidate_ready_for_interview` |

```typescript
// Voorbeeld notification
{
  "notification_type": "candidate_ready_for_interview",
  "title": "Jan de Vries is klaar voor een gesprek",
  "message": "Documenten compleet (CV + Diploma geverifieerd). Plan een fysiek sollicitatiegesprek.",
  "application_id": "uuid"
}
```

---

### 3.4 ~~Interview Scheduling Goals~~ (DEPRECATED)

#### ~~`schedule_interview`~~ ❌ UITGESCHAKELD

> ⚠️ **DEPRECATED sinds v3.0.0**
> 
> Fysieke gesprekken worden nu **HANDMATIG** gepland door recruiters via de UI.
> De recruiter vult `gesprek_datum` in wanneer een kandidaat in `docs_compleet` stage staat.
>
> **Reden:** Interview planning vereist menselijke coördinatie en kan niet effectief geautomatiseerd worden.

**Oude functionaliteit (voor referentie):**
- ~~Plan interview met kandidaat~~
- ~~Trigger: Completeness ≥ 85%~~
- ~~Output: send_interview_slots, create_calendar_event~~

**Vervangende flow:**
1. Kandidaat bereikt `docs_compleet`
2. `notify_candidate_ready_for_interview` goal triggert
3. Recruiter ontvangt notificatie
4. Recruiter plant gesprek **handmatig** via UI
5. Recruiter vult `gesprek_datum` in
6. Na gesprek: recruiter vult `gesprek_feedback` in

---

### 3.5 Matching Goals

#### `calculate_matches`

**Doel**: Bereken matches tussen kandidaat en client sublocations.

| Eigenschap | Waarde |
|------------|--------|
| **Trigger** | Completeness ≥ 50% of profile update |
| **Prioriteit** | 6 |
| **Input Data** | `{ application_id, functie_niveau, regio, werkvorm }` |
| **Output Actions** | `calculate_sublocation_scores`, `store_matches` |

---

### 3.6 Professional Creation Goals

#### `professional_document_collection`

**Doel**: Verzamel ontbrekende documenten voor nieuwe professional.

| Eigenschap | Waarde |
|------------|--------|
| **Trigger** | Professional aangemaakt met `beschikbaar_pending_documents` status |
| **Prioriteit** | 8 |
| **Input Data** | `{ professional_id, application_id, missing_docs[] }` |
| **Output Actions** | `send_document_request` |
| **Success Criteria** | Alle documenten ontvangen en geverifieerd |

```typescript
// Voorbeeld input_data
{
  "professional_id": "uuid",
  "application_id": "uuid",
  "missing_docs": ["vog"], // VOG wordt hier opnieuw gevraagd indien verlopen
  "professional_email": "email@example.com"
}
```

---

## 4. Action Types

### 4.1 Email Actions

| Action Type | Beschrijving | Edge Function |
|-------------|--------------|---------------|
| `send_welcome_email` | Welkomstmail | `send-ai-email` |
| `send_followup_question` | Follow-up vragen | `generate-followup-email` → `send-ai-email` |
| `send_vog_request_email` | VOG aanvraag | `send-ai-email` |
| `send_document_request` | Document verzoek | `send-ai-email` |
| `send_reminder` | Herinnering | `send-reminder-email` |
| `send_general_email` | Algemene email | `send-ai-email` |

### 4.2 ~~Calendar Actions~~ (DEPRECATED)

> ⚠️ Automatische calendar acties zijn uitgeschakeld. Gesprekken worden handmatig gepland.

~~| Action Type | Beschrijving | Integration |~~
~~|-------------|--------------|-------------|~~
~~| `create_calendar_event` | Calendar event aanmaken | n8n → Microsoft Outlook |~~

### 4.3 Data Actions

| Action Type | Beschrijving | Edge Function |
|-------------|--------------|---------------|
| `update_application` | Application data bijwerken | Direct database |
| `calculate_matches` | Match scores berekenen | `calculate-application-matches` |
| `create_professional` | Professional record aanmaken | `create-professional-from-application` |

### 4.4 Verification Actions

| Action Type | Beschrijving | Edge Function |
|-------------|--------------|---------------|
| `verify_vog_gaav` | VOG verificatie | `verify-vog-gaav` |
| `verify_diploma_emrex` | Diploma verificatie | `verify-diploma-emrex` |
| `verify_kvk` | KvK verificatie | `firecrawl-scrape` (Browserless) |

### 4.5 Notification Actions

| Action Type | Beschrijving | Target |
|-------------|--------------|--------|
| `create_recruiter_notification` | Notificatie voor recruiter | `recruiter_notifications` tabel |
| `notify_candidate_ready` | Kandidaat klaar voor gesprek | Recruiter dashboard |

---

## 5. Prioriteit & Scheduling

### 5.1 Prioriteit Levels

| Prioriteit | Bereik | Beschrijving | Voorbeelden |
|------------|--------|--------------|-------------|
| **Kritiek** | 10 | Onmiddellijke actie vereist | Welkomstmail |
| **Hoog** | 8-9 | Binnen 1 uur | VOG request bij screening, document collection |
| **Medium** | 5-7 | Binnen 4 uur | Matching, verificatie |
| **Laag** | 1-4 | Best effort | Analytics, cleanup |

### 5.2 Scheduling Regels

```typescript
const SCHEDULING_RULES = {
  // Cooldown periodes
  followup_cooldown_hours: 24,
  document_reminder_days: 3,
  
  // Max attempts
  max_followup_attempts: 5,
  max_document_request_attempts: 3,
  
  // Batch sizes
  goals_per_cycle: 10,
  actions_per_goal: 5,
  
  // ⚠️ REMOVED
  // interview_reminder_hours: N/A - interviews zijn handmatig
  // max_interview_slot_attempts: N/A - interviews zijn handmatig
};
```

### 5.3 Cron Schedule

| Component | Schedule | Beschrijving |
|-----------|----------|--------------|
| `master-scheduler` | `*/5 * * * *` | Elke 5 minuten |
| `process-system-events` | Via master-scheduler | Event processing |
| `ai-agent-orchestrator` | Via master-scheduler | Goal execution |

---

## 6. Error Handling

### 6.1 Retry Strategy

```typescript
const RETRY_CONFIG = {
  max_retries: 3,
  initial_delay_ms: 1000,
  backoff_multiplier: 2,
  max_delay_ms: 30000
};
```

### 6.2 Error Categories

| Category | Beschrijving | Actie |
|----------|--------------|-------|
| `transient` | Tijdelijke fout (netwerk, rate limit) | Retry met backoff |
| `permanent` | Onherstelbare fout | Mark as failed |
| `validation` | Input validatie fout | Log en skip |
| `external_service` | Externe service fout | Retry of fallback |

### 6.3 Circuit Breaker

Externe services hebben circuit breaker protectie:

```typescript
const CIRCUIT_BREAKER = {
  failure_threshold: 5,
  reset_timeout_ms: 60000,
  half_open_requests: 3
};
```

---

## 7. Monitoring & Metrics

### 7.1 Key Metrics

| Metric | Beschrijving | Target |
|--------|--------------|--------|
| `goal_completion_rate` | % succesvol afgeronde goals | > 95% |
| `avg_goal_duration_ms` | Gemiddelde uitvoeringstijd | < 30000 |
| `action_success_rate` | % succesvolle actions | > 98% |
| `queue_depth` | Aantal wachtende actions | < 100 |

### 7.2 Alerting Thresholds

| Alert | Conditie | Severity |
|-------|----------|----------|
| `high_failure_rate` | failure_rate > 10% in 1 uur | Critical |
| `queue_backlog` | queue_depth > 500 | Warning |
| `slow_execution` | avg_duration > 60s | Warning |
| `circuit_open` | Elke circuit breaker open | Critical |

### 7.3 Dashboard Queries

```sql
-- Actieve goals per type
SELECT goal_type, status, COUNT(*) 
FROM agent_goals 
WHERE created_at > now() - interval '24 hours'
GROUP BY goal_type, status;

-- Gemiddelde uitvoeringstijd per goal type
SELECT goal_type, 
       AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_seconds
FROM agent_goals 
WHERE status = 'completed'
GROUP BY goal_type;

-- Failed actions met error messages
SELECT action_type, error_message, COUNT(*)
FROM agent_actions
WHERE status = 'failed'
  AND created_at > now() - interval '24 hours'
GROUP BY action_type, error_message;
```

---

## Changelog

| Versie | Datum | Wijziging |
|--------|-------|-----------|
| 3.0.0-enterprise | 2026-01-14 | **MAJOR:** schedule_interview goal DEPRECATED. Handmatige interview planning. Nieuwe stages (docs_compleet, gesprek_gepland). VOG alleen bij screening. |
| 2.0.0-enterprise | 2026-01-04 | Complete enterprise documentatie |
| 1.0.0 | 2025-12-15 | Initiële versie |

---

*Dit document wordt onderhouden door het AI Systems Team en is onderdeel van de technische documentatie.*
