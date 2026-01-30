
Doel
- Zorgen dat jullie VPS “whatsapp-relay” niet meer vastloopt op “401 Unauthorized”, ook als jullie in Lovable Cloud geen bestaande secret kunnen overschrijven maar alleen nieuwe secrets kunnen toevoegen.

Wat er nu gebeurt (oorzaak)
- De backend functie `whatsapp-bridge` valideert de header `x-api-key` uitsluitend tegen deze ene omgeving-variabele:
  - `WHATSAPP_BRIDGE_API_KEY`
- Als jullie de waarde niet kunnen updaten, blijft de oude key actief en blijft `whatsapp-relay` 401 krijgen.

Oplossingsrichting (zonder bestaande secrets te hoeven updaten)
We maken de authenticatie in `whatsapp-bridge` “key-rotatie vriendelijk”:
- De functie accepteert niet alleen `WHATSAPP_BRIDGE_API_KEY`, maar ook extra keys die jullie als nieuwe secrets kunnen toevoegen, zonder code-wijziging per rotatie.
- Concreet: accepteer elke env var die begint met `WHATSAPP_BRIDGE_API_KEY` (bijv. `WHATSAPP_BRIDGE_API_KEY_V2`, `WHATSAPP_BRIDGE_API_KEY_20260130`, etc.).
- Optioneel (als extra fallback): ook `WHATSAPP_VPS_API_KEY` meenemen, omdat die al bestaat in jullie secrets-lijst (maar alleen als dat functioneel klopt in jullie setup).

Plan van aanpak (implementatie)
1) Codebase check (quick scan)
   - Controleren of er nog andere endpoints/functies zijn die dezelfde key gebruiken (zodat we overal consistent zijn).
   - Controleren hoe `whatsapp-relay` exact authenticatie meegeeft (header `x-api-key` lijkt al correct).

2) Aanpassen authenticatie in `supabase/functions/whatsapp-bridge/index.ts`
   - Vervangen van “single-key check”:
     - Nu: `apiKey === Deno.env.get("WHATSAPP_BRIDGE_API_KEY")`
   - Naar “multi-key check”:
     - Lees alle env vars via `Deno.env.toObject()`
     - Verzamel alle waarden waarvan de naam:
       - exact `WHATSAPP_BRIDGE_API_KEY` is, of
       - start met `WHATSAPP_BRIDGE_API_KEY_` of `WHATSAPP_BRIDGE_API_KEY` (prefix aanpak)
     - Filter lege waarden weg
     - `isValidApiKey = apiKey && allowedKeys.includes(apiKey)`
   - Logging aanpassen (veilig):
     - Log alleen eerste 6–8 karakters van received key + welke env-var-namen er gevonden zijn (niet de volledige keys).
     - Hiermee kunnen we snel zien of de nieuwe secret “meegenomen” wordt door de functie, zonder secrets te lekken.

3) (Optioneel) Tijdelijke “dual accept” periode expliciet maken
   - Documenteren: jullie kunnen nu key-rotatie doen door simpelweg een nieuwe secret toe te voegen met prefix, zonder downtime.

4) Jullie actie in Lovable Cloud (geen update nodig, alleen toevoegen)
   - Voeg een nieuwe secret toe, bijvoorbeeld:
     - Name: `WHATSAPP_BRIDGE_API_KEY_V2`
     - Value: (jullie key)
   - Belangrijk: `whatsapp-relay` moet dezelfde key blijven sturen in `x-api-key`.

5) Verificatie (end-to-end)
   - Na het toevoegen van de nieuwe secret:
     - SSH: `ssh abcito@72.61.155.82 "pm2 logs whatsapp-relay --lines 10"`
     - Verwacht: `Forwarded to Supabase: 200` (i.p.v. 401)
   - Extra controle:
     - In de backend functie logs (Lovable Cloud) moet je zien dat er meerdere keys geladen zijn (alleen prefixes zichtbaar), en dat de API key validatie slaagt.

Edge cases / aandachtspunten
- Als `whatsapp-relay` per ongeluk een andere header gebruikt (bijv. `Authorization` i.p.v. `x-api-key`), blijft het misgaan. In de huidige `whatsapp-bridge` code wordt `x-api-key` verwacht.
- Als secrets pas “zichtbaar” worden voor de functie na een korte propagatie-delay, wachten we 30–60s en testen opnieuw.
- We zorgen dat logging geen volledige secrets toont.

Benodigde input van jullie (alleen als dit nog onduidelijk is)
- Welke key stuurt `whatsapp-relay` exact mee en in welke header? (ik ga uit van `x-api-key`, zoals de backend functie nu leest)

Resultaat
- Jullie hoeven nooit meer een bestaande secret te updaten.
- Elke nieuwe key-rotatie: nieuwe secret toevoegen met prefix, klaar.
- `whatsapp-relay` krijgt 200 zodra de key die hij stuurt overeenkomt met één van de toegestane (prefix) keys.

Technische notities (voor review)
- Bestandslocatie: `supabase/functions/whatsapp-bridge/index.ts`
- Wijziging: alleen auth-vergelijking refactor + veilige logging; geen database-migraties nodig.
