
# PA-3 -- Chat Integratie voor Planning + Beschikbaarheid

## Overzicht
Maak de ChatWidget context-aware voor de Planning en Beschikbaarheid pagina's, en voeg een "Vraag aan AI" knop toe in het dienst detail paneel.

## Stap 1: ChatWidget.tsx -- Imports uitbreiden

- Voeg `CalendarDays` en `CalendarCheck2` toe aan de lucide-react import (regel 2)
- Voeg `parseISO` toe aan de date-fns import (regel 28)

## Stap 2: ChatWidget.tsx -- PAGE_CONTEXTS uitbreiden

Voeg twee nieuwe entries toe na `/sollicitaties-archief` (regel 162), voor de sluitende `};` (regel 163):

- `/planning`: label "Diensten Planning", icon CalendarDays, beschrijving met matching/scoring/bezetting details, 3 quickActions (Onbezette diensten, Matching uitleg, Planning tips)
- `/beschikbaarheid`: label "Beschikbaarheid", icon CalendarCheck2, beschrijving met professional/shift/matrix details, 3 quickActions (Beschikbaarheid tips, Shift planning, Week optimaliseren)

## Stap 3: ChatWidget.tsx -- currentPageContext verrijken

Vervang de useMemo op regels 239-266 met een versie die dynamisch de weekinfo toevoegt wanneer de gebruiker op `/planning` is en een `?week=` URL parameter aanwezig is. De description wordt verrijkt met "De gebruiker bekijkt de week van [datum]."

## Stap 4: ChatWidget.tsx -- Custom event listener

Voeg een nieuw useEffect toe dat luistert naar het custom event `open-chat-with-context`. Dit event opent de chat met een vooringevulde prompt: `setIsOpen(true)`, `setShowWelcome(false)`, `setInput(prompt)`.

## Stap 5: DienstDetailSheet.tsx -- "Vraag aan AI" knop

- Voeg `Bot` toe aan de lucide-react import (regel 4)
- Voeg na de DienstMatchingSuggesties (regel 272) een "Vraag aan AI assistent" knop toe:
  - Alleen zichtbaar voor actieve diensten (niet geannuleerd/voltooid)
  - Violet styling (border-violet-300, text-violet-700)
  - Dispatcht `open-chat-with-context` event met volledige dienst context (titel, datum, type, tijden, status, locatie, functieniveau)

## Gewijzigde Bestanden

1. `src/components/AIAssistant/ChatWidget.tsx` (wijzig) -- imports, PAGE_CONTEXTS, useMemo verrijking, event listener
2. `src/components/planning/DienstDetailSheet.tsx` (wijzig) -- Bot import, "Vraag aan AI" knop

## Technische Details

- Geen nieuwe bestanden, geen database wijzigingen
- Custom event patroon (`open-chat-with-context`) maakt losse koppeling mogelijk tussen DienstDetailSheet en ChatWidget
- parseISO gebruikt voor veilige date parsing (consistent met codebase)
- Bestaande PAGE_CONTEXTS entries worden niet gewijzigd
