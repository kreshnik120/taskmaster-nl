
# Plan: 6 Gelijkwaardige Dashboard Tabs

## Overzicht

Dit plan transformeert het Dashboard van 3 tabs met sub-navigatie naar 6 gelijkwaardige tabs op hetzelfde niveau.

## Gewenste Eindresultaat

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ [Mijn Werk] [Team Overzicht] [Recruitment] [Lijst] [Kalender] [Opvolging]  │
│                                                                             │
│                    VOLLEDIGE CONTENT VAN GESELECTEERDE TAB                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

Alle 6 tabs zijn altijd zichtbaar en gelijkwaardig - geen sub-navigatie meer.

---

## Onderdeel 1: Dashboard Tabs Uitbreiden

### Bestand: src/pages/UnifiedDashboard.tsx

### Te Verwijderen

| Item | Regels |
|------|--------|
| `MijnWerkView` type | 37-38 |
| `SUB_VIEWS` constant | 40-44 |
| `viewParam` en `mijnWerkView` variabelen | 70-75 |
| `handleViewChange` functie | 87-97 |
| Sub-navigatie div met buttons | 180-199 |
| Flex wrapper om TabsList | 164, 200 |
| Conditional content in mijn-werk tab | 204-245 |

### Nieuwe TabsList (6 tabs)

De TabsList wordt uitgebreid van 3 naar 6 triggers:

```text
grid-cols-3 md:grid-cols-6
```

Nieuwe tabs:
- Lijst (List icon)
- Kalender (Calendar icon)
- Opvolging (TrendingUp icon)

### Nieuwe TabsContent (3 placeholders)

Tijdelijke placeholder content voor de 3 nieuwe tabs totdat de volledige functionaliteit wordt geintegreerd in Onderdeel 2.

### Vereenvoudigde handleTabChange

Verwijder view-parameter logica - alleen tab parameter:

```typescript
const handleTabChange = (value: string) => {
  setSearchParams({ tab: value });
};
```

### Mijn Werk Tab Content

Vereenvoudigen - geen conditionals meer, altijd Focus content:
- TodayFocusCard
- UpcomingRemindersWidget  
- MyTasksFlowSection

---

## Onderdeel 2: Embedded Views Maken (later)

Drie nieuwe componenten met lazy loading:

| Component | Bron | Doel |
|-----------|------|------|
| EmbeddedListView | Lijst.tsx (1490 regels) | Volledige tabel functionaliteit |
| EmbeddedCalendarView | Kalender.tsx (1225 regels) | Volledige kalender functionaliteit |
| EmbeddedOpvolgingView | Opvolging.tsx (553 regels) | Volledige AI scoring functionaliteit |

Deze componenten bevatten alle functionaliteit ZONDER:
- Auth checks (Dashboard doet dit al)
- Page headers (Dashboard heeft al header)

---

## Onderdeel 3: Sidebar Opruimen (later)

### Bestand: src/components/AppSidebar.tsx

Te verwijderen uit menuGroups (regels 47-57):
- Lijstweergave item
- Kalender item
- Opvolging item

Resulterende "Mijn Werk" sectie:
- Dashboard
- WhatsApp
- Bijlagen
- Notulen

---

## Onderdeel 4: Route Redirects (later)

### Bestand: src/App.tsx

Wijzigen van directe routes naar redirects:

| Huidige Route | Nieuwe Redirect |
|---------------|-----------------|
| `/lijst` → `<Lijst />` | `/lijst` → `/dashboard?tab=lijst` |
| `/kalender` → `<Kalender />` | `/kalender` → `/dashboard?tab=kalender` |
| `/opvolging` → `<Opvolging />` | `/opvolging` → `/dashboard?tab=opvolging` |

Dit zorgt voor backward compatibility met bestaande bookmarks en links.

---

## Onderdeel 5: Cross-Navigatie Links (later)

Componenten die updaten nodig hebben:
- TodayFocusCard
- OverdueTasksList
- UpcomingTasksList
- Andere widgets met navigatie

---

## Uitvoering

We beginnen met **Onderdeel 1** - de Dashboard tabs uitbreiden naar 6 gelijkwaardige tabs.

Dit is veilig omdat:
- Originele pagina's blijven functioneren
- Sidebar links blijven werken
- Geen breaking changes
- Makkelijk te testen

De placeholders in de nieuwe tabs worden in Onderdeel 2 vervangen door de volledige embedded functionaliteit.

---

## Testprotocol na Onderdeel 1

| Test | Verwacht |
|------|----------|
| Open /dashboard | 6 tabs zichtbaar in TabsList |
| Klik elke tab | URL update, content wisselt |
| Sidebar links | Werken nog (naar aparte pagina's) |
| Mobile view | Tabs in 2 rijen van 3 |
| Geen sub-navigatie | Volledig verwijderd |
