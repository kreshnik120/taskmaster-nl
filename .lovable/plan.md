

# Subtiele UI-verfijningen Professionals Pagina

Puur visuele polish — geen functionaliteit wijzigt, geen data-logica raakt.

## Bestand: `src/components/recruitment/ProfessionalCard.tsx`

### 1. Betere visuele scheiding content-secties
De document-badge en timestamp plakken nu direct aan elkaar. Voeg `mt-2` toe aan de timestamp en een subtiele `border-t border-border/30 pt-2` scheiding toe tussen de info-sectie (functie/regio/skills) en de meta-sectie (document-badge + timestamp), zodat de kaart rustiger scant.

### 2. Avatar iets groter (10→11)
Vergroot de avatar van `h-10 w-10` naar `h-11 w-11` voor betere scanbaarheid in het grid. De status-dot blijft proportioneel.

### 3. Disabled action buttons duidelijker
Disabled buttons (zonder telefoon/email/regio) zijn nu nauwelijks te onderscheiden. Voeg `disabled:opacity-30` toe zodat ze visueel duidelijk inactief zijn.

### 4. Document badge en timestamp als vaste footer-groep
Wrap de document-badge en timestamp in een `mt-auto pt-2` container zodat ze altijd onderaan de content-sectie staan, ongeacht of er skills/groepen zijn. Dit voorkomt dat kaarten met/zonder skills een ongelijke layout hebben.

### 5. Naam font-size subtiel groter
Wijzig de naam van `font-medium` naar `font-semibold text-[15px]` voor betere leesbaarheid in het 3-koloms grid.

## Bestand: `src/pages/Professionals.tsx`

### 6. Grid gap verfijning
Verhoog grid gap van `gap-3` naar `gap-4` voor meer ademruimte tussen kaarten.

### 7. Resultaten-teller subtiel verplaatsen
Verplaats de "1000 professionals" teller naar dezelfde regel als de zoekbalk (inline), zodat er minder verticale ruimte wordt verspild.

Alle wijzigingen zijn puur CSS/className aanpassingen — geen state, geen logica, geen data-flow.

