

# Documenten Tab -- Enterprise Document Management

## Overzicht
Verplaats documenten van een simpele Collapsible in het Profiel tab naar een eigen volwaardige "Documenten" tab met KPI dashboard, compliance alerts, en een interactieve tabel met uitklapbare details.

## Wijzigingen (alleen `src/components/ProfessionalDetailModal.tsx`)

### 1. TabsList uitbreiden
- Regel 535: `grid-cols-5` wordt `grid-cols-6`
- Nieuwe TabsTrigger "Documenten" toevoegen na "Beschikbaarheid" (regel 540), met oranje count badge en rode pulse dot bij verlopen documenten

### 2. Documenten Collapsible verwijderen uit Profiel tab
- Regels 1018-1088 volledig verwijderen (het hele `{/* Documenten (Bendy) */}` blok)

### 3. Nieuwe TabsContent "documenten" toevoegen
Na de Profiel TabsContent (regel 1089), een volledige documenten tab met:

**Compliance KPI's (4 cards)**
- Totaal (neutraal), Geldig (groen), Binnenkort verlopend (oranje), Verlopen (rood)
- Sync timestamp rechtsonder

**Verlopen documenten alert**
- Rood blok met XCircle icoon en lijst van verlopen documenten met datums

**Bijna-verlopen waarschuwing**
- Oranje blok met Clock icoon, "Nog X dagen" countdown per document

**Documenten tabel**
- Header: Document, Type, Verloopdatum, Status
- Per rij: FileText icoon (kleur per status), naam, type, datum, status badge
- Badges: "Verlopen" (rood), "Xd" (oranje countdown), "Geldig" (groen), "permanentsymbool" (grijs)
- Elke rij is een Collapsible die uitklapt met details: documentnummer, uitgever, geldig vanaf/tot, bron, gepubliceerd, Bendy update timestamp
- Detail panel heeft gekleurde border-left (rood/oranje/neutraal)

**Empty state**
- FileText icoon + "Geen documenten gesynchroniseerd" tekst

### Technische details

Alle benodigde imports zijn al aanwezig: `FileText`, `ChevronDown`, `Clock`, `XCircle`, `Badge`, `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger`, `format`, `nl`, `cn`.

Geen andere bestanden worden gewijzigd.

