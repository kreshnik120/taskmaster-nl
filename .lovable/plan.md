

# Bugfix: Beschrijving Opslaan & Refresh Problemen

## Geanalyseerde Problemen

Na grondige analyse van de code en network requests heb ik **4 root causes** geïdentificeerd:

### Probleem 1: Dubbele Save Requests ✅
De network logs tonen 2x dezelfde PATCH request op exact hetzelfde moment:
```
Request: PATCH .../tasks?id=eq.bd9e94dd... Time: 04:23:07
Request: PATCH .../tasks?id=eq.bd9e94dd... Time: 04:23:07
```

**Oorzaak:** De auto-save timer (2 sec) wordt NIET geannuleerd wanneer je op "Opslaan" klikt.

| Code locatie | Probleem |
|--------------|----------|
| Regel 61-63 | Auto-save start timer |
| Regel 177 | Handmatige klik roept `handleSave()` aan |
| Regel 73 | Check `!hasChanges` faalt omdat state nog niet bijgewerkt is |

### Probleem 2: Beschrijving "Eronder" Weergave
`DescriptionWithDiff.tsx` toont recente wijzigingen als **apart blok onder de tekst** (regels 165-199). Dit is visuele feedback, maar:
- Na opslaan wordt `latestDescriptionChange` niet bijgewerkt
- De diff berekening gebruikt de oude `metadata.old_description` vs de nieuwe tekst
- Dit creëert een "connector" + blok onder de bestaande tekst

### Probleem 3: "Kan niet meer opslaan drukken"
Na eerste save:
1. `isSaving` wordt `false` (regel 100)
2. `hasChanges` wordt NIET gereset → blijft `true` van originele vergelijking
3. Effect op regel 49-51 berekent opnieuw: `value !== description` 
4. Maar `description` prop is nog de OUDE waarde → `hasChanges = false` → knop disabled

### Probleem 4: localDescription synchroniseert niet met DescriptionWithDiff
- `localDescription` wordt gezet na save
- Maar `latestDescriptionChange` komt van `DescriptionTimeline` die niet ververst

---

## Oplossingsplan

### Fix 1: Cancel Auto-Save Timer bij Handmatige Save

**Bestand:** `src/components/InlineDescriptionEditor.tsx`

**Wijziging:** In `handleSave()` functie, voeg timer cancel toe:

```typescript
const handleSave = async () => {
  // NIEUW: Cancel pending auto-save
  if (saveTimeoutRef.current) {
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = null;
  }
  
  if (!hasChanges || isSaving) return;
  // ... rest blijft hetzelfde
};
```

### Fix 2: Reset hasChanges na Succesvolle Save

**Bestand:** `src/components/InlineDescriptionEditor.tsx`

**Wijziging:** Na succesvolle save, update de interne "original" waarde zodat `hasChanges` correct is:

```typescript
// Voeg toe na setIsSaving(true):
const originalValue = useRef(description || "");

// In handleSave success:
originalValue.current = savedValue; // Update reference
setHasChanges(false); // Expliciet reset
```

### Fix 3: Force Refresh van DescriptionTimeline na Save

**Bestand:** `src/components/TaskDetailModal.tsx`

**Wijziging:** Voeg een refresh trigger toe voor de timeline:

```typescript
const [descriptionVersion, setDescriptionVersion] = useState(0);

// In onSaved callback:
onSaved={(newDescription) => {
  setLocalDescription(newDescription || null);
  setDescriptionVersion(v => v + 1); // Force timeline refresh
  setIsEditingDescription(false);
  onTaskUpdated();
}}
```

**En in DescriptionTimeline:**
```typescript
<DescriptionTimeline 
  taskId={task.id}
  key={descriptionVersion} // Force remount op save
  onCountChange={setDescriptionHistoryCount}
  ...
/>
```

### Fix 4: Clear latestDescriptionChange tijdens Editing

**Bestand:** `src/components/TaskDetailModal.tsx`

**Wijziging:** Reset de highlight wanneer de gebruiker begint met editen:

```typescript
onClick={() => {
  if (!isEditingDescription) {
    setLatestDescriptionChange(null); // Clear stale highlight
    setIsEditingDescription(true);
  }
}}
```

---

## Technische Wijzigingen Samenvatting

| Bestand | Actie | Regels |
|---------|-------|--------|
| `InlineDescriptionEditor.tsx` | Cancel timer + reset hasChanges | 72-75, 90-92 |
| `TaskDetailModal.tsx` | Add version state + clear highlight | 148, 1120, 1127 |

---

## Verwacht Resultaat

Na implementatie:

| Scenario | Gedrag |
|----------|--------|
| Klik op "Opslaan" | 1x PATCH request, geen dubbele |
| Na opslaan | Nieuwe tekst direct zichtbaar, geen "eronder" |
| Opnieuw editen | Knop "Opslaan" werkt correct |
| Refresh | Beschrijving blijft correct |

---

## Database Status

De duplicate trigger `log_task_description_trigger` is al verwijderd via de vorige migratie. ✅

