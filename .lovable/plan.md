
# PROMPT #34 - Unified Intelligence Center: Enterprise Dashboard

## Analyse van de Huidige Situatie

### Route "/" - Dashboard.tsx (960 regels)
**Bevat:**
- Persoonlijk werkbord met taken ("Nu Doen" lijst)
- Task CRUD operaties (create, complete, delete, subtasks)
- Timer integratie via `useActiveTimers`
- Confetti celebrations
- Widget systeem via `useWidgetPreferences`
- RecruitmentKPIs, TodayFocusCard, UrgencyActionPanel, UpcomingRemindersWidget

### Route "/dashboard" - DashboardStats.tsx (63 regels)
**Bevat:**
- Team statistieken overview
- StatCards, AssigneeProgress, SourceProgress
- OverdueTasksList, UpcomingTasksList
- Data via `useDashboardStats` hook

### User Roles (useUserRole.ts)
Bestaande rollen: `admin`, `manager`, `user`
> **Let op:** Er bestaat geen "recruiter" rol - de PROMPT specificatie wordt aangepast naar bestaande rollen.

---

## Architectuur Beslissing

**Enterprise Aanpak:** ÉÉN Unified Dashboard met 3 tabs

```text
VOOR (Verwarrend):
├── "/" → Dashboard.tsx (Werkbord met taken)
├── "/dashboard" → DashboardStats.tsx (Statistieken)
└── Sidebar: "Dashboard" + "Werkbord"

NA (Enterprise):
├── "/" → REDIRECT naar /dashboard?tab=mijn-werk
├── "/dashboard" → UnifiedDashboard.tsx (3 tabs)
└── Sidebar: alleen "Dashboard"
```

---

## Implementatie Plan

### Fase 1: Nieuw Bestand UnifiedDashboard.tsx

**Locatie:** `src/pages/UnifiedDashboard.tsx`

**Structuur:**
```tsx
// URL Parameter support
const [searchParams, setSearchParams] = useSearchParams();
const tabParam = searchParams.get('tab');

// Rol-gebaseerde default tab
const { role, isAdmin, isManager } = useUserRole();
const getDefaultTab = () => {
  if (isAdmin() || isManager()) return 'team';
  return 'mijn-werk';
};

const activeTab = tabParam || getDefaultTab();

// Tab change handler - update URL
const handleTabChange = (value: string) => {
  setSearchParams({ tab: value });
};
```

### Tab 1: Mijn Werk
**Hergebruikte componenten:**
- `TodayFocusCard` - Persoonlijke focus items
- `UpcomingRemindersWidget` - Aankomende herinneringen

### Tab 2: Team Overzicht  
**Hergebruikte componenten uit `@/components/dashboard-stats`:**
- `DashboardHeader` - Titel + vernieuwen knop
- `StatCards` - 4 KPI kaarten (Totaal, Open, Afgerond, Verlopen)
- `AssigneeProgress` - Per medewerker progress
- `SourceProgress` - Per bron (notule) progress
- `OverdueTasksList` - Verlopen taken
- `UpcomingTasksList` - Komende taken

### Tab 3: Recruitment
**Hergebruikte componenten:**
- `RecruitmentKPIs` - Sollicitaties, professionals, klanten, plaatsingen
- `UrgencyActionPanel` - Urgente acties (met inline data fetch)

---

### Fase 2: Route Wijzigingen (App.tsx)

```tsx
// NIEUW: Import Navigate voor redirect
import { Navigate } from "react-router-dom";
import UnifiedDashboard from "./pages/UnifiedDashboard";

// GEWIJZIGDE routes:
<Route path="/" element={<Navigate to="/dashboard?tab=mijn-werk" replace />} />
<Route path="/dashboard" element={<UnifiedDashboard />} />
```

---

### Fase 3: Sidebar Wijzigingen (AppSidebar.tsx)

**VERWIJDEREN:** "Werkbord" item

**BEHOUDEN:** "Dashboard" item (bovenaan)

```tsx
// Mijn Werk sectie - alleen Dashboard behouden:
{
  title: "Dashboard",
  url: "/dashboard",
  icon: LayoutDashboard,
},
// VERWIJDER: Werkbord item
```

---

## URL Parameters Ondersteuning

| URL | Tab | Beschrijving |
|-----|-----|--------------|
| `/` | - | Redirect naar `/dashboard?tab=mijn-werk` |
| `/dashboard` | Default (rol-gebaseerd) | Admin/Manager → team, User → mijn-werk |
| `/dashboard?tab=mijn-werk` | Mijn Werk | Persoonlijke focus |
| `/dashboard?tab=team` | Team Overzicht | Statistieken per medewerker/bron |
| `/dashboard?tab=recruitment` | Recruitment | KPIs en urgentie acties |

---

## Rol-Gebaseerde Default Tab

```tsx
function getDefaultTab(role: UserRole): string {
  switch(role) {
    case 'admin':
    case 'manager':
      return 'team';  // Managers zien Team Overzicht
    default:
      return 'mijn-werk';  // Gebruikers zien Mijn Werk
  }
}
```

> **Opmerking:** De PROMPT specificeerde een "recruiter" rol die niet bestaat in het systeem. De implementatie gebruikt de bestaande rollen (`admin`, `manager`, `user`).

---

## Data Flow voor Tab 3: Recruitment

De UrgencyActionPanel vereist inline data laden (zoals Dashboard.tsx doet):

```tsx
// In UnifiedDashboard.tsx
const [urgencyApplications, setUrgencyApplications] = useState([]);

const loadUrgencyApplications = async () => {
  const { data } = await supabase
    .from("professional_applications")
    .select("id, pipeline_stage, created_at, updated_at")
    .is("deleted_at", null)
    .in("pipeline_stage", ["nieuw", "screening", "interview", "goedgekeurd"]);
  setUrgencyApplications(data || []);
};

useEffect(() => {
  loadUrgencyApplications();
}, []);
```

---

## Bestanden Overzicht

### Nieuw Aanmaken

| Bestand | Type | Beschrijving |
|---------|------|--------------|
| `src/pages/UnifiedDashboard.tsx` | PAGE | Unified dashboard met 3 tabs |

### Wijzigen

| Bestand | Wijziging |
|---------|-----------|
| `src/App.tsx` | Route "/" → redirect, "/dashboard" → UnifiedDashboard |
| `src/components/AppSidebar.tsx` | Verwijder "Werkbord" item |

### NIET Wijzigen (Behouden als backup/hergebruik)

| Bestand | Reden |
|---------|-------|
| `src/pages/Dashboard.tsx` | BEHOUDEN als backup |
| `src/pages/DashboardStats.tsx` | BEHOUDEN, componenten worden geïmporteerd |
| `src/hooks/useDashboardStats.ts` | Ongewijzigd |
| `src/hooks/useDashboardContext.ts` | Ongewijzigd, blijft exporteerbaar |
| `src/components/dashboard-stats/*.tsx` | Ongewijzigd |
| `src/components/dashboard/*.tsx` | Ongewijzigd |

---

## UI Design

### Page Header
```tsx
<div className="flex items-center gap-3 mb-6">
  <div className="p-2 rounded-lg bg-primary/10">
    <LayoutDashboard className="h-6 w-6 text-primary" />
  </div>
  <div>
    <h1 className="text-2xl font-bold">Dashboard</h1>
    <p className="text-sm text-muted-foreground">
      Overzicht van taken, team en recruitment
    </p>
  </div>
</div>
```

### Tabs Styling
```tsx
<TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
  <TabsTrigger value="mijn-werk" className="gap-2">
    <User className="h-4 w-4" />
    <span className="hidden sm:inline">Mijn Werk</span>
  </TabsTrigger>
  <TabsTrigger value="team" className="gap-2">
    <Users className="h-4 w-4" />
    <span className="hidden sm:inline">Team Overzicht</span>
  </TabsTrigger>
  <TabsTrigger value="recruitment" className="gap-2">
    <Briefcase className="h-4 w-4" />
    <span className="hidden sm:inline">Recruitment</span>
  </TabsTrigger>
</TabsList>
```

---

## Acceptatie Criteria

### Functioneel
- [x] Route "/" redirect naar "/dashboard"
- [x] Route "/dashboard" laadt UnifiedDashboard
- [x] Tab "Mijn Werk" bevat TodayFocusCard + UpcomingRemindersWidget
- [x] Tab "Team" bevat alle dashboard-stats componenten
- [x] Tab "Recruitment" bevat RecruitmentKPIs + UrgencyActionPanel
- [x] URL parameter ?tab=xxx werkt voor alle 3 tabs
- [x] Rol-gebaseerde default tab werkt

### Navigatie
- [x] Sidebar "Dashboard" navigeert naar /dashboard
- [x] Sidebar heeft GEEN "Werkbord" meer
- [x] Oude bookmarks "/" werken via redirect

### Backward Compatibility
- [x] useDashboardStats blijft werken
- [x] useDashboardContext blijft exporteerbaar
- [x] Bestaande componenten ongewijzigd

### Technisch
- [x] Geen console errors
- [x] TypeScript compileert
- [x] Nederlandse labels overal

---

## Rollback Plan

Als er problemen zijn:
1. Verwijder `UnifiedDashboard.tsx`
2. Revert App.tsx: "/" → Dashboard, "/dashboard" → DashboardStats
3. Revert AppSidebar.tsx: Voeg "Werkbord" terug
4. Alle oude bestanden blijven behouden als backup
