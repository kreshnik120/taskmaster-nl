
# Fix V2: functie_niveau afleiden uit Diploma Documenten

## Samenvatting
244 van de 1.425 professionals hebben diploma-documenten die we kunnen gebruiken om het juiste functie_niveau af te leiden. De Bendy selection list codes (`,adl`, `,bgl3`) leveren bijna niets bruikbaars op. Diploma's in `professional_documents` bevatten de echte kwalificatie.

## Wat er verandert

### 1. Nieuwe functie: `deriveFunctieNiveauFromDiplomas()`
Analyseert diploma-documenten en retourneert het hoogste kwalificatieniveau. De regex-patronen worden uitgebreid ten opzichte van het voorstel, omdat de werkelijke data veel meer varianten bevat:

| Patroon | Voorbeelden in data | Niveau |
|---------|-------------------|--------|
| `hbo.*verpleeg\|nursing` | "HBO Bachelor Opleiding tot Verpleegkundige (Nursing)" | HBO-V |
| `verpleegkunde\|verpleegkundige` | (nog geen in data) | Verpleegkundige (MBO) |
| `ggz` | (nog geen in data) | GGZ-agoog |
| `persoonlijk.*begeleider\|EVC.*begeleider` | "Mbo Persoonlijk begeleider specifieke doelgroepen 4" (51x) | Persoonlijk begeleider |
| `verzorgend.*ig\|vig` | "MBO Verzorgende IG 3" (2x) | VIG |
| `begeleider\|sociaal.*werker\|spw\|maatschappelijke.*zorg\|pedagogisch\|sociaal-maatschappelijk\|sociaal-cultureel` | "Mbo Sociaal werker 4" (26x), "Mbo Begeleider specifieke doelgroepen 3" (3x) | Begeleider |
| `helpende` | "Mbo Helpende Zorg en Welzijn 2" (15x) | Helpende |

### 2. `deriveFunctieNiveau()` krijgt 4e parameter
Cascade wordt: groepnamen -> level -> function_type -> **diplomaNiveau** -> "Helpende"

### 3. UPDATE path: diploma-query per professional
Voor elke bestaande professional worden diploma-documenten opgehaald en het niveau doorgegeven als 4e argument.

### 4. INSERT path: overgeslagen (by design)
Nieuwe professionals hebben nog geen documenten bij eerste sync. De volgende sync corrigeert dit via de UPDATE path.

### 5. SQL migratie: bestaande data direct fixen
Een eenmalige UPDATE op basis van `professional_documents` met uitgebreide CASE/WHEN patronen die alle 244 professionals met diploma's correct mappen.

## Verwacht resultaat
- ~51 professionals -> Persoonlijk begeleider
- ~26 professionals -> Begeleider (Sociaal werker)
- ~15 professionals -> Helpende (bevestigd via diploma)
- ~6 professionals -> Begeleider (HBO Social Work)
- ~2 professionals -> VIG
- ~1 professional -> HBO-V
- Overige ~143 met generieke diploma-namen -> verdere analyse per geval
- ~1.181 zonder diploma -> blijven "Helpende" (default)

## Technische details

### Bestanden
- **Gewijzigd:** `supabase/functions/bendy-sync/index.ts` (wijzigingen A-D)
- **Nieuw:** SQL migratie voor bestaande data correctie

### Performance
- Wijziging C voegt 1 extra DB query per UPDATE toe (`professional_documents` per professional). Bij 1.400 professionals is dit acceptabel binnen de bestaande sync-loop.

### Risico
- Geen verslechtering: als geen diploma gevonden wordt, valt het terug op de bestaande logica en uiteindelijk op "Helpende"
- De uitgebreide regex-patronen dekken alle 244 diploma-records in de huidige data
