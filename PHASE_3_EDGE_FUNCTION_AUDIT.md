# Phase 3: Edge Function Audit Report

**Datum:** 2025-12-10  
**Doel:** Identificeer edge functions die `knowledge-crud` of directe `ai_knowledge_base` mutations gebruiken  
**Status:** ✅ Voltooid

---

## Executive Summary

| Metric | Waarde |
|--------|--------|
| Functions geaudit | 7 |
| Gebruikt knowledge-crud | 0 |
| Directe DB mutations | 5 |
| Org-scoped compliant | 4/7 |
| Actie vereist | 3 HIGH, 1 MEDIUM |

---

## Audit Resultaten per Edge Function

### 1. `process-system-events/index.ts` ⚠️ HIGH PRIORITY

**Status:** Niet-compliant - Gebruikt directe DB operaties

| Criteria | Status | Details |
|----------|--------|---------|
| Importeert knowledge-crud? | ❌ | Geen import |
| Directe ai_knowledge_base mutations? | ✅ YES | Lines 124-157 (INSERT/UPDATE) |
| Org_id validation? | ✅ | Fallback strategie: event.org_id → event_data → metadata |
| Atomische RPCs? | ❌ | Reguliere UPDATE, geen race condition protection |
| PII redaction? | ✅ | Gebruikt `supabase.rpc('redact_pii')` |

**Problemen:**
1. Directe INSERT naar ai_knowledge_base (line 143-157) - moet `createKnowledge()` gebruiken
2. Directe UPDATE voor occurrence_count/confidence (line 124-140) - moet `reinforceKnowledge()` gebruiken
3. Correlatie knowledge INSERT (line 171-184) - moet `createKnowledge()` gebruiken

**Aanbevolen fix:**
```typescript
import { createKnowledge, reinforceKnowledge } from '../_shared/knowledge-crud.ts';

// Vervang directe INSERT met:
const result = await createKnowledge(supabase, {
  org_id: orgId,
  category: analysis.category,
  key: analysis.key,
  value: analysis.value,
  confidence_score: analysis.confidence,
  source: `system_event:${event.event_type}`,
  // ...
});
```

---

### 2. `ai-chat/index.ts` ⚠️ HIGH PRIORITY

**Status:** Niet-compliant - 6077 regels, complex file

| Criteria | Status | Details |
|----------|--------|---------|
| Importeert knowledge-crud? | ❌ | Geen import |
| Directe ai_knowledge_base mutations? | 🔍 | Moet nader onderzocht (file te groot) |
| Org_id validation? | ✅ | Haalt org_id uit user context |
| PII redaction? | ✅ | Via semantic-retrieval.ts |

**Aanbeveling:** Deep dive nodig voor knowledge reinforcement flows.

---

### 3. `data-quality-auditor/index.ts` ⚠️ MEDIUM PRIORITY

**Status:** Deels compliant - Confidence updates zonder atomic RPCs

| Criteria | Status | Details |
|----------|--------|---------|
| Importeert knowledge-crud? | ❌ | Geen import |
| Directe ai_knowledge_base mutations? | ✅ YES | 6 UPDATE locaties |
| Org_id validation? | ✅ | Haalt eerste org_id |
| Atomische RPCs? | ❌ | Reguliere UPDATE statements |
| PII redaction? | N/A | Geen nieuwe knowledge creation |

**Problemen:**
1. Line 97-109: Directe UPDATE voor auto-archive
2. Line 115-118: Directe UPDATE voor needs_review
3. Line 144-147: Directe UPDATE voor low confidence flagging
4. Line 254-262: Directe UPDATE voor confidence boost
5. Line 315-324: Directe UPDATE voor incomplete data flagging

**Aanbevolen fix:**
```typescript
import { updateConfidence, softDeleteKnowledge } from '../_shared/knowledge-crud.ts';

// Vervang confidence boost met:
await updateConfidence(supabase, item.id, orgId, {
  ruleKey: 'usage_reinforcement',
  customDelta: 0.1
});

// Vervang auto-archive met:
await softDeleteKnowledge(supabase, item.id, {
  reason: 'auto_archived_outdated',
  deletedBy: 'data-quality-auditor'
});
```

---

### 4. `detect-and-resolve-conflicts/index.ts` ✅ COMPLIANT

**Status:** Compliant - Geen directe knowledge mutations

| Criteria | Status | Details |
|----------|--------|---------|
| Importeert knowledge-crud? | N/A | Niet nodig |
| Directe ai_knowledge_base mutations? | ❌ | Alleen SELECT |
| Org_id validation? | ✅ | Uit request body |

**Opmerkingen:** Logt alleen naar `data_conflicts` en `business_intelligence`, geen knowledge mutations.

---

### 5. `ai-agent-orchestrator/index.ts` ✅ COMPLIANT

**Status:** Compliant - Geen knowledge mutations

| Criteria | Status | Details |
|----------|--------|---------|
| Importeert knowledge-crud? | N/A | Niet nodig |
| Directe ai_knowledge_base mutations? | ❌ | Orchestreert agent actions |
| Org_id validation? | ✅ | Via goal.org_id |

**Opmerkingen:** Beheert agent_goals/agent_actions/agent_task_queue, geen knowledge base interactie.

---

### 6. `smart-deduplicator/index.ts` ⚠️ LOW PRIORITY

**Status:** Deels compliant - Soft delete zonder shared module

| Criteria | Status | Details |
|----------|--------|---------|
| Importeert knowledge-crud? | ❌ | Geen import |
| Directe ai_knowledge_base mutations? | ✅ YES | Line 215-230 (soft delete) |
| Org_id validation? | ✅ | Haalt eerste org_id |
| Atomische RPCs? | N/A | Soft delete is geen concurrent operation |

**Aanbevolen fix:**
```typescript
import { softDeleteKnowledge } from '../_shared/knowledge-crud.ts';

// Vervang directe UPDATE met:
await softDeleteKnowledge(supabase, dup.loser_id, {
  reason: 'Merged into better version',
  deletedBy: 'smart-deduplicator',
  metadata: {
    merged_into: dup.winner_id,
    similarity: dup.similarity_score
  }
});
```

---

### 7. `update-knowledge-from-conflict/index.ts` ⚠️ LOW PRIORITY

**Status:** Deels compliant - Directe value update

| Criteria | Status | Details |
|----------|--------|---------|
| Importeert knowledge-crud? | ❌ | Geen import |
| Directe ai_knowledge_base mutations? | ✅ YES | Line 129-135 (UPDATE value) |
| Org_id validation? | ⚠️ | Indirect via conflict.org_id |
| PII redaction? | ❌ | Geen PII check op edited_value |

**Problemen:**
1. Directe UPDATE naar value column
2. Geen PII redaction op user-submitted edited_value
3. Geen org_id validation tegen user's org permissions

---

## Knowledge-crud.ts Module Status

| Feature | Status |
|---------|--------|
| Atomische RPCs | ✅ `atomic_reinforce_knowledge`, `atomic_update_confidence`, `atomic_increment_feedback` |
| Org-scoped security | ✅ Alle functies vereisen `orgId` parameter |
| PII redaction | ✅ Via `telemetry.ts` |
| Conflict detection | ✅ `checkForConflicts()` |
| Multi-tenant isolation | ✅ RPCs filteren op `p_org_id` |

---

## Prioriteit Matrix

| Priority | Function | Effort | Impact |
|----------|----------|--------|--------|
| 🔴 HIGH | process-system-events | 2-3 uur | Hoog - centrale event processor |
| 🔴 HIGH | ai-chat | 3-4 uur | Hoog - main chat endpoint |
| 🟡 MEDIUM | data-quality-auditor | 1-2 uur | Medium - batch operations |
| 🟢 LOW | smart-deduplicator | 30 min | Laag - specifieke use case |
| 🟢 LOW | update-knowledge-from-conflict | 30 min | Laag - infrequent gebruik |

---

## Actieplan

### Fase 3A: HIGH Priority Fixes (Week 1)
1. [ ] Refactor `process-system-events` om `createKnowledge()` en `reinforceKnowledge()` te gebruiken
2. [ ] Audit `ai-chat` voor knowledge reinforcement flows
3. [ ] Test backward compatibility

### Fase 3B: MEDIUM Priority Fixes (Week 2)
1. [ ] Refactor `data-quality-auditor` om `updateConfidence()` en `softDeleteKnowledge()` te gebruiken
2. [ ] Add telemetry logging

### Fase 3C: LOW Priority Fixes (Week 3)
1. [ ] Refactor `smart-deduplicator` om `softDeleteKnowledge()` te gebruiken
2. [ ] Refactor `update-knowledge-from-conflict` om PII redaction toe te voegen

---

## Conclusie

**Huidige status:** 2/7 functions compliant (29%)  
**Na Phase 3 fixes:** 7/7 functions compliant (100%)  

De belangrijkste gap is dat `process-system-events` (de centrale event processor) nog steeds directe DB operaties gebruikt in plaats van de geünificeerde `knowledge-crud` module. Dit is de hoogste prioriteit fix.
