
# Per-Positie Tracking voor Diensten

## Overzicht
Wanneer een dienst meerdere medewerkers vraagt (gevraagd_aantal > 1), worden toewijzingen gekoppeld aan specifieke posities (1, 2, 3...). Dit maakt het bezettingsoverzicht per positie zichtbaar en voorkomt overbezetting.

## Stap 1: Database Migratie

```sql
ALTER TABLE dienst_toewijzingen ADD COLUMN positie_nr INTEGER NOT NULL DEFAULT 1;

ALTER TABLE dienst_toewijzingen DROP CONSTRAINT IF EXISTS dienst_toewijzingen_dienst_id_professional_id_key;

ALTER TABLE dienst_toewijzingen ADD CONSTRAINT dienst_toewijzingen_dienst_positie_professional_key
  UNIQUE (dienst_id, positie_nr, professional_id);

CREATE INDEX idx_dt_positie ON dienst_toewijzingen(dienst_id, positie_nr);
```

- Bestaande toewijzingen krijgen automatisch `positie_nr = 1`
- Oude UNIQUE constraint wordt verwijderd en vervangen door een die positie_nr bevat

## Stap 2: DienstData Interface en Mapping

**Bestand: `src/hooks/useDienstenPlanning.ts`**

- Voeg `positie_nr: number` toe aan de toewijzingen array in de `DienstData` interface (na `status`)
- Voeg `positie_nr: t.positie_nr || 1` toe aan de toewijzingen mapping (regel 183-196)
- Voeg `positie_nr` toe aan de select query van `dienst_toewijzingen` (regel 152-153)

## Stap 3: ToewijzingenBeheer.tsx -- Grootste wijziging

### A. Nieuwe imports en state
- Importeer `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `Label`
- Voeg `useMemo` toe aan React imports
- Nieuwe state: `const [selectedPositie, setSelectedPositie] = useState(1)`

### B. Bezetting per positie berekenen
Vervang de huidige eenvoudige `bezet` berekening door een `useMemo` die bij `gevraagd_aantal > 1` telt hoeveel unieke posities bezet zijn (via `Set`).

### C. Positie selector bij toevoegen
Wanneer `gevraagd_aantal > 1`, toon een Select dropdown boven de professional zoekfunctie waarmee de gebruiker een positie kiest. Elke optie toont "Positie X (open)" of "Positie X (naam)".

### D. Positie meesturen bij insert
De `assignProfessional` functie stuurt `positie_nr: selectedPositie` mee bij de insert.

### E. Gegroepeerde weergave
Wanneer `gevraagd_aantal > 1`: toon toewijzingen gegroepeerd per positie met "Positie X -- Bezet/Open" labels. Per positie worden de toewijzingsrijen getoond. Bij `gevraagd_aantal = 1`: bestaande flat lijst behouden (geen regressie).

## Stap 4: DienstCard.tsx -- Bezetting per positie

Vervang de huidige `bezet` berekening door een `useMemo` die bij `gevraagd_aantal > 1` het aantal bezette posities telt via `Set<number>` i.p.v. het totaal aantal bevestigde toewijzingen.

Importeer `useMemo` uit React.

## Stap 5: NieuweDienstModal.tsx -- Pre-toewijzing

Bij de pre-toewijzing insert (regel 448-453), voeg `positie_nr: 1` toe aan het insert object.

## Stap 6: DienstDetailSheet.tsx -- Positie indicators

Na de "Gevraagd aantal" DetailRow (regel 162), toon visuele ronde positie-indicators wanneer `gevraagd_aantal > 1`:
- Bezette posities: groene cirkel met nummer
- Open posities: amber cirkel met nummer
- Elk bolletje toont een tooltip met status

## Gewijzigde Bestanden
1. Database migratie (nieuw)
2. `src/hooks/useDienstenPlanning.ts` -- interface + mapping + select query
3. `src/components/planning/ToewijzingenBeheer.tsx` -- groepering, positie selector, bezettingsberekening
4. `src/components/planning/DienstCard.tsx` -- bezettingsberekening per positie
5. `src/components/planning/NieuweDienstModal.tsx` -- positie_nr bij pre-toewijzing
6. `src/components/planning/DienstDetailSheet.tsx` -- visuele positie indicators
