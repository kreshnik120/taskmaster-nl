

# Subtiele structuurverbeteringen — Professionals pagina

## Huidige situatie na eerdere rondes

De pagina heeft nu een goede basis: compacte kaarten, sticky filters, debounce, list/grid toggle. Maar er zijn nog subtiele structuurproblemen die de leesbaarheid en flow belemmeren.

## Bevindingen

### 1. Hero `mb-8` verspilt 32px verticale ruimte
`PageHero` heeft `mb-8` (32px margin-bottom) hardcoded. Gecombineerd met `space-y-6` op de container (24px gap) is er 56px witte ruimte tussen de titel en de KPI's. Te veel voor een data-pagina.

### 2. KPI-rij en sticky toolbar zijn gescheiden
De KPI-rij scrollt mee weg maar de filters zijn sticky. Probleem: als je scrollt verlies je context (welke KPI is actief?) maar de filters blijven. Dit is inconsistent — of alles sticky, of KPI's moeten visueel minder prominent zijn zodat je ze niet mist.

### 3. Sticky toolbar heeft negatieve margin hack
`-mx-4 px-4` is een layout hack die breekt bij andere container-breedtes. Beter om de sticky wrapper netjes binnen de layout te houden.

### 4. Paginering staat te ver van de data
De paginering is een los blok onderaan. Bij lijstweergave hoort het visueel bij de tabel (als footer). Bij grid voelt het los.

### 5. Grid animatie op elke pagina-wissel
`motion.div` met `initial={{ opacity: 0, y: 10 }}` triggert op elke paginawissel. Bij snel doorbladeren is dit vertragende visuele ruis in plaats van een nuttige animatie.

### 6. Filter row 2 wrapping op kleinere schermen
5 select-dropdowns op row 2 wrappen onvoorspelbaar bij smalle viewports. Geen visuele groupering tussen "filters" en "sortering".

---

## Plan

### A. Compactere verticale spacing (Professionals.tsx)
- `PageHero` className aanpassen met `mb-4` override in plaats van default `mb-8`
- `space-y-6` op container verlagen naar `space-y-4`
- Bespaart ~24px boven de data

### B. KPI-rij meenemen in sticky zone (Professionals.tsx)
- KPI's verplaatsen naar binnen de sticky container
- KPI's worden kleiner/compacter wanneer ze sticky zijn (ze zijn al klein genoeg)
- Of: KPI-rij helemaal niet sticky maar visueel verkleinen zodat ze minder gemist worden

Gekozen aanpak: KPI's **boven** de sticky toolbar houden maar de `space-y` verkleinen zodat ze sneller uit beeld zijn en de sticky toolbar direct overneemt.

### C. Sticky toolbar layout fix (Professionals.tsx)
- Vervang `-mx-4 px-4` hack door een nette full-width approach binnen de container
- Gebruik `mx-0` met passende padding

### D. Paginering integreren (Professionals.tsx)
- Bij lijstweergave: paginering als onderdeel van de tabel-wrapper
- Consistenter spacing met `pt-2` in plaats van `py-3`

### E. Grid animatie verwijderen (Professionals.tsx)
- `motion.div` wrapper per kaart verwijderen
- De kaarten hebben al CSS hover-transitions; extra mount-animaties vertragen het bladeren

### F. Filter row 2: sortering visueel scheiden (Professionals.tsx)
- Kleine separator (`|` of extra gap) tussen de 4 filters en de sorteer-dropdown
- Maakt het onderscheid filters vs. sortering duidelijk

---

## Bestanden

| Bestand | Wijziging |
|---|---|
| `src/pages/Professionals.tsx` | Spacing, sticky fix, animatie verwijderen, paginering, filter separator |

Geen wijzigingen aan `ProfessionalCard.tsx` of `ProfessionalListView.tsx` — die zijn nu goed.

