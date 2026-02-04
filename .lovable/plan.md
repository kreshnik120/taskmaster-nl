

# Plan: Consistente Medewerker-Avatar Kleuren (Volledige Analyse)

## Overzicht

Na grondig onderzoek van de codebase heb ik **alle componenten** geïdentificeerd die medewerker-avatars tonen. Elke medewerker (huidige én toekomstige) krijgt automatisch een unieke, consistente kleur gebaseerd op hun `user_id` of `assignee_id`.

---

## Hoe Het Werkt

Het systeem gebruikt een **deterministisch hash-algoritme**:

```text
user_id → hashString() → modulo 9 → kleur index (0-8)
```

**Dit betekent:**
- Dezelfde medewerker = altijd dezelfde kleur
- Elke NIEUWE medewerker krijgt automatisch een kleur
- Geen database wijzigingen nodig
- Werkt voor oneindig veel medewerkers (9 kleuren hergebruikt)

---

## Alle Componenten Die Worden Aangepast

Na uitgebreid onderzoek zijn dit **alle 14 bestanden** die medewerker-avatars tonen:

### TAAK-GERELATEERDE COMPONENTEN (7 bestanden)

| # | Component | Locatie | Huidige Styling | Wijziging |
|---|-----------|---------|-----------------|-----------|
| 1 | **TaskCard.tsx** | Regel 80-91, 181-185 | Lokale `getAvatarColor()` (6 kleuren) | Vervang door centrale hook |
| 2 | **EmbeddedListView.tsx** | Regel 1062-1066 | `bg-primary/10` (geen kleur) | Dynamische kleur toevoegen |
| 3 | **TaskListTable.tsx** | Regel 171-174 | Geen styling | Dynamische kleur toevoegen |
| 4 | **TaskListVirtualized.tsx** | Regel 219-222 | Geen styling | Dynamische kleur toevoegen |
| 5 | **TaskListSidePanel.tsx** | Regel 178-181 | Geen styling | Dynamische kleur toevoegen |
| 6 | **AssigneeProgress.tsx** | Regel 94-97 | Geen styling | Dynamische kleur toevoegen |
| 7 | **TaskItem.tsx** | Regel 99-105 | Tekst-only (geen avatar) | Eventueel toevoegen |

### RECRUITMENT COMPONENTEN (5 bestanden)

| # | Component | Locatie | Huidige Styling | Wijziging |
|---|-----------|---------|-----------------|-----------|
| 8 | **ApplicationCard.tsx** | Regel 248-258, 302 | Lokale `getAvatarColor()` (6 kleuren) | Vervang door centrale hook |
| 9 | **RecentClientsWidget.tsx** | Regel 52-63, 123 | Lokale `getAvatarColor()` (6 kleuren) | Vervang door centrale hook |
| 10 | **RecentMovementsWidget.tsx** | Regel 58-69, 126 | Lokale `getAvatarColor()` (6 kleuren) | Vervang door centrale hook |
| 11 | **ApplicationNotes.tsx** | Regel 150-153, 193 | `bg-muted` (geen kleur) | Dynamische kleur toevoegen |
| 12 | **UrgencyBanner.tsx** | Regel 100-103 | `bg-amber-100` (hardcoded) | Optioneel: dynamisch maken |

### OVERIGE COMPONENTEN (2 bestanden)

| # | Component | Locatie | Huidige Styling | Wijziging |
|---|-----------|---------|-----------------|-----------|
| 13 | **AppSidebar.tsx** | Regel 368-369 | Geen styling | Ingelogde gebruiker kleur toevoegen |
| 14 | **WhatsAppContactSearchResults.tsx** | Regel 143-145 | `bg-primary/10` | Optioneel: dynamisch maken |

---

## Stap 1: Uitbreiding van `useAssigneeColor.ts`

De bestaande hook wordt uitgebreid met **avatar-specifieke kleuren**:

**Huidige structuur:**
```text
ASSIGNEE_COLORS = [
  { name: 'red', bg: '...', border: '...', dot: '...' },
]
```

**Nieuwe structuur (+ avatarBg en avatarText):**
```text
ASSIGNEE_COLORS = [
  { 
    name: 'red', 
    bg: 'bg-red-50/40 dark:bg-red-900/20',
    border: 'border-l-red-500/70',
    dot: 'bg-red-500/80',
    avatarBg: 'bg-red-100 dark:bg-red-900/30',        // NIEUW
    avatarText: 'text-red-700 dark:text-red-300'      // NIEUW
  },
  // ... 8 meer kleuren
]
```

| Kleur | Avatar Achtergrond | Avatar Tekst |
|-------|-------------------|--------------|
| Rood | bg-red-100 dark:bg-red-900/30 | text-red-700 dark:text-red-300 |
| Oranje | bg-orange-100 dark:bg-orange-900/30 | text-orange-700 dark:text-orange-300 |
| Amber | bg-amber-100 dark:bg-amber-900/30 | text-amber-700 dark:text-amber-300 |
| Groen | bg-green-100 dark:bg-green-900/30 | text-green-700 dark:text-green-300 |
| Teal | bg-teal-100 dark:bg-teal-900/30 | text-teal-700 dark:text-teal-300 |
| Blauw | bg-blue-100 dark:bg-blue-900/30 | text-blue-700 dark:text-blue-300 |
| Indigo | bg-indigo-100 dark:bg-indigo-900/30 | text-indigo-700 dark:text-indigo-300 |
| Paars | bg-purple-100 dark:bg-purple-900/30 | text-purple-700 dark:text-purple-300 |
| Roze | bg-pink-100 dark:bg-pink-900/30 | text-pink-700 dark:text-pink-300 |

---

## Stap 2: Componentwijzigingen

### PRIORITEIT 1: Taak-gerelateerde componenten

**TaskCard.tsx** (verwijder lokale functie + gebruik hook):
```text
// VERWIJDEREN (regel 80-91):
const getAvatarColor = (name: string) => { ... }

// TOEVOEGEN (import):
import { getAssigneeColor } from "@/hooks/useAssigneeColor";

// WIJZIGEN (regel 183):
- <AvatarFallback className={`text-xs font-medium ${getAvatarColor(assigneeName)}`}>
+ const assigneeColor = getAssigneeColor(task.assignee_id);
+ <AvatarFallback className={`text-xs font-medium ${assigneeColor.avatarBg} ${assigneeColor.avatarText}`}>
```

**EmbeddedListView.tsx** (regel 1062-1066):
```text
// TOEVOEGEN (import):
import { getAssigneeColor } from "@/hooks/useAssigneeColor";

// WIJZIGEN:
- <AvatarFallback className="bg-primary/10 text-xs font-medium">
+ const assigneeColor = getAssigneeColor(task.assignee_id);
+ <AvatarFallback className={`${assigneeColor.avatarBg} ${assigneeColor.avatarText} text-xs font-medium`}>
```

**TaskListTable.tsx** (regel 171-174):
```text
// WIJZIGEN:
- <AvatarFallback className="text-xs">
+ <AvatarFallback className={`text-xs ${getAssigneeColor(task.assignee_id).avatarBg} ${getAssigneeColor(task.assignee_id).avatarText}`}>
```

**TaskListVirtualized.tsx** (regel 219-222):
```text
// Zelfde wijziging als TaskListTable.tsx
```

**TaskListSidePanel.tsx** (regel 178-181):
```text
// Zelfde wijziging als TaskListTable.tsx
```

**AssigneeProgress.tsx** (regel 94-97):
```text
// WIJZIGEN:
- <AvatarFallback className="text-xs">
+ const assigneeColor = getAssigneeColor(assignee.userId);
+ <AvatarFallback className={`text-xs ${assigneeColor.avatarBg} ${assigneeColor.avatarText}`}>
```

### PRIORITEIT 2: Recruitment componenten

**ApplicationCard.tsx** (verwijder lokale functie):
```text
// VERWIJDEREN (regel 248-259):
const getAvatarColor = (name: string) => { ... }

// TOEVOEGEN:
import { getAssigneeColor } from "@/hooks/useAssigneeColor";

// WIJZIGEN (regel 302):
+ const assigneeColor = getAssigneeColor(application.id); // of candidate ID
```

**RecentClientsWidget.tsx** (verwijder lokale functie):
```text
// VERWIJDEREN (regel 52-63):
const getAvatarColor = (name: string) => { ... }

// TOEVOEGEN:
import { getAssigneeColor } from "@/hooks/useAssigneeColor";
```

**RecentMovementsWidget.tsx** (verwijder lokale functie):
```text
// VERWIJDEREN (regel 58-69):
const getAvatarColor = (name: string) => { ... }

// TOEVOEGEN:
import { getAssigneeColor } from "@/hooks/useAssigneeColor";
```

**ApplicationNotes.tsx** (regel 193):
```text
// WIJZIGEN:
- <AvatarFallback className="text-xs bg-muted">
+ <AvatarFallback className={`text-xs ${getAssigneeColor(note.user_id).avatarBg} ${getAssigneeColor(note.user_id).avatarText}`}>
```

### PRIORITEIT 3: Overige componenten

**AppSidebar.tsx** (regel 369):
```text
// WIJZIGEN:
- <AvatarFallback className="text-xs">{initials}</AvatarFallback>
+ const userColor = getAssigneeColor(user.id);
+ <AvatarFallback className={`text-xs ${userColor.avatarBg} ${userColor.avatarText}`}>{initials}</AvatarFallback>
```

---

## Wat WEL en NIET Wordt Aangepast

### WEL (medewerker/gebruiker-gerelateerd):
- Taak-eigenaar avatars
- Dashboard statistieken per medewerker
- Notitie-auteur avatars
- Sidebar gebruiker avatar

### NIET (specifieke business-logica kleuren):
- **ProfessionalCard.tsx** - Kleur gebaseerd op `functie_niveau` (VIG, HBO-V, etc.)
- **ClientDetailModal.tsx** - Kleur gebaseerd op `sector` (zorg, GGZ, etc.)
- **UrgencyBanner.tsx** - Urgentie-indicatie (amber voor urgentie)
- **WhatsAppContactSearchResults.tsx** - Externe contacten, geen medewerkers

---

## Samenvatting Wijzigingen

| Type | Aantal |
|------|--------|
| **Bestanden gewijzigd** | 11 |
| **Lokale functies verwijderd** | 4 (`getAvatarColor` in TaskCard, ApplicationCard, RecentClientsWidget, RecentMovementsWidget) |
| **Nieuwe exports in hook** | 2 velden (`avatarBg`, `avatarText`) |
| **Database wijzigingen** | 0 |

---

## Voordelen

1. **Automatisch voor ALLE medewerkers** - Huidige én toekomstige gebruikers
2. **Consistentie** - Dezelfde persoon = dezelfde kleur in de hele app
3. **Deterministisch** - Gebaseerd op user_id hash, altijd reproduceerbaar
4. **Dark mode support** - Automatisch aangepaste kleuren
5. **Centrale bron** - Eén hook, geen duplicatie
6. **Schaalbaar** - Werkt voor 1 of 1000 medewerkers

---

## Resultaat Na Implementatie

| Locatie | Status |
|---------|--------|
| Kalender taken | ✅ Al geïmplementeerd (vorige sessie) |
| Lijst weergave | 🔄 Wordt toegevoegd |
| Kanban bord | 🔄 Wordt toegevoegd |
| Dashboard stats | 🔄 Wordt toegevoegd |
| Application cards | 🔄 Wordt toegevoegd |
| Notities | 🔄 Wordt toegevoegd |
| Sidebar | 🔄 Wordt toegevoegd |

