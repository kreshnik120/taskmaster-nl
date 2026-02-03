

# Fix: Agent Router 404 Foutmelding Bij Drag-and-Drop

## Probleemanalyse

De drag-and-drop werkt correct (taak wordt verplaatst), maar elke keer verschijnt er een storende foutmelding:

**"Agent kon actie niet uitvoeren - Agent Router error: 404"**

### Root Cause

```text
┌─────────────────────────────────────────────────────────────────┐
│  FLOW BIJ DRAG                                                  │
│                                                                 │
│  handleDragStart                                                │
│       │                                                         │
│       ├─── setActiveTask ✅                                     │
│       │                                                         │
│       └─── executeIntent('suggest_task_flow')                   │
│                   │                                             │
│                   ▼                                             │
│            agent-router-proxy                                   │
│                   │                                             │
│                   ▼                                             │
│            VPS:3002/api/v1/execute                              │
│                   │                                             │
│                   ▼                                             │
│            ❌ 404 Not Found (service niet actief)               │
│                   │                                             │
│                   ▼                                             │
│            toast.error() ← ONGEWENST                            │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  handleDragEnd                                                  │
│       │                                                         │
│       ├─── supabase.update(column_id) ✅                        │
│       │                                                         │
│       └─── toast.success() ✅                                   │
└─────────────────────────────────────────────────────────────────┘
```

### De VPS Agent Router Status (uit memory)

De VPS Agent Router is in "definition-only" state:
- Frontend code bestaat (`useAgentRouter`, `agentIntents.ts`)
- Edge function `agent-router-proxy` bestaat
- **MAAR: de VPS service op poort 3002 draait niet**
- De `CLAWDBOT_VPS_URL` secret wijst naar de WhatsApp Relay (poort 58438), niet naar Agent Router

---

## Oplossingsstrategieën

### Optie A: Silent Mode voor Non-Critical Intents (Aanbevolen)

Voeg een `silent: true` parameter toe aan de `executeIntent` call voor non-critical operaties zoals `suggest_task_flow`. Dit onderdrukt de toast foutmeldingen.

**Voordelen:**
- Minimale code wijziging
- Houdt de Agent Router infrastructuur intact voor toekomstig gebruik
- Andere (kritische) intents tonen nog steeds fouten

### Optie B: Disable Agent Router Volledig in Drag Context

Verwijder de `executeIntent` aanroep volledig uit `handleDragStart`. De AI-suggestie feature is toch niet operationeel.

**Voordelen:**
- Geen onnodige API calls
- Eenvoudiger code

**Nadelen:**
- Moet later weer toegevoegd worden wanneer VPS actief is

### Optie C: Environment-Based Feature Flag

Voeg een check toe die alleen calls maakt als de Agent Router daadwerkelijk geconfigureerd is.

---

## Implementatieplan: Optie A (Silent Mode)

### Stap 1: Uitbreid `executeIntent` met `silent` optie

**Bestand:** `src/hooks/useAgentRouter.ts`

Voeg een optionele `silent` parameter toe die toast notificaties onderdrukt:

```typescript
const executeIntent = useCallback(
  async (
    intentId: string,
    payload: Record<string, unknown> = {},
    message?: string,
    options?: { silent?: boolean }  // NIEUWE PARAMETER
  ): Promise<AgentResult> => {
    // ...existing code...
    
    if (result.success) {
      if (!options?.silent) {
        options.onSuccess?.(result);
        toast.success(...);
      }
    } else {
      if (!options?.silent) {
        options.onError?.(result.error);
        toast.error("Agent kon actie niet uitvoeren", ...);
      }
    }
    // ...
  }
);
```

### Stap 2: Gebruik `silent: true` voor suggest_task_flow

**Bestand:** `src/components/dashboard/MyTasksFlowSection.tsx`

```typescript
// Non-blocking, silent AI suggestion request during drag
executeIntent('suggest_task_flow', {
  dragging_task_id: task.id,
  source_column: task.column_id,
  task_priority: task.priority,
  task_due_at: task.due_at,
}, undefined, { silent: true })  // SILENT MODE
.then(result => {
  if (result.suggestions?.length && dragContext) {
    dragContext.setAISuggestion(result.suggestions[0]);
  }
}).catch(() => {
  // Silent fail - AI suggestions are non-critical
});
```

---

## Bestanden Overzicht

| Bestand | Actie | Wijzigingen |
|---------|-------|-------------|
| `src/hooks/useAgentRouter.ts` | EDIT | Voeg `silent` optie toe aan executeIntent |
| `src/components/dashboard/MyTasksFlowSection.tsx` | EDIT | Gebruik `silent: true` voor suggest_task_flow |

---

## Acceptatiecriteria

1. Drag-and-drop werkt zonder foutmeldingen
2. Toast "Taak verplaatst naar [kolom]" verschijnt nog steeds
3. Geen "Agent kon actie niet uitvoeren" foutmelding
4. Console logs tonen nog steeds de 404 (voor debugging)
5. Andere (kritieke) agent intents tonen nog steeds fouten indien ze falen

---

## Technische Notities

### Waarom Silent Mode?

De `suggest_task_flow` intent is een **enhancement feature** die:
- AI-suggesties geeft tijdens drag operaties
- Optioneel is - de app werkt perfect zonder
- Momenteel niet operationeel is (VPS niet actief)
- Geen impact heeft op de kernfunctionaliteit

Door silent mode te gebruiken in plaats van de functie te verwijderen:
1. Behouden we de code voor wanneer VPS wel actief is
2. Vermijden we storende UX voor de eindgebruiker
3. Kunnen we via logs nog steeds zien dat de service niet beschikbaar is

### Toekomstige Activatie

Wanneer de VPS Agent Router operationeel wordt:
1. Deploy de service op `srv1304497.hstgr.cloud:3002`
2. Voeg dedicated `AGENT_ROUTER_VPS_URL` secret toe
3. Verwijder `silent: true` parameter om toasts weer te activeren

---

## Risico's & Mitigatie

| Risico | Impact | Mitigatie |
|--------|--------|-----------|
| Silent mode verbergt echte fouten | Low | Alleen voor suggest_task_flow, andere intents behouden toasts |
| VPS komt nooit online | None | Silent mode is permanente oplossing |
| Ontwikkelaars missen de logs | Low | Console logs blijven actief |

