
# Plan: Beschrijving Historie Verfijning & Deduplicatie

## Probleem Analyse

Op basis van de afbeeldingen en database-analyse:

### Huidige Situatie
| Issue | Detail |
|-------|--------|
| Duplicaten in database | Entries met identieke timestamps komen dubbel voor (bijv. `04:18:29` heeft 2 rijen) |
| Lange lijst | Elke kleine wijziging = aparte rij met "Bekijk wijziging" link |
| Visuele ruis | Veel "Gewijzigd" badges maken de timeline onoverzichtelijk |

### Database Status
```
Task bd9e94dd: 7 description_change entries → 3 zijn duplicaten
```

---

## Oplossing: Drie-Staps Verfijning

### Stap 1: Database Opschoning - Verwijder Duplicaten

**SQL Migratie:**
```sql
-- Verwijder duplicate entries (behoud alleen de eerste per timestamp)
DELETE FROM task_action_history 
WHERE id NOT IN (
  SELECT DISTINCT ON (task_id, created_at, action_type) id
  FROM task_action_history
  WHERE action_type = 'description_change'
  ORDER BY task_id, created_at, action_type, id
) AND action_type = 'description_change';
```

### Stap 2: UI Verfijning - Wijzigingen Groeperen

**Bestand:** `src/components/DescriptionTimeline.tsx`

**Concept:** Wijzigingen binnen 5 minuten van dezelfde gebruiker samenvoegen tot één item

```text
VOOR:
┌─────────────────────────────────────────────┐
│ ⏱ 6 feb om 05:18 • Kreshnik    [Gewijzigd] │
│   Bekijk wijziging                          │
├─────────────────────────────────────────────┤
│ ⏱ 6 feb om 05:18 • Kreshnik    [Gewijzigd] │
│   Bekijk wijziging                          │
├─────────────────────────────────────────────┤
│ ⏱ 6 feb om 05:18 • Kreshnik    [Gewijzigd] │
│   Bekijk wijziging                          │
└─────────────────────────────────────────────┘

NA (Gegroepeerd):
┌─────────────────────────────────────────────┐
│ ⏱ 6 feb om 05:18 • Kreshnik                │
│   3 wijzigingen               [Bekijk alle] │
└─────────────────────────────────────────────┘
```

**Logica toevoegen:**
- Groepeer entries binnen 5 minuten van dezelfde `created_by_name`
- Toon alleen de eerste en laatste staat (begin→eind)
- Badge toont aantal wijzigingen in de groep
- Klik opent detail dialog met volledige diff

### Stap 3: Compactere Weergave

**Wijzigingen:**
1. Verwijder individuele "Bekijk wijziging" links voor gegroepeerde items
2. Voeg collapse/expand toe voor lange historie (max 3 items standaard, "+X meer" knop)
3. Smaller timeline design met minder padding

---

## Technische Implementatie

### Database Migratie
| Actie | SQL |
|-------|-----|
| Verwijder duplicaten | `DELETE WHERE id NOT IN (SELECT DISTINCT ON...)` |
| Voeg dedup check toe aan trigger | `IF NOT EXISTS (SELECT ... WHERE created_at > NOW() - INTERVAL '5 seconds')` |

### Code Wijzigingen

**Bestand: `src/components/DescriptionTimeline.tsx`**

| Wijziging | Regels (ca.) |
|-----------|--------------|
| Nieuwe `groupEntries()` functie | 120-160 |
| Bijgewerkte render voor groepen | 247-340 |
| Collapse/expand state | 66-70 |
| Nieuwe GroupedEntryView component | 180-220 |

---

## Verwacht Resultaat

| Scenario | Voor | Na |
|----------|------|-----|
| 7 wijzigingen | 7 losse rijen | 2-3 gegroepeerde items |
| Duplicaten | Zichtbaar | Verwijderd |
| Visuele impact | Overweldigend | Compact & overzichtelijk |

---

## Implementatie Volgorde

1. **Database migratie** - Verwijder bestaande duplicaten
2. **Trigger update** - Voorkom toekomstige duplicaten met 5-seconden check
3. **DescriptionTimeline.tsx** - Voeg groepering toe
4. **UI polish** - Collapse/expand en compactere stijl
