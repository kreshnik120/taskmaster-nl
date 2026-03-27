

# FIX-EARLYSTOP-2: DELTA_PAGE_SIZE verlagen naar 100

## Wat
Één constante wijzigen in `supabase/functions/_shared/bendy-helpers.ts`: `DELTA_PAGE_SIZE` van 500 naar 100.

## Waarom
Bendy API geeft 504 timeout bij pagina's van 500 records. 100 records per pagina werkte eerder wel.

## Wijziging
**Bestand:** `supabase/functions/_shared/bendy-helpers.ts`

```
WAS:  const DELTA_PAGE_SIZE = 500;
WORDT: const DELTA_PAGE_SIZE = 100;
```

Geen andere wijzigingen.

