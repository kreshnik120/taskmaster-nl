

# Document-indicatoren verfijnen — overzichtelijker en mooier

Op de screenshot zijn de document-badges te groot, te druk, en de tekst te lang. Ze nemen te veel ruimte in en scannen slecht. De volgende verfijningen maken ze compacter, rustiger en meer "at-a-glance" leesbaar.

## Bestand: `src/components/recruitment/ProfessionalCard.tsx`

### 1. Compactere tekst — korter en krachtiger
De huidige labels zijn te lang ("11 docs niet gepubliceerd", "3 docs verlopen"). Verkort naar:
- Verlopen: `"3 verlopen"` (i.p.v. "3 docs verlopen")
- OK: `"✓ Compleet"` of `"Compleet (5)"` (i.p.v. "Docs OK (5)")
- Niet gepubliceerd: `"11 in concept"` (i.p.v. "11 docs niet gepubliceerd")
- Geen docs: `"Geen documenten"` (blijft)

### 2. Icoon + getal prominenter, tekst secundair
Herstructureer de badge layout zodat het getal visueel opvalt:
- Het icoon en getal worden `font-semibold`, de beschrijvende tekst `font-normal text-current/70`
- Dit geeft een "at-a-glance" scanervaring: je ziet direct het getal + kleur

### 3. Badge sizing uniformer en iets kleiner
Alle badges worden `text-[10px] px-2 py-0.5 h-5` — net iets strakker dan nu, met vaste hoogte zodat ze niet verspringen.

### 4. Shadow verwijderen van badges
De huidige `shadow-[0_1px_2px_...]` op de badges voegt visuele ruis toe. Verwijder de shadow — de kleur-tint en border zijn voldoende voor differentiatie. Dit maakt het rustiger.

### 5. Timestamp en document-badge beter gescheiden
Voeg `gap-1.5` toe aan de container i.p.v. `space-y-1` en gebruik `flex flex-col` voor betere controle. De timestamp krijgt `mt-0.5` voor net iets meer ademruimte.

### 6. "Geen documenten" state minder prominent
De "Geen docs" badge is nu even opvallend als de andere states. Maak deze nog subtieler: verwijder border, gebruik alleen `text-muted-foreground/40` met een klein icoon — het is informatief maar niet alarmerend.

Alle wijzigingen zijn puur className + tekst-aanpassingen in `ProfessionalCard.tsx`.

