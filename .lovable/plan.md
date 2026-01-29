
# Hernoem Team Tab Header van "Dashboard" naar "Overzicht"

## Probleem

Wanneer gebruikers op de **"Team Overzicht" tab** klikken in het Dashboard, zien ze binnen die tab een header component die opnieuw **"Dashboard"** als titel toont. Dit veroorzaakt verwarring omdat:

| Locatie | Huidige tekst | Verwarring |
|---------|---------------|------------|
| Sidebar menu | Dashboard | Correcte naam voor hoofdnavigatie |
| Pagina header | Dashboard | Dubbel, maar acceptabel |
| Team tab header | **Dashboard** | Verwarrend - we zijn in Team Overzicht |

## Oplossing

Wijzig de titel in de `DashboardHeader` component van "Dashboard" naar "Overzicht".

## Technische Wijziging

| Bestand | Regel | Van | Naar |
|---------|-------|-----|------|
| `src/components/dashboard-stats/DashboardHeader.tsx` | 25 | `Dashboard` | `Overzicht` |
| `src/components/dashboard-stats/DashboardHeader.tsx` | 26-27 | `Overzicht van alle taken en voortgang` | `Team statistieken en voortgang` |
| `src/components/dashboard-stats/DashboardHeader.tsx` | 15 | `"Dashboard vernieuwd"` | `"Statistieken vernieuwd"` |

### Code wijziging:

```typescript
// Huidige code (regel 24-29):
<div>
  <h1 className="text-2xl font-bold">Dashboard</h1>
  <p className="text-sm text-muted-foreground">
    Overzicht van alle taken en voortgang
  </p>
</div>

// Nieuwe code:
<div>
  <h1 className="text-2xl font-bold">Overzicht</h1>
  <p className="text-sm text-muted-foreground">
    Team statistieken en voortgang
  </p>
</div>
```

## Visueel Resultaat

**Voor:**
```
Dashboard (pagina)
├── Tab: Mijn Werk
├── Tab: Team Overzicht
│   └── Header: "Dashboard"  ← VERWARREND
└── Tab: Recruitment
```

**Na:**
```
Dashboard (pagina)
├── Tab: Mijn Werk
├── Tab: Team Overzicht
│   └── Header: "Overzicht"  ← DUIDELIJK
└── Tab: Recruitment
```

## Impact

| Onderdeel | Status |
|-----------|--------|
| Sidebar "Dashboard" menu item | Ongewijzigd |
| Pagina header "Dashboard" | Ongewijzigd |
| Team tab header | Gewijzigd naar "Overzicht" |
| Routes/navigatie | Ongewijzigd |
| Toast melding | Aangepast naar "Statistieken vernieuwd" |
