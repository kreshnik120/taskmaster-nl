
Doel: de 495 `professionals_email_unique_active` failures weghalen in Professional Sync.

Wat ik heb onderzocht:
- De email-fallback staat al in `supabase/functions/_shared/bendy-sync-users.ts`.
- In de laatste runs blijft patroon gelijk: `updated=999`, `failed=495`, `skipped=0`.
- In function logs staat expliciet: `professionals met documenten pre-fetched (1000 totaal)`.
- In database zijn er `1495` professionals (niet verwijderd), dus de sync werkt nu met een onvolledige professionals set in memory.

Conclusie (root cause):
- De query gebruikt `.limit(5000)`, maar de backend API cap levert effectief maar 1000 records terug.
- Daardoor “ziet” de email-match fallback die overige ~495 professionals niet, laat die users door naar INSERT, en die falen op unieke email constraint.

Implementatieplan:
1. Vervang in `bendy-sync-users.ts` de eenmalige professionals query met paginatie via `.range(...)` in lussen van 1000 records, tot er geen chunk meer terugkomt.
2. Laat exact dezelfde kolommen ophalen als nu (geen functioneel verlies).
3. Bouw na ophalen twee snelle lookup-structuren:
   - `bendyIdMap` voor match stap 1.
   - `emailMap` op `LOWER(TRIM(email))` voor match stap 2.
4. Houd de bestaande 3-staps matching-cascade intact:
   - bendy_id match → update
   - email match + leeg bendy_id → update + koppel
   - email match + ander bendy_id → skip + warning
   - geen match → insert
5. Zorg dat map-state tijdens de run wordt bijgewerkt na koppeling/insert (`matchedPro.bendy_id = bendyId` en map update), zodat binnen dezelfde run geen dubbele insert-pogingen ontstaan.
6. Geen DB migraties nodig; dit is pure sync-logica fix.
7. Deploy functie en verifieer met 1 handmatige Professional Sync.

Verificatiecriteria na fix:
- Logs tonen bij prefetch geen `1000 totaal` meer, maar volledige set (~1495).
- `Mislukt` daalt van 495 naar 0 (of zeer laag bij echte dataconflicten buiten dit patroon).
- `Bijgewerkt` stijgt naar ~1494.
- `Aangemaakt` blijft 0.
- `Status` wordt `success` (niet `partial`) als `failed=0`.
- Eventuele echte email-conflicten met ander bendy_id verschijnen als `overgeslagen` + warning, niet als `mislukt`.

Technische noot (compact):
```text
while (true):
  chunk = professionals.range(offset, offset+999)
  if chunk leeg: break
  push chunk
  if chunk < 1000: break
  offset += 1000
```
Daarna matching op maps in plaats van `professionals.find(...)` per user.
