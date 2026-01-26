
# Fase 2: Notulen Overzichtspagina - Implementatieplan

## 1. Overzicht

| Aspect | Details |
|--------|---------|
| **Scope** | Query hook + volledige overzichtspagina met filters, zoeken, paginatie |
| **Risico niveau** | LAAG (alleen READ operaties) |
| **Nieuwe bestanden** | 2 (useMeetingMinutes.ts, Notulen.tsx update) |
| **Bestaande patronen** | Bijlagen.tsx (filters/paginatie), useTasksQuery.ts (TanStack Query) |

---

## 2. Nieuwe Hook: `useMeetingMinutes.ts`

### Bestandslocatie
`src/hooks/useMeetingMinutes.ts`

### Interface Definitie

```typescript
// Agenda item structuur (uit JSONB)
interface AgendaItem {
  id: string;
  order: number;
  title: string;
  duration_min: number;
  discussed: boolean;
}

// Decision structuur (uit JSONB)
interface Decision {
  id: string;
  text: string;
  decided_at: string;
  decided_by: string | null;
}

// Meeting Minutes met gekoppelde data
export interface MeetingMinute {
  id: string;
  task_id: string;
  org_id: string;
  meeting_type: 'team' | 'board' | 'project' | 'klant' | 'overig' | null;
  location: string | null;
  meeting_link: string | null;
  agenda_items: AgendaItem[];
  decisions: Decision[];
  content: string | null;
  status: 'draft' | 'pending_approval' | 'approved' | 'archived' | null;
  approved_by: string | null;
  approved_at: string | null;
  next_meeting_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  // Joined data
  tasks: {
    id: string;
    title: string;
    start_at: string | null;
    due_at: string | null;
  } | null;
  meeting_attendees: Array<{
    id: string;
    role: string | null;
    attended: boolean | null;
    user_id: string | null;
    external_name: string | null;
    profiles: { name: string | null } | null;
  }>;
}
```

### Query Key Pattern

```typescript
export const MEETING_MINUTES_QUERY_KEY = ['meeting-minutes'] as const;
```

### Supabase Query Strategie

De query haalt meeting_minutes op met JOIN naar:
- `tasks` (voor titel en datum)
- `meeting_attendees` met nested `profiles` (voor deelnemersinfo)

```typescript
const { data, error } = await supabase
  .from("meeting_minutes")
  .select(`
    *,
    tasks!inner(id, title, start_at, due_at),
    meeting_attendees(
      id,
      role,
      attended,
      user_id,
      external_name,
      profiles:profiles!meeting_attendees_user_id_fkey(name)
    )
  `)
  .order("created_at", { ascending: false });
```

### Realtime Sync

Consistent met bestaande patronen (200ms debounce):

```typescript
useEffect(() => {
  let debounceTimer: NodeJS.Timeout | null = null;
  
  const channel = supabase
    .channel('notulen-realtime-updates')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'meeting_minutes',
    }, () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: MEETING_MINUTES_QUERY_KEY });
      }, 200);
    })
    .subscribe();
  
  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    supabase.removeChannel(channel);
  };
}, [queryClient]);
```

---

## 3. Pagina Update: `Notulen.tsx`

### State Management

```typescript
// Filters
const [searchQuery, setSearchQuery] = useState("");
const debouncedSearch = useDebouncedValue(searchQuery, 300);
const [statusFilter, setStatusFilter] = useState<string>('all');
const [typeFilter, setTypeFilter] = useState<string>('all');
const [dateFilter, setDateFilter] = useState<string>('all');

// Paginatie
const [currentPage, setCurrentPage] = useState(1);
const PAGE_SIZE = 10;

// Reset pagina bij filter wijzigingen
useEffect(() => {
  setCurrentPage(1);
}, [debouncedSearch, statusFilter, typeFilter, dateFilter]);
```

### Filter Implementatie (Client-Side)

```typescript
const filteredMinutes = useMemo(() => {
  if (!minutes) return [];
  
  let result = [...minutes];
  
  // Zoeken op titel en content
  if (debouncedSearch) {
    const query = debouncedSearch.toLowerCase();
    result = result.filter(m => 
      m.tasks?.title.toLowerCase().includes(query) ||
      m.content?.toLowerCase().includes(query)
    );
  }
  
  // Status filter
  if (statusFilter !== 'all') {
    result = result.filter(m => m.status === statusFilter);
  }
  
  // Type filter
  if (typeFilter !== 'all') {
    result = result.filter(m => m.meeting_type === typeFilter);
  }
  
  // Datum filter
  if (dateFilter !== 'all') {
    result = result.filter(m => {
      const date = m.tasks?.start_at ? new Date(m.tasks.start_at) : null;
      if (!date) return false;
      switch (dateFilter) {
        case 'today': return isToday(date);
        case 'week': return isThisWeek(date, { locale: nl });
        case 'month': return isThisMonth(date);
        default: return true;
      }
    });
  }
  
  return result;
}, [minutes, debouncedSearch, statusFilter, typeFilter, dateFilter]);
```

### UI Layout Specificatie

```text
┌──────────────────────────────────────────────────────────────────┐
│ PageHero                                                         │
│ Title: "Vergadernotulen"                                         │
│ Subtitle: "X notulen • Y draft • Z goedgekeurd"                 │
├──────────────────────────────────────────────────────────────────┤
│ Card: Filters                                                    │
│ ┌────────────────────────────────────────────────────────────┐   │
│ │ [+ Nieuwe notulen]  [🔍 Zoeken...]  [Status▾] [Type▾] [📅] │   │
│ └────────────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────────────┤
│ Card: Tabel                                                      │
│ ┌────────────────────────────────────────────────────────────┐   │
│ │ TH: Titel | Type | Datum | Deelnemers | Status | Acties   │   │
│ ├────────────────────────────────────────────────────────────┤   │
│ │ Teamoverleg Q1     | Team  | 26 jan | 👤 5    | Draft | 👁 │   │
│ │ Board Meeting      | Board | 20 jan | 👤 3    | ✅    | 👁 │   │
│ └────────────────────────────────────────────────────────────┘   │
│ Pagination: [Vorige] [1] [2] [3] [Volgende]                     │
└──────────────────────────────────────────────────────────────────┘
```

### Tabel Kolommen

| Kolom | Bron | Weergave |
|-------|------|----------|
| Titel | `tasks.title` | Tekst + click naar detail (Fase 3) |
| Type | `meeting_type` | Badge met kleur |
| Datum | `tasks.start_at` | `d MMM yyyy` format |
| Deelnemers | `meeting_attendees.length` | Avatar stack of count |
| Status | `status` | Badge (Draft/Wacht/Goedgekeurd/Archief) |
| Acties | - | Eye icon (disabled tooltip: "Detail komt in Fase 3") |

### Status Badge Styling

```typescript
const getStatusBadge = (status: string | null) => {
  switch (status) {
    case 'draft':
      return <Badge variant="secondary">Concept</Badge>;
    case 'pending_approval':
      return <Badge variant="warning" className="bg-amber-500/10 text-amber-700">Wacht op goedkeuring</Badge>;
    case 'approved':
      return <Badge variant="success" className="bg-green-500/10 text-green-700">Goedgekeurd</Badge>;
    case 'archived':
      return <Badge variant="outline" className="text-muted-foreground">Gearchiveerd</Badge>;
    default:
      return <Badge variant="outline">Onbekend</Badge>;
  }
};
```

### Meeting Type Badge Styling

```typescript
const getTypeBadge = (type: string | null) => {
  const config: Record<string, { label: string; className: string }> = {
    team: { label: 'Team', className: 'bg-blue-500/10 text-blue-700' },
    board: { label: 'Bestuur', className: 'bg-purple-500/10 text-purple-700' },
    project: { label: 'Project', className: 'bg-cyan-500/10 text-cyan-700' },
    klant: { label: 'Klant', className: 'bg-orange-500/10 text-orange-700' },
    overig: { label: 'Overig', className: 'bg-gray-500/10 text-gray-700' },
  };
  const c = config[type || 'overig'] || config.overig;
  return <Badge className={c.className}>{c.label}</Badge>;
};
```

### Empty State

```typescript
{filteredMinutes.length === 0 && !isLoading && (
  <div className="p-12 text-center text-muted-foreground">
    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
    <p className="font-medium">Geen notulen gevonden</p>
    <p className="text-sm mt-1">
      {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
        ? "Probeer andere filters"
        : "Maak je eerste vergadernotulen aan"}
    </p>
  </div>
)}
```

### Loading State

Consistent met Bijlagen.tsx pattern:

```typescript
{isLoading && (
  <div className="p-6 space-y-4">
    {[...Array(5)].map((_, i) => (
      <Skeleton key={i} className="h-14 w-full" />
    ))}
  </div>
)}
```

### Paginatie Component

Hergebruik exact Bijlagen.tsx pattern:
- Nederlandse labels ("Vorige", "Volgende")
- Max 5 pagina-nummers zichtbaar
- Info text: "Pagina X van Y • Z resultaten"

---

## 4. "Nieuwe Notulen" Knop (Disabled)

De knop is zichtbaar maar disabled met tooltip:

```typescript
<Tooltip>
  <TooltipTrigger asChild>
    <Button disabled className="opacity-50 cursor-not-allowed">
      <Plus className="h-4 w-4 mr-2" />
      Nieuwe notulen
    </Button>
  </TooltipTrigger>
  <TooltipContent>
    <p>Komt beschikbaar in Fase 3</p>
  </TooltipContent>
</Tooltip>
```

---

## 5. Stats Berekening

```typescript
const stats = useMemo(() => {
  if (!minutes) return { total: 0, draft: 0, pending: 0, approved: 0 };
  return {
    total: minutes.length,
    draft: minutes.filter(m => m.status === 'draft').length,
    pending: minutes.filter(m => m.status === 'pending_approval').length,
    approved: minutes.filter(m => m.status === 'approved').length,
  };
}, [minutes]);

// In PageHero subtitle:
subtitle={`${stats.total} notulen • ${stats.draft} concept • ${stats.approved} goedgekeurd`}
```

---

## 6. Imports & Dependencies

### useMeetingMinutes.ts

```typescript
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
```

### Notulen.tsx

```typescript
import { useState, useMemo, useEffect } from "react";
import { useMeetingMinutes, MeetingMinute } from "@/hooks/useMeetingMinutes";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { format, isToday, isThisWeek, isThisMonth } from "date-fns";
import { nl } from "date-fns/locale";
import { PageHero } from "@/components/ui/page-hero";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Search, FileText, Plus, Eye, Filter,
  ChevronLeft, ChevronRight, Users
} from "lucide-react";
```

---

## 7. Technische Details

### Query Flow

```text
┌─────────────────┐     ┌──────────────────────┐
│ Notulen.tsx     │────▶│ useMeetingMinutes()  │
│                 │     │                      │
│ - Filters       │◀────│ - TanStack Query     │
│ - Zoeken        │     │ - Realtime sync      │
│ - Paginatie     │     │ - Error handling     │
│ - UI render     │     │                      │
└─────────────────┘     └──────────────────────┘
                               │
                               ▼
                        ┌──────────────────────┐
                        │ Supabase             │
                        │                      │
                        │ meeting_minutes      │
                        │ + tasks (JOIN)       │
                        │ + meeting_attendees  │
                        │   + profiles         │
                        └──────────────────────┘
```

### RLS Verificatie

De query maakt gebruik van de bestaande RLS policies:
- `meeting_minutes` gefilterd op `user_organizations.org_id`
- Geen extra client-side org filtering nodig

---

## 8. Implementatie Volgorde

1. **Stap 1**: Maak `src/hooks/useMeetingMinutes.ts`
   - Interface definities
   - Query functie met JOINs
   - Realtime subscription

2. **Stap 2**: Update `src/pages/Notulen.tsx`
   - Import hook en dependencies
   - State voor filters
   - Filter logica met useMemo
   - Stats berekening
   - UI: PageHero met stats
   - UI: Filter bar
   - UI: Tabel met data
   - UI: Empty/Loading states
   - UI: Paginatie

---

## 9. Acceptatie Criteria Checklist

- [ ] Hook fetcht data correct (RLS-scoped)
- [ ] Status filter werkt (draft/pending/approved/archived)
- [ ] Type filter werkt (team/board/project/klant/overig)
- [ ] Datum filter werkt (vandaag/week/maand)
- [ ] Zoekfunctie werkt op titel en content
- [ ] Paginatie (10 per pagina) werkt
- [ ] Tabel toont correcte kolommen
- [ ] Loading skeleton tijdens fetch
- [ ] Empty state wanneer geen data
- [ ] Geen console errors
- [ ] TypeScript compileert

---

## 10. Wat NIET wordt gebouwd

| Item | Reden |
|------|-------|
| Create/Update/Delete | Fase 3 |
| Detail modal | Fase 3 |
| Deelnemers management | Fase 3 |
| PDF export | Fase 4 |
| Realtime voor attendees | Fase 3 |

---

## 11. Bestandsoverzicht

| Bestand | Actie | Regels (geschat) |
|---------|-------|------------------|
| `src/hooks/useMeetingMinutes.ts` | NIEUW | ~120 |
| `src/pages/Notulen.tsx` | UPDATE | ~350 |

