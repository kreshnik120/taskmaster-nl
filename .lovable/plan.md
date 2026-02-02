
# Tab Volgorde Wijziging - Workflow-focused (Optie A)

## Overzicht

De tabvolgorde wordt aangepast naar een logische workflow: van persoonlijk werk → dagelijkse planning → detail views → team/organisatie overzichten.

---

## Huidige vs Nieuwe Volgorde

| Positie | Huidig | Nieuw |
|---------|--------|-------|
| 1 | Mijn Werk | Mijn Werk |
| 2 | Team | Kalender |
| 3 | Recruitment | Lijst |
| 4 | Lijst | Opvolging |
| 5 | Kalender | Team |
| 6 | Opvolging | Recruitment |

---

## Rationale

```text
┌─────────────┐   ┌──────────────┐   ┌───────────┐   ┌────────────┐   ┌────────┐   ┌─────────────┐
│  Mijn Werk  │ → │   Kalender   │ → │   Lijst   │ → │ Opvolging  │ → │  Team  │ → │ Recruitment │
│  (Start)    │   │  (Planning)  │   │ (Details) │   │   (AI/KPI) │   │(Overzicht)│ │   (KPI)     │
└─────────────┘   └──────────────┘   └───────────┘   └────────────┘   └────────┘   └─────────────┘
     ↓                  ↓                 ↓                ↓              ↓              ↓
  Dagelijkse       Wat staat er      Alle taken      Follow-up &      Team          Recruitment
   focus &          gepland?          in detail       prioriteiten   prestaties      pipeline
  reminders
```

**Workflow logica:**
1. **Mijn Werk** - Start van de dag: wat moet ik doen?
2. **Kalender** - Planning bekijken: wanneer moet ik het doen?
3. **Lijst** - Alle taken filteren en zoeken
4. **Opvolging** - AI-suggesties en follow-up prioriteiten
5. **Team** - Hoe presteert het team?
6. **Recruitment** - Organisatie-brede KPIs

---

## Technische Wijzigingen

### Bestand: `src/pages/UnifiedDashboard.tsx`

**Wijziging 1: TabsTrigger volgorde (regel 124-145)**

Huidige volgorde in TabsList:
```typescript
<TabsTrigger value="mijn-werk">...</TabsTrigger>
<TabsTrigger value="team">...</TabsTrigger>
<TabsTrigger value="recruitment">...</TabsTrigger>
<TabsTrigger value="lijst">...</TabsTrigger>
<TabsTrigger value="kalender">...</TabsTrigger>
<TabsTrigger value="opvolging">...</TabsTrigger>
```

Nieuwe volgorde:
```typescript
<TabsTrigger value="mijn-werk">...</TabsTrigger>
<TabsTrigger value="kalender">...</TabsTrigger>
<TabsTrigger value="lijst">...</TabsTrigger>
<TabsTrigger value="opvolging">...</TabsTrigger>
<TabsTrigger value="team">...</TabsTrigger>
<TabsTrigger value="recruitment">...</TabsTrigger>
```

**Wijziging 2: TabsContent volgorde (regel 147-210)**

De TabsContent blokken worden in dezelfde volgorde gezet voor code consistentie (functioneel maakt dit geen verschil, maar het verbetert leesbaarheid).

---

## Impact

| Aspect | Impact |
|--------|--------|
| URL parameters | Geen wijziging - `?tab=team` blijft werken |
| Deeplinks | Geen wijziging - alle tab values blijven gelijk |
| User role logic | Geen wijziging - `getDefaultTab()` blijft correct |
| Mobile weergave | Werkt automatisch mee |

---

## Verificatie

Na implementatie:
1. Controleer visuele volgorde van tabs
2. Test navigatie tussen alle 6 tabs
3. Verifieer dat URL parameters correct blijven werken
4. Test op mobiel (tabs moeten responsive blijven)
