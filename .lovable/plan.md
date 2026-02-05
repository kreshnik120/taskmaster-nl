
# Fix: Ontbrekende "Mijn Taken / Alle Taken" Toggle in Lijstweergave

## Probleem Samenvatting

Leonie ziet correct maar 1 taak omdat:
1. De filter `showOnlyMyTasks` staat standaard op **TRUE**
2. Er is maar **1 taak aan haar toegewezen** in de database
3. De EmbeddedListView **mist de toggle** om naar "Alle Taken" te wisselen

Dit is **geen data probleem** - het is een **ontbrekende UI-functie**.

---

## Database Verificatie

| Metriek | Waarde |
|---------|--------|
| Totaal actieve taken | 52 |
| Taken toegewezen aan Leonie | 1 |
| Subtaken toegewezen aan Leonie | 1 |
| Filter `showOnlyMyTasks` | true (standaard) |

---

## Vergelijking met andere Views

| Component | "Mijn/Alle" Toggle | Status |
|-----------|-------------------|--------|
| EmbeddedCalendarView | Ja (regels 620-641) | Werkt |
| MyTasksFlowSection | N.v.t. (altijd mijn taken) | OK |
| **EmbeddedListView** | **NEE - ONTBREEKT** | **BUG** |

---

## Oplossing

### Wijziging: Voeg toggle toe aan EmbeddedListView.tsx

Voeg de "Mijn taken / Alle taken" toggle toe in de header sectie, exact zoals EmbeddedCalendarView dat doet.

**Locatie**: Na de filter sectie (rond regel 698), vóór de KPI cards

**Toe te voegen code**:

```text
// Voeg deze imports toe aan het begin:
import { Users } from "lucide-react";

// Voeg de toggle toe in de header sectie:
<div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
  <Button 
    variant={showOnlyMyTasks ? "default" : "ghost"} 
    size="sm"
    onClick={() => setShowOnlyMyTasks(true)}
    className="gap-1.5 h-8 px-3 text-sm"
  >
    <User className="h-3.5 w-3.5" />
    <span className="hidden sm:inline">Mijn taken</span>
  </Button>
  <Button 
    variant={!showOnlyMyTasks ? "default" : "ghost"} 
    size="sm"
    onClick={() => setShowOnlyMyTasks(false)}
    className="gap-1.5 h-8 px-3 text-sm"
  >
    <Users className="h-3.5 w-3.5" />
    <span className="hidden sm:inline">Alle taken</span>
  </Button>
</div>
```

---

## Implementatie Details

### Stap 1: Import toevoegen

Voeg `Users` icon toe aan de bestaande lucide-react imports (regel 13).

### Stap 2: Toggle UI toevoegen

Plaats de toggle in de header sectie, vóór de filters maar na de tekst "X taken • X hoge prioriteit".

**Exacte locatie**: Tussen regels 618-619 (na de `</div>` van de header tekst, vóór de search bar).

Alternatief: Naast de KPI cards op dezelfde rij, rechts uitgelijnd.

### Stap 3: Layout aanpassen

Zorg dat de toggle responsive is:
- Desktop: "Mijn taken" / "Alle taken" met tekst
- Mobiel: Alleen icons (User / Users)

---

## Verwacht Resultaat

Na deze fix kan Leonie:

1. ✅ De toggle zien in de Lijstweergave
2. ✅ Klikken op "Alle taken" om alle 52 taken te zien
3. ✅ Terugschakelen naar "Mijn taken" voor haar persoonlijke view
4. ✅ Consistente ervaring met de Kalenderweergave

---

## Impact

| Aspect | Vóór | Na |
|--------|------|-----|
| Toggle zichtbaar in Lijst | Nee | Ja |
| Leonie kan alle taken zien | Nee | Ja |
| Consistentie met Kalender | Nee | Ja |
| UX voor alle gebruikers | Beperkt | Volledig |

---

## Technische Samenvatting

- **Bestand**: `src/components/dashboard/EmbeddedListView.tsx`
- **Wijziging**: Toggle UI toevoegen + Users icon import
- **Risico**: Laag (bestaande hook werkt al correct)
- **Test**: Login als Leonie, verificeer toggle werkt
