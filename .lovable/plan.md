

# P0-A: Nachtdienst + Slaapdienst + Database Fundament

## Overzicht
Deze prompt breidt de planning module uit met nachtdienst/slaapdienst-ondersteuning en legt het database-fundament voor toekomstige P0-B/C features. Het omvat 9 stappen verdeeld over database, types, UI en logica.

---

## Stap 1: Database migratie (2 SQL statements)

**Migratie A** -- Nieuwe kolommen + type-wijziging `gevraagd_functie_niveau` van TEXT naar TEXT[]:
- `is_slaapdienst BOOLEAN DEFAULT false`
- `slaap_start_tijd TIME`
- `slaap_eind_tijd TIME`
- `flexwerker_opmerking TEXT`
- `vereiste_certificeringen TEXT[] DEFAULT '{}'`
- `gevraagd_functie_niveau` ALTER naar `TEXT[]` met USING-clause die bestaande waarden migreert

**Migratie B** -- Herbereken `netto_uren` GENERATED column voor over-middernacht ondersteuning:
- DROP + re-ADD met CASE-expressie die `eind_tijd < start_tijd` afhandelt via `+24 hours`

---

## Stap 2: TypeScript types (useDienstenPlanning.ts)

DienstData interface uitbreiden met 5 nieuwe velden en `gevraagd_functie_niveau` wijzigen van `string | null` naar `string[]`. De `*` selector in de query haalt de nieuwe kolommen automatisch op.

---

## Stap 3: Nachtdienst tijdbereik (NieuweDienstModal.tsx)

- Tijdopties uitbreiden van 6-23 naar 0-23
- `berekeningDuur` aanpassen: als `minuten <= 0` dan `+= 24*60` (over middernacht)
- Validatie wijzigen: `startTijd >= eindTijd` error vervangen door `startTijd === eindTijd` error (nachtdienst 22:00-07:00 is geldig)

---

## Stap 4: Slaapdienst UI (NieuweDienstModal.tsx)

- 3 nieuwe state variabelen: `isSlaapdienst`, `slaapStart`, `slaapEind`
- Checkbox "Slaapdienst" na het pauze-veld
- Bij checked: twee extra Select-velden (slaap start/eind) met indigo styling en border-left
- Edit-populate en reset effects uitbreiden
- `dienstData` object uitbreiden met `is_slaapdienst`, `slaap_start_tijd`, `slaap_eind_tijd`

---

## Stap 5: Live preview uitbreiden (NieuweDienstModal.tsx)

- Nachtdienst markering: `{startTijd > eindTijd && " (nachtdienst)"}` op de tijdregel
- Slaapdienst info: bed-emoji + slaaptijden tonen wanneer actief

---

## Stap 6: Detail sheet slaapdienst (DienstDetailSheet.tsx)

Na de "Dienst type" rij, conditioneel tonen:
- "Slaapdienst: Ja"
- "Slaapperiode: HH:MM tot HH:MM"

---

## Stap 7: Kopieer-functie uitbreiden (Planning.tsx)

5 nieuwe velden toevoegen aan het insert-object in `handleCopyDienst`:
- `is_slaapdienst`, `slaap_start_tijd`, `slaap_eind_tijd`, `flexwerker_opmerking`, `vereiste_certificeringen`
- `gevraagd_functie_niveau` staat al in de kopie maar is nu een array -- dat werkt automatisch correct.

---

## Stap 8: Dienst type auto-detectie (NieuweDienstModal.tsx)

Nieuw `useEffect` dat `dienstType` automatisch instelt:
- Over middernacht of startuur >= 22 of < 6 --> "nacht"
- Startuur >= 15 --> "avond"
- Anders --> "dag"
- Alleen als titel niet handmatig is aangepast

---

## Stap 9: Functieniveau backwards-compatibility (4 bestanden)

Omdat `gevraagd_functie_niveau` nu een `TEXT[]` is:

| Bestand | Wijziging |
|---------|-----------|
| `useDienstenPlanning.ts` | Interface: `string[]`, filter: `.includes()` i.p.v. `===` |
| `DienstDetailSheet.tsx` | `.join(", ")` i.p.v. directe string weergave |
| `DienstCard.tsx` | `.join(", ")` op beide plekken (compact + full) |
| `NieuweDienstModal.tsx` | Save: `[functieNiveau]`, edit-populate: `?.[0]` |

---

## Technisch overzicht -- alle bestandswijzigingen

| Bestand | Wijzigingen |
|---------|-------------|
| **Database** (migratie) | 6 kolommen + netto_uren herberekening |
| `useDienstenPlanning.ts` | Interface + filter logica |
| `NieuweDienstModal.tsx` | Tijdbereik, duurberekening, validatie, slaapdienst UI, auto-detectie, functieniveau array |
| `DienstDetailSheet.tsx` | Slaapdienst weergave + functieniveau array |
| `DienstCard.tsx` | Functieniveau array display |
| `Planning.tsx` | Kopieer-functie uitbreiden |

## Risico's en aandachtspunten

- De `DROP COLUMN netto_uren` + re-ADD vereist dat er geen views/triggers afhankelijk zijn van deze kolom. De bestaande code stuurt `netto_uren` niet mee in INSERT/UPDATE (eerder gefixt), dus dit is veilig.
- De `gevraagd_functie_niveau` TYPE-wijziging met USING-clause migreert bestaande data automatisch (NULL -> '{}', 'VIG' -> '{VIG}').
- Weekend-detectie in auto-detectie gebruikt `new Date().getDay()` wat de huidige dag checkt, niet de dienstdatum. Dit wordt later in P0-B verbeterd.

