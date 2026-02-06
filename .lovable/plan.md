

# Bugfix: Description Opslaan en Continuous Refresh

## Geïdentificeerde Problemen

### Probleem 1: Dubbele Database Entries
Er zijn **twee triggers** op de `tasks` tabel die dezelfde functie `log_task_description_change` aanroepen:

| Trigger Naam | Status |
|--------------|--------|
| `log_task_description_change` | Actief |
| `log_task_description_trigger` | Actief (DUPLICAAT) |

Dit veroorzaakt dat elke beschrijvingswijziging **2x wordt opgeslagen** in de history.

### Probleem 2: UI Update na Opslaan
Na het opslaan van een beschrijving:
1. `InlineDescriptionEditor` roept `onSaved()` aan
2. Dit sluit de editor (`setIsEditingDescription(false)`)
3. `onTaskUpdated()` wordt aangeroepen, maar de `task` prop in TaskDetailModal wordt NIET vernieuwd
4. De oude beschrijving blijft zichtbaar tot een volledige pagina-refresh

### Probleem 3: Continuous Refresh
- De dubbele database inserts triggeren de realtime subscription meerdere keren
- Dit veroorzaakt cascade-invalidaties in de query cache

---

## Oplossing

### Stap 1: Verwijder Dubbele Trigger
**Database migratie** om de duplicate trigger te verwijderen:

```sql
DROP TRIGGER IF EXISTS log_task_description_trigger ON public.tasks;
```

### Stap 2: Lokale Task State in TaskDetailModal
Voeg een lokale state toe om de task description bij te werken na opslaan, zodat de UI direct de nieuwe waarde toont zonder te wachten op cache invalidatie.

**Wijziging in `TaskDetailModal.tsx`:**
- Voeg `localDescription` state toe
- Update deze state wanneer de description wordt opgeslagen
- Gebruik deze state voor weergave in plaats van `task.description`

### Stap 3: Directe Cache Update (Optioneel)
Als alternatief voor lokale state, kunnen we de TanStack Query cache direct updaten na opslaan via `queryClient.setQueryData`.

---

## Technische Details

### Database Migratie
**Nieuw bestand:** Migration om dubbele trigger te verwijderen

```sql
-- Verwijder de duplicate trigger die dubbele inserts veroorzaakt
DROP TRIGGER IF EXISTS log_task_description_trigger ON public.tasks;
```

### Code Wijzigingen

**Bestand:** `src/components/TaskDetailModal.tsx`

Toevoegen van lokale beschrijving state:
- Nieuwe state: `localDescription`
- Synchroniseer met `task.description` wanneer task verandert
- Update na succesvolle save in `onSaved` callback

**Bestand:** `src/components/InlineDescriptionEditor.tsx`

Aanpassing van de `onSaved` callback om de nieuwe beschrijving door te geven:
- Wijzig `onSaved: () => void` naar `onSaved: (newDescription: string) => void`

---

## Verwacht Resultaat

Na deze fix:
1. Beschrijvingen worden **1x opgeslagen** (niet dubbel)
2. Na opslaan is de nieuwe tekst **direct zichtbaar** in de UI
3. Geen continuous refresh meer door cascade-triggers
4. Realtime sync blijft werken voor updates van andere gebruikers

