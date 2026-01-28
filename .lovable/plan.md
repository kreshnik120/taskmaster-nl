
# Fix: AI Prompts Uitbreiden met Fase 7D Extractie

## Probleem

De Edge Function `ai-extract-meeting-minute/index.ts` heeft de juiste interface voor Fase 7D velden, maar de AI prompts instrueren het model niet om deze velden te extraheren.

---

## Wijzigingen Overzicht

| Locatie | Regels | Wijziging |
|---------|--------|-----------|
| Multimodal prompt | 250-326 | Uitbreiden met Fase 7D instructies |
| System prompt | 414-457 | Uitbreiden met Fase 7D instructies |
| Normalisatie (multimodal) | 374-384 | Map nieuwe velden |
| Normalisatie (text) | 601-611 | Map nieuwe velden |
| Normalisatie (direct) | 724-734 | Map nieuwe velden |

---

## Stap 1: Update Multimodal Prompt (PDF analyse)

**Locatie:** Regel 250-326 in `analyzeWithGeminiMultimodal`

**Wijziging:** Vervang het `action_items` JSON schema en voeg Fase 7D instructies toe:

```json
"action_items": [{
  "action": "Specifieke actie",
  "assignee": "Toegewezen aan of null (NIET 'team')",
  "deadline": "YYYY-MM-DD of null",
  "classification": "TAAK|IDEE|INFORMATIE",
  "urgency": "critical|high|medium|low",
  "source_quote": "VERPLICHT: Exacte quote uit het document",
  "confidence": 0.0-1.0,
  "onderwerp": "Kort onderwerp (2-5 woorden)",
  "doelgroep": "Voor wie is dit relevant",
  "actie_type": "Communicatie|Administratie|Planning|Onderzoek|Beslissing|Overig",
  "betrokkenen": [{"naam": "string", "rol": "string of null", "relatie": "assignee|uitleg_ontvanger|stakeholder"}],
  "externe_partij": {"naam": "string", "type": "klant|zzper|locatie|leverancier"} of null,
  "actieplan": ["Stap 1 met werkwoord", "Stap 2", "..."],
  "suggestie": "Directe actiezin voor de assignee"
}]
```

**Nieuwe instructies toevoegen:**

```text
FASE 7D - ENTERPRISE CONTEXT voor elke action_item:

7. ONDERWERP: Waar gaat dit over? (kort, 2-5 woorden)
   Voorbeelden: "Begeleidersdiensten", "Factuurproces", "Teamcommunicatie"

8. DOELGROEP: Voor wie is dit relevant?
   Voorbeelden: "ABCITO team", "ZZP'ers", "Klant IrisZorg"

9. ACTIE_TYPE: Classificeer het type actie:
   - Communicatie: uitleg geven, informeren, overleggen
   - Administratie: registreren, documenteren, verwerken
   - Planning: inplannen, afstemmen, organiseren
   - Onderzoek: uitzoeken, analyseren, controleren
   - Beslissing: besluiten, goedkeuren, kiezen
   - Overig: anders

10. BETROKKENEN: Array van personen met:
    - naam: Persoonsnaam
    - rol: Functie indien bekend (teamleider, planner, etc.)
    - relatie: "assignee" (uitvoerder), "uitleg_ontvanger" (ontvangt info), "stakeholder" (belang)

11. EXTERNE_PARTIJ: Object of null
    - naam: Organisatie/persoon naam
    - type: "klant" (IrisZorg, Bloezem), "zzper" (Anouar, Sanae), "locatie", "leverancier"

12. ACTIEPLAN: Array van 2-4 concrete stappen
    - Begin elke stap met een werkwoord
    - Wees specifiek, niet vaag
    Voorbeeld: ["Plan meeting met team", "Bereid uitleg voor", "Geef presentatie", "Documenteer afspraken"]

13. SUGGESTIE: Eén directe, actionable zin
    - Begin met werkwoord in gebiedende wijs
    Voorbeeld: "Bel Sanae vandaag terug om haar status te bevestigen."

BELANGRIJK:
- Als "team" als assignee staat → assignee = null, maar voeg "team" toe aan betrokkenen
- externe_partij is null als geen externe partij betrokken
- source_quote blijft VERPLICHT voor elke extractie
```

---

## Stap 2: Update System Prompt (Word/Text analyse)

**Locatie:** Regel 414-457 (`const systemPrompt`)

**Wijziging:** Breid het JSON schema en instructies uit met dezelfde Fase 7D velden als hierboven.

---

## Stap 3: Update Normalisatie Functies

**Locatie 1:** Regel 374-384 (multimodal normalisatie)
**Locatie 2:** Regel 601-611 (text extraction normalisatie)  
**Locatie 3:** Regel 724-734 (direct text normalisatie)

**Wijziging:** Voeg mapping toe voor de nieuwe velden:

```typescript
action_items: Array.isArray(extractedData.action_items) 
  ? extractedData.action_items.map((item: any) => ({
      // Bestaande velden
      action: item.action || '',
      assignee: item.assignee || null,
      deadline: item.deadline || null,
      classification: item.classification || null,
      urgency: item.urgency || null,
      source_quote: item.source_quote || null,
      confidence: typeof item.confidence === 'number' ? item.confidence : null,
      // NIEUW - Fase 7D velden
      onderwerp: item.onderwerp || null,
      doelgroep: item.doelgroep || null,
      actie_type: item.actie_type || null,
      achtergrond: item.achtergrond || null,
      betrokkenen: Array.isArray(item.betrokkenen) ? item.betrokkenen : [],
      externe_partij: item.externe_partij || null,
      actieplan: Array.isArray(item.actieplan) ? item.actieplan : [],
      suggestie: item.suggestie || null,
    }))
  : [],
```

---

## Bestanden te Wijzigen

| Bestand | Wijziging |
|---------|-----------|
| `supabase/functions/ai-extract-meeting-minute/index.ts` | Update prompts + normalisatie |

---

## Verwacht Resultaat

Na deze fix zal de AI bij elke action_item de volgende velden retourneren:

```json
{
  "action": "Uitleg geven over begeleidersdiensten",
  "assignee": "Erik",
  "deadline": "2026-01-30",
  "classification": "TAAK",
  "urgency": "high",
  "source_quote": "IrisZorg: begeleidersdiensten uitzetten (met uitleg Erik)",
  "confidence": 0.92,
  "onderwerp": "Begeleidersdiensten",
  "doelgroep": "ABCITO team",
  "actie_type": "Communicatie",
  "betrokkenen": [
    {"naam": "Erik", "rol": null, "relatie": "assignee"},
    {"naam": "Leonie", "rol": "teamleider", "relatie": "uitleg_ontvanger"},
    {"naam": "Dilmar", "rol": "planner", "relatie": "uitleg_ontvanger"}
  ],
  "externe_partij": {"naam": "IrisZorg", "type": "klant"},
  "actieplan": [
    "Plan meeting met Leonie en Dilmar",
    "Bereid uitleg voor over begeleidersdiensten",
    "Geef presentatie tijdens meeting",
    "Documenteer proces"
  ],
  "suggestie": "Plan vandaag nog een meeting met Leonie en Dilmar om de begeleidersdiensten voor IrisZorg te bespreken."
}
```

---

## Verificatie

Na implementatie:
1. Deploy Edge Function (automatisch)
2. Upload test PDF via Notulen Assistent
3. Controleer dat action_items de nieuwe velden bevatten
4. Controleer console logs voor extractie details
