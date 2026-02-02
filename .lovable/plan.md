
# Onderdeel 3: Sidebar Opruimen

## Huidige Situatie

De "Mijn Werk" sectie in de sidebar bevat momenteel 7 items (regels 36-67):

```text
1. Dashboard        ✓ Behouden
2. WhatsApp         ✓ Behouden  
3. Lijstweergave    ✗ VERWIJDEREN
4. Kalender         ✗ VERWIJDEREN
5. Opvolging        ✗ VERWIJDEREN
6. Bijlagen         ✓ Behouden
7. Notulen          ✓ Behouden
```

## Wijzigingen

### Bestand: src/components/AppSidebar.tsx

### 1. Import opruimen (regel 1)

Verwijder ongebruikte icons:
- `List` - niet meer nodig
- `Calendar` - niet meer nodig  
- `BarChart3` - niet meer nodig

**Van:**
```typescript
import { Home, Kanban, List, Calendar, Clock, BarChart3, Trash2, ... }
```

**Naar:**
```typescript
import { Home, Kanban, Clock, Trash2, ... }
```

### 2. Menu items verwijderen (regels 46-57)

Verwijder deze 3 menu items uit de "Mijn Werk" groep:

```typescript
// VERWIJDEREN:
{
  title: "Lijstweergave",
  url: "/lijst",
  icon: List
},
{
  title: "Kalender", 
  url: "/kalender",
  icon: Calendar
},
{
  title: "Opvolging",
  url: "/opvolging",
  icon: BarChart3
},
```

### 3. Resultaat na wijziging

De "Mijn Werk" sectie bevat dan 4 items:

```text
Mijn Werk
├── Dashboard      (met task count badge)
├── WhatsApp       (met unread count badge)
├── Bijlagen
└── Notulen        (met pending minutes badge)
```

## Technische Details

| Actie | Regel(s) | Impact |
|-------|----------|--------|
| Remove `List` import | 1 | Geen runtime impact |
| Remove `Calendar` import | 1 | Geen runtime impact |
| Remove `BarChart3` import | 1 | Geen runtime impact |
| Remove Lijstweergave item | 47-50 | Sidebar link verwijderd |
| Remove Kalender item | 51-54 | Sidebar link verwijderd |
| Remove Opvolging item | 55-58 | Sidebar link verwijderd |

## Geen Breaking Changes

- Originele routes blijven werken (tot Onderdeel 4)
- Dashboard tabs zijn al functioneel
- Geen impact op andere sidebar secties

## Verificatie na implementatie

| Check | Verwacht |
|-------|----------|
| Sidebar "Mijn Werk" | 4 items: Dashboard, WhatsApp, Bijlagen, Notulen |
| Dashboard tabs | 6 tabs blijven werken |
| Oude URLs | `/lijst`, `/kalender`, `/opvolging` werken nog (aparte pagina's) |
| Geen console errors | TypeScript compileert zonder warnings |
