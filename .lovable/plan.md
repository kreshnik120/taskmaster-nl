
# Onderdeel 4: Routes Opruimen

## Overzicht

De routes `/lijst`, `/kalender` en `/opvolging` zijn niet meer nodig als standalone pagina's omdat:
1. De functionaliteit is geintegreerd in Dashboard tabs (Onderdeel 2)
2. De sidebar links zijn verwijderd (Onderdeel 3)

Nu verwijderen we de routes en redirecten bezoekers naar de juiste Dashboard tab.

## Wijzigingen

### Bestand: src/App.tsx

#### 1. Imports verwijderen (regels 16-17, 19)

Verwijder deze 3 imports:

```typescript
// VERWIJDEREN:
import Lijst from "./pages/Lijst";      // regel 16
import Kalender from "./pages/Kalender"; // regel 17
import Opvolging from "./pages/Opvolging"; // regel 19
```

#### 2. Routes vervangen door redirects (regels 93-96)

Van standalone routes naar Dashboard tab redirects:

| Oude Route | Nieuwe Redirect |
|------------|-----------------|
| `/lijst` | `/dashboard?tab=lijst` |
| `/kalender` | `/dashboard?tab=kalender` |
| `/opvolging` | `/dashboard?tab=opvolging` |

**Code wijziging:**

```typescript
// VAN:
<Route path="/lijst" element={<Lijst />} />
<Route path="/kalender" element={<Kalender />} />
<Route path="/opvolging" element={<Opvolging />} />

// NAAR:
<Route path="/lijst" element={<Navigate to="/dashboard?tab=lijst" replace />} />
<Route path="/kalender" element={<Navigate to="/dashboard?tab=kalender" replace />} />
<Route path="/opvolging" element={<Navigate to="/dashboard?tab=opvolging" replace />} />
```

## Resultaat na wijziging

### App.tsx Imports (van 22 naar 19)

```text
Behouden:
- UnifiedDashboard, Auth, Bijlagen, Notulen
- Kanban, Tijdregistratie, VerwijderdeTaken, AfgerondeTaken
- AiTraining, Professionals, Sollicitaties, SollicitatiesArchief
- Klanten, Plaatsingen, Gebruikers, NotFound, WhatsApp

Verwijderd:
- Lijst       ✗
- Kalender    ✗
- Opvolging   ✗
```

### Route Gedrag

| URL | Actie |
|-----|-------|
| `/lijst` | Redirect naar `/dashboard?tab=lijst` |
| `/kalender` | Redirect naar `/dashboard?tab=kalender` |
| `/opvolging` | Redirect naar `/dashboard?tab=opvolging` |
| Bookmarks | Blijven werken via redirect |
| Externe links | Blijven werken via redirect |

## Technische Details

| Actie | Regel | Impact |
|-------|-------|--------|
| Remove Lijst import | 16 | Geen runtime impact |
| Remove Kalender import | 17 | Geen runtime impact |
| Remove Opvolging import | 19 | Geen runtime impact |
| Replace /lijst route | 93 | Redirect naar dashboard tab |
| Replace /kalender route | 94 | Redirect naar dashboard tab |
| Replace /opvolging route | 96 | Redirect naar dashboard tab |

## Waarom Redirects ipv Verwijderen?

- **Bookmarks**: Gebruikers met oude bookmarks worden correct doorgestuurd
- **Externe links**: Links in emails of documenten blijven werken
- **SEO**: Zoekmachines volgen de redirect naar nieuwe locatie
- **Gradual migration**: Veilige overgang zonder broken links

## Fase 2 (Later - Niet Nu)

Na bevestiging dat alles werkt, kunnen de page bestanden verwijderd worden:
- `src/pages/Lijst.tsx` (1490 regels)
- `src/pages/Kalender.tsx` (1225 regels)  
- `src/pages/Opvolging.tsx` (553 regels)

**Totaal: ~3268 regels legacy code te verwijderen**

Dit doen we NIET in deze stap om rollback mogelijk te houden.

## Verificatie na implementatie

| Test | Verwacht Resultaat |
|------|-------------------|
| Bezoek `/lijst` | Redirect naar `/dashboard?tab=lijst` |
| Bezoek `/kalender` | Redirect naar `/dashboard?tab=kalender` |
| Bezoek `/opvolging` | Redirect naar `/dashboard?tab=opvolging` |
| Dashboard tabs | Alle 6 tabs functioneel |
| Console | Geen import errors |
| TypeScript | Compileert zonder warnings |

## Bonus: AppSidebar Cleanup

In dezelfde stap ruimen we ook de ongebruikte imports op in `AppSidebar.tsx`:

```typescript
// VERWIJDEREN uit regel 1:
- Home    // niet gebruikt
- Kanban  // niet gebruikt
```
