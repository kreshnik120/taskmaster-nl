

# Zoekfunctie toevoegen aan Afgeronde & Verwijderde Taken pagina's

## Probleem
Beide pagina's (`AfgerondeTaken.tsx` en `VerwijderdeTaken.tsx`) tonen lijsten met taken maar hebben geen zoekfunctie. Bij veel taken is het moeilijk om een specifieke taak terug te vinden.

## Oplossing
Een zoekbalk toevoegen bovenaan beide pagina's die client-side filtert op taaknaam en organisatienaam.

## Wijzigingen

### Bestand 1: `src/pages/AfgerondeTaken.tsx`
- State toevoegen: `searchQuery` + `useDebouncedValue` hook
- Zoekbalk (Input met Search icon) plaatsen boven de tabs/tabel
- `tasks` filteren op `title` en `organizations.name` (case-insensitive) voordat ze gerenderd worden
- Bestaande `onTimeTasks`/`lateTasks` splits passen zich automatisch aan

### Bestand 2: `src/pages/VerwijderdeTaken.tsx`
- Zelfde aanpak: `searchQuery` state + debounce + Input met Search icon
- Filter op `title` en `organizations.name` voordat de tabel gerenderd wordt

Beide gebruiken de bestaande `useDebouncedValue` hook (al aanwezig in het project) en het bestaande `Input` component met een `Search` icon van lucide-react.

