

# FIX: Full sync triggeren + cron-job verificatie

## Probleem
De sync draait als `incremental`, waardoor:
1. Stale-detectie (Stap 6) wordt overgeslagen — alleen `full` syncs activeren dit
2. Bestaande fout-open diensten niet worden herbeoordeeld (ongewijzigde records worden niet opgehaald)
3. De consistency fix (5G) slechts 7 van ~35 gevallen vingt (rest heeft geen toewijzing in DB)

## Onderzoek nodig
Controleer hoe de cron-job (Job 41) de sync triggert — het memory zegt `sync_type: full`, maar het sync-log toont `incremental`. Mogelijk is de edge function entry point of de cron payload incorrect.

## Stap 1: Verifieer de cron-job configuratie
Check de `bendy-sync` edge function entry point om te zien welke `sync_type` wordt doorgegeven wanneer de cron trigger binnenkomt (`trigger === 'scheduler'`).

## Stap 2: Fix sync_type voor cron-triggered runs
Als de cron-job `incremental` stuurt in plaats van `full`, wijzig de edge function zodat scheduled runs altijd `sync_type: 'full'` gebruiken. Dit zorgt ervoor dat:
- Stale-detectie elke 10 minuten draait
- Alle records opnieuw worden geëvalueerd met de dedup-fix
- Catch-up toewijzingen worden aangemaakt

## Stap 3: Handmatige full sync
Na de fix, trigger een handmatige full sync om de 42 "ghost-open" diensten direct te corrigeren.

## Verwacht resultaat na full sync
- ~28 ghost-open diensten zonder toewijzing: worden ofwel gecorrigeerd naar `volledig_bezet` (als ze op assigned endpoint staan) of `geannuleerd` (als ze niet meer in de API staan)
- Open diensten dalen van 42 naar ~14 (overeenkomend met Bendy)
- Ingeplande diensten stijgen van 187 naar ~196
- Uren-verschil van ~145 uur wordt grotendeels opgelost

