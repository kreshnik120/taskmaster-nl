

# UI Audit: Professionals pagina — Verbeterplan

## Huidige observaties

Na analyse van de live pagina en code identificeer ik de volgende UI-problemen:

### 1. Kaarten zijn te hoog — slechte informatiedichtheid
Elke kaart heeft 6 verticale secties: checkbox+avatar+naam, functie/werkvorm, regio, document status, timestamp, en een volledige actie-footer. Bij 1000 professionals en 3 kolommen zie je slechts ~9 kaarten per scherm. De actie-footer (telefoon, email, locatie, plaatsen) neemt ~25% van de kaarthoogte in voor acties die zelden vanuit de lijst worden gebruikt.

### 2. Dubbele informatie
"1000 professionals" staat zowel in de hero-subtitle als in de resultatenteller eronder.

### 3. KPI-kleuren inconsistent met paginacontext
De pagina heeft `contextColor="rose"` maar 4 van 5 KPI's gebruiken `variant="violet"`. Alleen "Doc. verlopen" is rose.

### 4. Geen lijst/tabel-weergave
Met 1000 professionals is een compacte tabelweergave essentieel voor snel scannen. Alleen grid-view is beschikbaar.

### 5. Filterpaneel voelt los
De Collapsible dropt als absolute-positioned Card — voelt niet geïntegreerd.

---

## Voorgestelde wijzigingen

### A. Compactere kaartlayout (ProfessionalCard.tsx)
- **Actie-footer verwijderen** van de kaart — verplaats telefoon/email/locatie naar de hover-card en detail-modal waar ze thuishoren
- **Document status + timestamp samenvoegen** in één compacte regel
- Resultaat: ~35% minder kaarthoogte, meer professionals zichtbaar per scherm

### B. Lijst-/tabelweergave toevoegen (Professionals.tsx)
- Toggle knop (Grid | Lijst) toevoegen naast de zoekbalk
- Lijstweergave: compacte rijen met avatar, naam, functie, regio, status, doc-status
- Gebruiker kan kiezen op basis van voorkeur

### C. KPI-kleuren harmoniseren (Professionals.tsx)
- Alle KPI's naar `variant="rose"` (past bij de paginacontext)
- "Doc. verlopen" eventueel `variant="amber"` als waarschuwingskleur

### D. Dubbele teller opruimen (Professionals.tsx)
- Hero-subtitle dynamisch maken: toon alleen bij actieve filters het gefilterde aantal
- Verwijder de losse resultatenteller-div

### E. Filters inline tonen (Professionals.tsx)
- Vervang Collapsible door inline filter-chips/pills op één regel
- Actieve filters zichtbaar als badges met X-knop

---

## Bestanden

| Bestand | Wijziging |
|---|---|
| `src/components/recruitment/ProfessionalCard.tsx` | Actie-footer verwijderen, compactere doc-status/timestamp |
| `src/pages/Professionals.tsx` | KPI-kleuren, view-toggle, inline filters, dubbele teller |

## Prioriteit

Wijzigingen A (compactere kaart) en B (lijst-weergave) hebben het meeste impact op dagelijks gebruik met 1000+ professionals.

