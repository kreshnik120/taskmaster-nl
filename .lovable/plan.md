
# Stapsgewijs Implementatieplan: Navigatie Herstructurering

## Expert Panel Validatie
Dit plan is opgesteld door een multi-disciplinair expert panel:
- **UX Architect** - Navigatiepatronen en gebruikerservaring
- **Frontend Engineer** - Component architectuur en state management
- **QA Specialist** - Testprotocollen en regressiepreventie
- **Performance Engineer** - Bundle optimalisatie en lazy loading

---

## Overzicht: 5 Gefaseerde Onderdelen

| Onderdeel | Beschrijving | Risico | Afhankelijkheden |
|-----------|--------------|--------|------------------|
| **1** | Sub-view switcher toevoegen aan Dashboard | Laag | Geen |
| **2** | Embedded views maken (Lijst, Kalender, Opvolging) | Medium | Onderdeel 1 |
| **3** | Sidebar vereenvoudigen | Laag | Onderdeel 2 |
| **4** | Route redirects implementeren | Laag | Onderdeel 3 |
| **5** | Cross-navigatie links updaten | Laag | Onderdeel 4 |

**Regel:** Elk onderdeel wordt volledig afgerond en getest voordat het volgende begint.

---

# ONDERDEEL 1: Sub-View Switcher in Dashboard

## 1.1 Doel
Een view-switcher toevoegen in de "Mijn Werk" tab waarmee gebruikers kunnen schakelen tussen:
- **Focus** (huidige content)
- **Lijst** (later embedded)
- **Kalender** (later embedded)  
- **Opvolging** (later embedded)

## 1.2 Te Wijzigen Bestanden

| Bestand | Wijziging | Regels |
|---------|-----------|--------|
| `src/pages/UnifiedDashboard.tsx` | View state + ToggleGroup UI | +40 regels |

## 1.3 Technische Specificaties

**Nieuwe state variabele:**
```text
mijnWerkView: 'focus' | 'lijst' | 'kalender' | 'opvolging'
```

**URL parameter ondersteuning:**
```text
/dashboard?tab=mijn-werk&view=lijst
```

**UI Component:**
- Desktop: `ToggleGroup` (4 knoppen naast elkaar)
- Mobile: `Select` dropdown (voorkomt overflow)

## 1.4 Koppelingen Checklist

| Koppeling | Status | Impact |
|-----------|--------|--------|
| URL params (`searchParams`) | Al aanwezig | Uitbreiden met `view` |
| Tab state | Al aanwezig | Geen wijziging |
| Realtime subscriptions | Bestaande blijven | Geen impact |
| Keyboard shortcuts | Nieuwe `/` en `n` | Alleen in focus view |

## 1.5 Testprotocol Onderdeel 1

| Test | Verwacht Resultaat |
|------|-------------------|
| Open `/dashboard?tab=mijn-werk` | Focus view getoond |
| Open `/dashboard?tab=mijn-werk&view=lijst` | Lijst placeholder getoond |
| Klik op Kalender toggle | View wisselt, URL update |
| Refresh pagina | Geselecteerde view blijft |
| Mobile viewport (375px) | Dropdown i.p.v. buttons |

## 1.6 Rollback Procedure
Verwijder de toegevoegde state en ToggleGroup. Geen database wijzigingen.

---

# ONDERDEEL 2: Embedded Views Maken

## 2.1 Doel
Herbruikbare versies maken van Lijst, Kalender en Opvolging die in de Dashboard kunnen worden geëmbed.

## 2.2 Te Maken Bestanden

| Nieuw Bestand | Bron | Belangrijkste Wijzigingen |
|---------------|------|---------------------------|
| `src/components/dashboard/EmbeddedListView.tsx` | `Lijst.tsx` | Auth check verwijderen, height constraint, geen page header |
| `src/components/dashboard/EmbeddedCalendarView.tsx` | `Kalender.tsx` | Auth check verwijderen, compactere KPIs |
| `src/components/dashboard/EmbeddedOpvolgingView.tsx` | `Opvolging.tsx` | Auth check verwijderen, compactere layout |

## 2.3 Technische Specificaties

**Lazy loading (VERPLICHT):**
```text
const EmbeddedListView = lazy(() => import('./EmbeddedListView'));
```

**Shared hooks (GEEN duplicatie):**
- `useTasksQuery` - Al gedeeld met Dashboard
- `useGlobalTaskFilter` - Al gedeeld
- `useActiveTimers` - Import behouden
- `useAiScoring` - Alleen voor Opvolging

**Height constraint:**
```text
max-height: calc(100vh - 300px)
overflow-y: auto
```

## 2.4 Koppelingen Checklist Onderdeel 2

| Koppeling | Bron Bestand | Actie |
|-----------|--------------|-------|
| `navigate("/auth")` | Lijst:186, Kalender:322 | VERWIJDEREN (Dashboard heeft auth) |
| `navigate("/lijst")` | Intern | BEHOUDEN of wijzigen naar view switch |
| Realtime channels | Alle 3 | CONSOLIDEREN naar 1 channel |
| URL params `?task=` | Lijst:132-143 | BEHOUDEN (deeplinks) |
| Keyboard `/` en `n` | Lijst:685-755, Kalender:231 | Conflict checken |

## 2.5 Keyboard Shortcut Conflictanalyse

| Shortcut | Huidige Binding | Conflict? |
|----------|-----------------|-----------|
| `n` | Nieuwe taak (Lijst, MyTasksFlow) | Nee - zelfde functie |
| `/` | Zoeken (Lijst, MyTasksFlow) | Nee - zelfde functie |
| `Escape` | Filter reset (Opvolging) | Nee - filter-specifiek |

**Conclusie:** Geen conflicten, shortcuts kunnen naast elkaar bestaan.

## 2.6 Testprotocol Onderdeel 2

| Test | Verwacht Resultaat |
|------|-------------------|
| Switch naar Lijst view | Component laadt (spinner zichtbaar) |
| Bulk selectie in Lijst | Werkt zoals standalone |
| Kalender dag klikken | TaskDialog opent |
| Opvolging AI scores | Laden en tonen correct |
| Memory check (DevTools) | Geen memory leaks bij view switch |
| Auth check | Geen redirect naar `/auth` |

## 2.7 Rollback Procedure
Verwijder de 3 nieuwe bestanden. Dashboard valt terug op placeholders.

---

# ONDERDEEL 3: Sidebar Vereenvoudigen

## 3.1 Doel
Sidebar items verwijderen die nu in Dashboard zitten.

## 3.2 Te Wijzigen Bestanden

| Bestand | Wijziging | Regels |
|---------|-----------|--------|
| `src/components/AppSidebar.tsx` | Menu items verwijderen | 47-57 |

## 3.3 Items om te Verwijderen

| Item | Huidige URL | Nieuwe Locatie |
|------|-------------|----------------|
| Lijstweergave | `/lijst` | Dashboard > Mijn Werk > Lijst |
| Kalender | `/kalender` | Dashboard > Mijn Werk > Kalender |
| Opvolging | `/opvolging` | Dashboard > Mijn Werk > Opvolging |

## 3.4 Items die BLIJVEN

| Item | URL | Reden |
|------|-----|-------|
| Dashboard | `/dashboard` | Primaire entry |
| WhatsApp | `/whatsapp` | Ander paradigma (chat) |
| Bijlagen | `/bijlagen` | Document management |
| Notulen | `/notulen` | Specifieke workflow |
| Recruitment sectie | `/sollicitaties` etc. | Ongewijzigd |

## 3.5 Nieuwe Sidebar Structuur

```text
┌─────────────────────────────────────┐
│ MIJN WERK                           │
│ ├── Dashboard        [47]          │
│ ├── WhatsApp         [33]          │
│ ├── Bijlagen                       │
│ └── Notulen          [2]           │
├─────────────────────────────────────┤
│ RECRUITMENT                         │
│ ├── Sollicitaties                  │
│ ├── Professionals                  │
│ ├── Klanten                        │
│ └── Plaatsingen                    │
├─────────────────────────────────────┤
│ ANALYSE & AI (admin)               │
├─────────────────────────────────────┤
│ ARCHIEF                            │
└─────────────────────────────────────┘
```

## 3.6 Testprotocol Onderdeel 3

| Test | Verwacht Resultaat |
|------|-------------------|
| Sidebar openen | 3 items minder (Lijst, Kalender, Opvolging) |
| Klik Dashboard | Gaat naar Dashboard met Mijn Werk tab |
| Klik WhatsApp | Gaat naar WhatsApp pagina |
| Badge counts | Dashboard badge toont nog steeds taken count |

## 3.7 Rollback Procedure
Herstel de menuGroups array naar originele waarden.

---

# ONDERDEEL 4: Route Redirects

## 4.1 Doel
Oude URLs laten doorverwijzen naar Dashboard met juiste view.

## 4.2 Te Wijzigen Bestanden

| Bestand | Wijziging | Regels |
|---------|-----------|--------|
| `src/App.tsx` | Redirect routes toevoegen | 93-96 |

## 4.3 Redirect Mapping

| Oude Route | Nieuwe Route | Methode |
|------------|--------------|---------|
| `/lijst` | `/dashboard?tab=mijn-werk&view=lijst` | `Navigate replace` |
| `/lijst?task=xyz` | `/dashboard?tab=mijn-werk&view=lijst&taskId=xyz` | Met params |
| `/kalender` | `/dashboard?tab=mijn-werk&view=kalender` | `Navigate replace` |
| `/opvolging` | `/dashboard?tab=mijn-werk&view=opvolging` | `Navigate replace` |

## 4.4 Koppelingen die Geraakt Worden

| Bestand | Regel | Huidige | Actie |
|---------|-------|---------|-------|
| `TodayFocusCard.tsx` | 144 | `navigate("/lijst")` | Wordt door redirect afgevangen |
| `NotificationBell.tsx` | 32 | `navigate("/lijst?task=...")` | Params blijven werken |
| `AssigneeProgress.tsx` | 20 | `/lijst?assignee=...` | Update naar dashboard |
| `OverdueTasksList.tsx` | 107 | `/lijst?filter=overdue` | Update naar dashboard |
| `UpcomingTasksList.tsx` | 115 | `/kalender` | Wordt door redirect afgevangen |
| `ApplicationDetailModal.tsx` | 2047 | `window.location.href` | Update naar dashboard |

## 4.5 Testprotocol Onderdeel 4

| Test | Verwacht Resultaat |
|------|-------------------|
| Navigeer naar `/lijst` | Redirect naar `/dashboard?tab=mijn-werk&view=lijst` |
| Bookmark `/kalender` | Werkt nog, redirect naar dashboard |
| Notificatie klik met taskId | Opent Dashboard met task modal |
| Browser history | Geen `/lijst` entries (replace) |

## 4.6 Rollback Procedure
Verwijder Navigate routes, herstel originele Route paths.

---

# ONDERDEEL 5: Cross-Navigatie Links Updaten

## 5.1 Doel
Alle interne links die nog naar `/lijst`, `/kalender`, `/opvolging` wijzen updaten naar de nieuwe Dashboard routes.

## 5.2 Te Wijzigen Bestanden

| Bestand | Regel | Oude Link | Nieuwe Link |
|---------|-------|-----------|-------------|
| `TodayFocusCard.tsx` | 144 | `/lijst` | `/dashboard?tab=mijn-werk&view=lijst` |
| `AssigneeProgress.tsx` | 20 | `/lijst?assignee=` | `/dashboard?tab=mijn-werk&view=lijst&assignee=` |
| `OverdueTasksList.tsx` | 107 | `/lijst?filter=overdue` | `/dashboard?tab=mijn-werk&view=lijst&filter=overdue` |
| `UpcomingTasksList.tsx` | 115 | `/kalender` | `/dashboard?tab=mijn-werk&view=kalender` |
| `ApplicationDetailModal.tsx` | 2047 | `/lijst?task=` | `/dashboard?tab=mijn-werk&taskId=` |

## 5.3 AI Assistant Updates

| Bestand | Sectie | Wijziging |
|---------|--------|-----------|
| `ChatWidget.tsx` | PAGE_CONTEXTS | Update kalender, opvolging, lijstweergave entries |
| `agentIntents.ts` | PAGE_AGENT_CONFIG | Update route mapping |

## 5.4 Testprotocol Onderdeel 5

| Test | Verwacht Resultaat |
|------|-------------------|
| Klik "Bekijk taken" in TodayFocusCard | Dashboard Lijst view opent |
| Klik assignee in Team Overzicht | Dashboard met filter opent |
| Klik overdue task link | Dashboard met filter opent |
| AI Assistant op Dashboard | Correcte page context |

## 5.5 Rollback Procedure
Herstel originele URLs in alle gewijzigde bestanden.

---

# Implementatievolgorde en Afhankelijkheden

```text
                    ┌─────────────────┐
                    │  ONDERDEEL 1    │
                    │  View Switcher  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  ONDERDEEL 2    │
                    │ Embedded Views  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  ONDERDEEL 3    │
                    │ Sidebar Update  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  ONDERDEEL 4    │
                    │ Route Redirects │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  ONDERDEEL 5    │
                    │ Link Updates    │
                    └─────────────────┘
```

---

# Samenvatting Strenge Regels

| Regel | Beschrijving |
|-------|--------------|
| **1** | Onderdeel pas starten als vorige 100% getest is |
| **2** | Elke wijziging documenteren met regel nummers |
| **3** | Geen database migraties nodig - puur frontend |
| **4** | Lazy loading VERPLICHT voor embedded views |
| **5** | URL backward compatibility via redirects |
| **6** | Auth checks NIET dupliceren (Dashboard doet dit al) |
| **7** | Rollback procedure klaar hebben per onderdeel |

---

# Start: Onderdeel 1

**Wanneer u dit plan goedkeurt, begin ik met Onderdeel 1:**
1. View state toevoegen aan UnifiedDashboard.tsx
2. ToggleGroup UI maken voor desktop
3. Select dropdown voor mobile
4. URL parameter `view` ondersteuning
5. Placeholder content voor toekomstige views

**Na voltooiing toon ik een testrapport voordat we naar Onderdeel 2 gaan.**
