
# Onderdeel 5: Fix Agent & Navigatie Koppelingen

## Samenvatting

Na grondige analyse zijn er **3 kritieke categorieën** van vergeten koppelingen geïdentificeerd die moeten worden opgelost voordat de migratie compleet is.

---

## Categorie 1: AI Agent Context Detectie (KRITIEK)

### Probleem
De AI agents en ChatWidget gebruiken `location.pathname` voor context-detectie. Door de redirects is het pathname nu altijd `/dashboard` in plaats van `/kalender`, `/lijst`, of `/opvolging`. Dit breekt:
- Schedule Agent quick actions op kalender tab
- Lijst-specifieke AI suggesties
- Opvolging context voor de ChatWidget

### Betrokken Bestanden

| Bestand | Regel | Huidige Code | Probleem |
|---------|-------|--------------|----------|
| `src/lib/agentIntents.ts` | 216-287 | `PAGE_AGENT_CONFIG["/kalender"]` | Matched niet meer |
| `src/lib/agentIntents.ts` | 303-317 | `getPageAgentConfig(pathname)` | Krijgt altijd `/dashboard` |
| `src/components/AIAssistant/ChatWidget.tsx` | 113-131 | `PAGE_CONTEXTS["/kalender"]` | Matched niet meer |
| `src/components/AIAssistant/ChatWidget.tsx` | 239-250 | `currentPageContext` useMemo | Fallback naar default |
| `src/hooks/useAgentRouter.ts` | 35-37 | `getPageAgentConfig(location.pathname)` | Krijgt altijd `/dashboard` |

### Oplossing
Update de context-detectie logica om ook query parameters te lezen:

```typescript
// Nieuwe helper functie
function getEffectivePath(location: Location): string {
  const { pathname, search } = location;
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  
  // Dashboard met tab parameter → map naar virtueel path
  if (pathname === '/dashboard' && tab) {
    const tabMapping: Record<string, string> = {
      'lijst': '/lijst',
      'kalender': '/kalender',
      'opvolging': '/opvolging',
      'mijn-werk': '/',
      'team': '/dashboard',
      'recruitment': '/sollicitaties',
    };
    return tabMapping[tab] || pathname;
  }
  
  return pathname;
}
```

### Wijzigingen per Bestand

#### 1. `src/lib/agentIntents.ts`
- Voeg helper functie `getEffectivePathFromURL(pathname: string, search: string)` toe
- Update `getPageAgentConfig` om search parameter te accepteren

#### 2. `src/components/AIAssistant/ChatWidget.tsx`
- Update `currentPageContext` useMemo om `location.search` te gebruiken
- Map dashboard tabs naar juiste PAGE_CONTEXTS entries

#### 3. `src/hooks/useAgentRouter.ts`  
- Update `pageConfig` useMemo om `location.search` mee te nemen

---

## Categorie 2: Interne Navigatie Links (HOOG)

### Probleem
6 componenten gebruiken nog oude URL paths die nu redirecten in plaats van direct navigeren.

### Overzicht Wijzigingen

| Component | Regel | Huidige URL | Nieuwe URL |
|-----------|-------|-------------|------------|
| `NotificationBell.tsx` | 32 | `/lijst?task=${taskId}` | `/dashboard?tab=lijst&taskId=${taskId}` |
| `AssigneeProgress.tsx` | 20 | `/lijst?assignee=${userId}` | `/dashboard?tab=lijst&assignee=${userId}` |
| `TodayFocusCard.tsx` | 144 | `/lijst` | `/dashboard?tab=lijst` |
| `OverdueTasksList.tsx` | 107 | `/lijst?filter=overdue` | `/dashboard?tab=lijst&filter=overdue` |
| `UpcomingTasksList.tsx` | 115 | `/kalender` | `/dashboard?tab=kalender` |
| `ApplicationDetailModal.tsx` | 2047 | `/lijst?task=${task.id}` | `/dashboard?tab=lijst&taskId=${task.id}` |

### Gedetailleerde Wijzigingen

#### `src/components/notifications/NotificationBell.tsx` (regel 32)
```typescript
// VAN:
navigate(`/lijst?task=${taskId}&highlight=subtask`);

// NAAR:
navigate(`/dashboard?tab=lijst&taskId=${taskId}&highlight=subtask`);
```

#### `src/components/dashboard-stats/AssigneeProgress.tsx` (regel 20)
```typescript
// VAN:
navigate(`/lijst?assignee=${userId}`);

// NAAR:
navigate(`/dashboard?tab=lijst&assignee=${userId}`);
```

#### `src/components/dashboard/TodayFocusCard.tsx` (regel 144)
```typescript
// VAN:
onClick={() => navigate("/lijst")}

// NAAR:
onClick={() => navigate("/dashboard?tab=lijst")}
```

#### `src/components/dashboard-stats/OverdueTasksList.tsx` (regel 107)
```typescript
// VAN:
onClick={() => navigate('/lijst?filter=overdue')}

// NAAR:
onClick={() => navigate('/dashboard?tab=lijst&filter=overdue')}
```

#### `src/components/dashboard-stats/UpcomingTasksList.tsx` (regel 115)
```typescript
// VAN:
onClick={() => navigate('/kalender')}

// NAAR:
onClick={() => navigate('/dashboard?tab=kalender')}
```

#### `src/components/ApplicationDetailModal.tsx` (regel 2047)
```typescript
// VAN:
window.location.href = `/lijst?task=${task.id}`;

// NAAR:
window.location.href = `/dashboard?tab=lijst&taskId=${task.id}`;
```

---

## Categorie 3: Legacy Bestanden Verwijderen (OPRUIMING)

### Probleem
De volgende bestanden zijn niet meer nodig maar nemen ~4300+ regels in beslag:

| Bestand | Regels | Status |
|---------|--------|--------|
| `src/pages/Lijst.tsx` | ~1490 | Vervangen door EmbeddedListView |
| `src/pages/Kalender.tsx` | ~1225 | Vervangen door EmbeddedCalendarView |
| `src/pages/Opvolging.tsx` | ~553 | Vervangen door EmbeddedFollowupView |
| `src/pages/Dashboard.tsx` | ~960 | Vervangen door UnifiedDashboard |
| `src/pages/DashboardStats.tsx` | ~63 | Vervangen door MijnWerkTab |

**Totaal: ~4291 regels te verwijderen**

### Actie
Verwijder alle 5 bestanden na bevestiging dat alles werkt.

---

## Implementatie Volgorde

| Stap | Onderdeel | Bestanden | Impact |
|------|-----------|-----------|--------|
| 1 | Agent Context Fix | agentIntents.ts, ChatWidget.tsx, useAgentRouter.ts | AI krijgt juiste context |
| 2 | Navigatie Links | 6 componenten | Direct navigatie zonder redirect |
| 3 | Legacy Cleanup | 5 pagina bestanden | Codebase opschoning |

---

## Technische Details

### Stap 1: Agent Context Fix

**`src/lib/agentIntents.ts`** - Nieuwe functie toevoegen:

```typescript
/**
 * Get effective path considering dashboard tabs
 */
export function getEffectivePath(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  
  if (pathname === '/dashboard' && tab) {
    const tabMapping: Record<string, string> = {
      'lijst': '/lijst',
      'kalender': '/kalender',
      'opvolging': '/opvolging',
      'mijn-werk': '/',
    };
    return tabMapping[tab] || pathname;
  }
  
  return pathname;
}
```

**`src/lib/agentIntents.ts`** - Update getPageAgentConfig:

```typescript
export function getPageAgentConfig(pathname: string, search: string = ''): PageAgentConfig {
  const effectivePath = getEffectivePath(pathname, search);
  
  // Exact match first
  if (PAGE_AGENT_CONFIG[effectivePath]) {
    return PAGE_AGENT_CONFIG[effectivePath];
  }
  // ... rest unchanged
}
```

**`src/components/AIAssistant/ChatWidget.tsx`** - Update context detection:

```typescript
const currentPageContext = useMemo(() => {
  const params = new URLSearchParams(location.search);
  const tab = params.get('tab');
  
  // Handle dashboard tabs
  if (currentPath === '/dashboard' && tab) {
    const tabMapping: Record<string, string> = {
      'lijst': '/lijst',
      'kalender': '/kalender',
      'opvolging': '/opvolging',
    };
    const mappedPath = tabMapping[tab];
    if (mappedPath && PAGE_CONTEXTS[mappedPath]) {
      return PAGE_CONTEXTS[mappedPath];
    }
  }
  
  // Existing logic...
  if (PAGE_CONTEXTS[currentPath]) {
    return PAGE_CONTEXTS[currentPath];
  }
  const basePath = '/' + currentPath.split('/')[1];
  if (PAGE_CONTEXTS[basePath]) {
    return PAGE_CONTEXTS[basePath];
  }
  return DEFAULT_PAGE_CONTEXT;
}, [currentPath, location.search]);
```

**`src/hooks/useAgentRouter.ts`** - Update pageConfig:

```typescript
const pageConfig: PageAgentConfig = useMemo(
  () => getPageAgentConfig(location.pathname, location.search),
  [location.pathname, location.search]
);
```

### Stap 2: Navigatie Links Update

Alle 6 componenten worden bijgewerkt met de nieuwe URL structuur zoals hierboven beschreven.

### Stap 3: Legacy Cleanup

Verwijder de volgende bestanden:
- `src/pages/Lijst.tsx`
- `src/pages/Kalender.tsx`
- `src/pages/Opvolging.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/DashboardStats.tsx`

---

## Verificatie Checklist

| Test | Verwacht Resultaat |
|------|-------------------|
| Open `/dashboard?tab=kalender`, check ChatWidget quick actions | Toont "Afspraken vandaag", "Deze week", "Planning optimaliseren" |
| Open `/dashboard?tab=lijst`, check ChatWidget context | Label toont "Lijstweergave" |
| Klik op notificatie voor subtask | Navigeert naar `/dashboard?tab=lijst&taskId=...` |
| Klik "meer bekijken" in UpcomingTasksList | Navigeert naar `/dashboard?tab=kalender` |
| Klik op medewerker in AssigneeProgress | Navigeert naar `/dashboard?tab=lijst&assignee=...` |
| Check codebase size | ~4291 regels minder |

---

## Risico's en Mitigatie

| Risico | Mitigatie |
|--------|-----------|
| AI context breekt | Fallback naar DEFAULT_PAGE_CONTEXT blijft werken |
| Navigatie parameters niet gelezen | UnifiedDashboard leest al `taskId` uit URL |
| Legacy files nodig voor rollback | Verwijderen als laatste stap na volledige verificatie |
