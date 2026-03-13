

# Deploy bendy-sync edge function

De code is klaar en gemodulariseerd. Het plan is simpel:

1. **Deploy** de `bendy-sync` edge function via de deploy tool
2. **Verificatie**: Na deploy draai je een Requisition Sync en check je de Metadata voor:
   - `debug_fuc_individual_success` > 0 (individuele fetches werken)
   - `debug_prof_map_size` ~1427 (niet meer gelimiteerd op 1000)
   - `debug_fuc_map_size` > 0 (mappings gevonden)

Geen code-wijzigingen nodig — alleen deployment van de bestaande bestanden.

