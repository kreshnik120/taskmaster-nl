
# Glass Empty States Verbeteren (3 locaties)

## Overzicht

3 empty states upgraden naar het volledige glass morphism patroon met icon housing en context-afhankelijke berichten (geen data vs. geen zoekresultaten).

---

## Stap 1: KanbanColumn.tsx (regels 213-218)

Huidige empty state heeft al basis glass maar mist icon housing en context-onderscheid.

**Wijziging:** Vervang de simpele tekst door het volledige patroon met icon housing:

```
<div className="flex flex-col items-center justify-center py-12 px-8 text-center bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm rounded-lg border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)] mx-2 mb-2">
  <div className="p-4 rounded-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm mb-4">
    <Inbox className="h-8 w-8 text-muted-foreground/50" />
  </div>
  <h3 className="text-base font-medium text-foreground mb-1">Geen taken</h3>
  <p className="text-sm text-muted-foreground/70">Sleep hier om toe te voegen</p>
</div>
```

Geen extra prop nodig -- het Kanban board heeft geen zoekfilter op kolom-niveau, dus alleen de "geen data" variant is relevant.

---

## Stap 2: Professionals.tsx (regels 688-693)

Huidige empty state heeft glass container maar mist icon housing en onderscheid tussen geen data/geen zoekresultaten.

**Wijziging:** Vervang de simpele `<p>` door het volledige patroon met conditie op `searchTerm` of actieve filters:

```
{filteredProfessionals.length === 0 && (
  <div className="flex flex-col items-center justify-center py-12 px-8 text-center rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
    <div className="p-4 rounded-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm mb-4">
      {hasActiveFilters ? (
        <Search className="h-8 w-8 text-muted-foreground/50" />
      ) : (
        <Users className="h-8 w-8 text-muted-foreground/50" />
      )}
    </div>
    <h3 className="text-base font-medium text-foreground mb-1">
      {hasActiveFilters ? "Geen professionals gevonden" : "Nog geen professionals"}
    </h3>
    <p className="text-sm text-muted-foreground/70">
      {hasActiveFilters
        ? "Probeer andere filters of zoektermen"
        : "Voeg je eerste professional toe om te beginnen"}
    </p>
  </div>
)}
```

Een `hasActiveFilters` variabele wordt afgeleid: `searchTerm || filterFunctie !== "all" || filterWerkvorm !== "all" || filterStatus !== "all" || filterRegio`.

---

## Stap 3: Gebruikers.tsx (regels 456-459)

Huidige empty state is een platte `div` zonder glass of icons.

**Wijziging:** Vervang door het volledige glass patroon met conditie op `searchTerm`:

```
<div className="flex flex-col items-center justify-center py-12 px-8 text-center rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
  <div className="p-4 rounded-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm mb-4">
    {searchTerm ? (
      <Search className="h-8 w-8 text-muted-foreground/50" />
    ) : (
      <Users className="h-8 w-8 text-muted-foreground/50" />
    )}
  </div>
  <h3 className="text-base font-medium text-foreground mb-1">
    {searchTerm ? "Geen gebruikers gevonden" : "Nog geen medewerkers"}
  </h3>
  <p className="text-sm text-muted-foreground/70">
    {searchTerm
      ? `Geen resultaten voor "${searchTerm}"`
      : "Klik op 'Nieuwe Medewerker Uitnodigen' om te beginnen"}
  </p>
</div>
```

`Users` en `Search` zijn al geimporteerd in dit bestand.

---

## Technisch Overzicht

| Bestand | Wijziging |
|---------|-----------|
| `src/components/KanbanColumn.tsx` | Icon housing + verbeterde tekst in empty state |
| `src/pages/Professionals.tsx` | Volledige glass empty state met filter-conditie |
| `src/pages/Gebruikers.tsx` | Volledige glass empty state met zoek-conditie |

Totaal: 3 bestanden, alleen CSS/JSX in bestaande empty state blokken. Geen nieuwe bestanden, geen database, geen hooks.
