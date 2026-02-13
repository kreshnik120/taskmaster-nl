

# S15 Kwaliteitsaudit -- 13 Bugfixes & Optimalisaties

## Overzicht
13 gerichte fixes uit de kwaliteitsaudit. Alleen bugfixes en optimalisaties, geen nieuwe features of styling.

---

## FIX 1 -- Lock Version Increment (CRITICAL)
**Bestand:** `src/components/planning/NieuweDienstModal.tsx` (regel 431)
- Wijzig `.update(dienstData)` naar `.update({ ...dienstData, lock_version: (editDienst!.lock_version ?? 0) + 1 })`
- Maakt optimistic locking functioneel

## FIX 2 -- Nachtdienst Overlap Check (CRITICAL)
**Bestand:** `src/hooks/useDienstMatching.ts` (regel 166-169)
- Vervang string-vergelijking door `toMin()` helper en `overlaps()` functie die middernacht-overschrijding correct afhandelt
- Voeg helpers toe direct boven de `heeftOverlap` variabele

## FIX 3 -- Beschikbaarheid Upsert Race Condition (HIGH)
**Bestand:** `src/hooks/useBeschikbaarheidMutations.ts` (regel 27-53)
- Vervang select-then-insert patroon door native `.upsert()` met `onConflict: "professional_id,date,shift"`
- UNIQUE constraint bestaat al in de database (verified)

## FIX 4 -- Overbetaling Blokkering (HIGH)
**Bestand:** `src/components/facturatie/BetalingRegistrerenDialog.tsx` (regel 88)
- Wijzig `canSubmit` naar: `bedragNum > 0 && !isCreating && !isOverpayment`
- De waarschuwings-Alert voor overbetaling bestaat al (regel 189-196), submit wordt nu ook geblokkeerd

## FIX 5 -- BTW Afrondingsfout (HIGH)
**Bestand:** `src/hooks/facturatie/useCreateFactuur.ts` (regel 41-49)
- Voeg `round2` helper toe en rond elk subtotaal en BTW-bedrag per regel af naar 2 decimalen

## FIX 6 -- Beschikbaarheid O(n^2) Performance (MEDIUM)
**Bestand:** `src/components/beschikbaarheid/BeschikbaarheidWeekKalender.tsx`
- Voeg `availabilityMap` useMemo toe die een Map bouwt met `pro.id|date|shift` keys
- Vervang `.find()` in de render loop door `.get()` lookup

## FIX 7 -- ChatWidget Memory Leak (HIGH)
**Bestand:** `src/components/AIAssistant/ChatWidget.tsx`
- Voeg `jobTrackingCleanupRef = useRef<(() => void) | null>(null)` toe
- Vang cleanup op bij aanroep: `jobTrackingCleanupRef.current = startJobProgressTracking(...)`
- Voeg cleanup useEffect toe voor unmount

## FIX 8 -- Gecombineerde Filters (MEDIUM)
**Bestand:** `src/hooks/useDienstenPlanning.ts` (regel 205-239)
- Combineer 7 opeenvolgende `.filter()` calls tot 1 enkele filter met alle condities

## FIX 9 -- Zoek Minimumlengte (LOW)
**Bestand:** `src/components/planning/ToewijzingenBeheer.tsx` (regel 101)
- Wijzig `debouncedSearch.length > 0` naar `debouncedSearch.length >= 2`

## FIX 10 -- Bezetting Utility Extractie (MEDIUM)
- Maak nieuw bestand `src/utils/bezetting.ts` met `berekenBezetting()` functie
- Refactor `DienstCard.tsx` (regel 24-35) en `ToewijzingenBeheer.tsx` (regel 72-83) om de utility te gebruiken

## FIX 11 -- ErrorBoundary op Routes (MEDIUM)
**Bestand:** `src/App.tsx`
- Wrap `<Layout />` in `<ErrorBoundary fallbackTitle="Er is iets misgegaan">` zodat alle authenticated routes beschermd zijn

## FIX 12 -- Auto Dienst-Type Verkeerde Flag (LOW)
**Bestand:** `src/components/planning/NieuweDienstModal.tsx`
- Voeg `dienstTypeManual` state toe (regel ~80)
- Vervang `titelManual` guard in useEffect (regel 349) door `dienstTypeManual`
- Zet `setDienstTypeManual(true)` bij handmatige selectie (regel 861)
- Reset in resetForm (regel 322)

## FIX 13 -- Herhaling Index Bounds Check (LOW)
**Bestand:** `src/components/planning/NieuweDienstModal.tsx` (regel 478-480)
- Voeg bounds check toe: `if (parentIdx < 0 || parentIdx >= allDatums.length) continue;`

---

## Gewijzigde Bestanden (8 bestanden, 1 nieuw)

1. `src/components/planning/NieuweDienstModal.tsx` -- FIX 1, 12, 13
2. `src/hooks/useDienstMatching.ts` -- FIX 2
3. `src/hooks/useBeschikbaarheidMutations.ts` -- FIX 3
4. `src/components/facturatie/BetalingRegistrerenDialog.tsx` -- FIX 4
5. `src/hooks/facturatie/useCreateFactuur.ts` -- FIX 5
6. `src/components/beschikbaarheid/BeschikbaarheidWeekKalender.tsx` -- FIX 6
7. `src/components/AIAssistant/ChatWidget.tsx` -- FIX 7
8. `src/hooks/useDienstenPlanning.ts` -- FIX 8
9. `src/components/planning/ToewijzingenBeheer.tsx` -- FIX 9
10. `src/utils/bezetting.ts` (NIEUW) -- FIX 10
11. `src/components/planning/DienstCard.tsx` -- FIX 10
12. `src/App.tsx` -- FIX 11
