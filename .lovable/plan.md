

# Documenten Tab Herstructurering — Enterprise Niveau

Na grondige analyse van het Documenten tab in `ProfessionalDetailModal.tsx` (regels 1075-1291) zijn de volgende problemen geïdentificeerd:

1. **Platte, ongegroepeerde lijst** — Alle documenten staan in één lange tabel zonder categorisering
2. **Geen visuele hiërarchie** — Verlopen, bijna verlopen en geldige docs hebben dezelfde rowgrootte
3. **Tabel past niet bij Liquid Glass systeem** — Harde borders, platte achtergronden, geen glaseffecten
4. **Alert-blokken zijn te luid** — Grote rode/oranje blokken boven de tabel zijn overweldigend
5. **Collapsible detail panel** is functioneel maar visueel onafgewerkt
6. **"Bendy" referentie** staat nog in de footer van detail panels en sync-info

## Bestand: `src/components/ProfessionalDetailModal.tsx` (regels 1075-1291)

### 1. Documenten groeperen per categorie
Groepeer documenten in secties: **Basis**, **ZZP**, **Certificaat**, **Overig** (gebaseerd op `doc.category`). Elke sectie krijgt een eigen header met een subtiel icoon en teller. Lege categorieën worden verborgen.

### 2. KPI grid — Liquid Glass styling
Huidige KPI-blokken zijn plat (`bg-card/50`). Verfijn naar:
- `backdrop-blur-sm bg-white/60 dark:bg-slate-900/60 border-white/30 dark:border-white/10 shadow-[0_2px_8px_hsla(0,0%,0%,0.04)]`
- Subtielere kleur-tints: groene/oranje/rode KPI's met `/[0.06]` achtergrond i.p.v. `/5`

### 3. Alert-blokken vervangen door inline status
De grote rode/oranje alert-blokken boven de tabel verwijderen. In plaats daarvan krijgen verlopen/bijna-verlopen documenten een subtiele inline-markering in de rij zelf (gekleurde linkerborder + zachte achtergrondtint). Dit is genoeg — de KPI's boven tonen al de aantallen.

### 4. Tabel → Gestylede kaartlijst
Vervang de harde tabelstructuur door een lijst van glasachtige document-rijen:
- Verwijder de tabel header (`bg-muted/40` grid header)
- Elke document-rij wordt een subtiele kaart: `rounded-lg bg-white/40 dark:bg-slate-900/40 border border-white/20 dark:border-white/8 mb-1.5`
- Status wordt visueel getoond via een gekleurde linkerborder (groen=geldig, oranje=binnenkort, rood=verlopen)
- Gepubliceerd-status als klein dot-icoon i.p.v. aparte kolom

### 5. Document-rij layout herstructureren
Huidige 5-kolom grid is te krap. Nieuw layout per rij:
- **Links**: Status-kleur border (2px) + Document icoon + Naam (bold)
- **Midden**: Type (als badge) + Verloopdatum
- **Rechts**: Status badge + Gepubliceerd dot + Chevron voor expand
- Alles in een `flex items-center` i.p.v. strak 5-kolom grid

### 6. Collapsible detail panel verfijnen
Het uitklap-panel krijgt Liquid Glass styling:
- `bg-white/30 dark:bg-slate-900/30 backdrop-blur-sm rounded-lg border border-white/20 mx-2 mb-2`
- Grid layout `grid-cols-2 sm:grid-cols-3` voor betere ruimtebenutting
- Verwijder "Bendy" referentie uit de footer — vervang door "Laatst bijgewerkt: [datum]"

### 7. Sync-info verfijnen
De sync-tekst "Laatst gesynchroniseerd" wordt subtieler:
- Verplaats naar onder de KPI grid als een `text-[10px] text-muted-foreground/50` regel
- Verwijder "Bendy" uit de tekst

### 8. Lege state verfijnen
De lege state ("Geen documenten gesynchroniseerd") krijgt glasachtige styling:
- `bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm rounded-xl border border-white/20 py-16`
- Verwijder "Synchroniseer documenten via de Bendy Sync pagina" — vervang door "Nog geen documenten beschikbaar"

