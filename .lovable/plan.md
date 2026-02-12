
# FA-2 -- Facturatie Chat Integratie

## Overzicht
Voeg chat integratie toe voor de /facturatie module: PAGE_CONTEXT in ChatWidget met dynamische status-verrijking, en agent intents + keywords in agentIntents.ts.

## Stap 1: ChatWidget.tsx -- Imports (regel 2)

Voeg `Receipt` en `Euro` toe aan de lucide-react import.

## Stap 2: ChatWidget.tsx -- PAGE_CONTEXTS (na regel 182)

Voeg `/facturatie` entry toe direct voor de afsluitende `};` op regel 183:
- label: "Facturatie"
- icon: Receipt
- description: met auto-facturatie, statussen, KPIs, factuur types
- 3 quickActions: Euro/Openstaand overzicht, Receipt/Auto-facturatie uitleg, Sparkles/Facturatie tips

## Stap 3: ChatWidget.tsx -- Dynamische verrijking (na regel 299)

Voeg /facturatie enrichment toe in de currentPageContext useMemo, na het /planning blok en voor `return context;`:
- Leest `status` URL parameter
- Mapt naar leesbare labels (alle 9 FactuurStatus waarden)
- Voegt toe aan description: "De gebruiker bekijkt facturen met status X."

## Stap 4: agentIntents.ts -- 4 nieuwe intents (na regel 276)

Voeg toe aan ALL_INTENTS voor de afsluitende `};` op regel 277:
- `create_factuur`: label "Factuur aanmaken", agent report_agent, met examples
- `check_openstaand`: label "Openstaand checken", agent report_agent, met examples
- `send_herinnering`: label "Herinnering sturen", agent report_agent, requiresPayload: ["factuur_id"]
- `auto_facturatie`: label "Auto-facturatie", agent report_agent, met examples

## Stap 5: agentIntents.ts -- PAGE_AGENT_CONFIG (na regel 445)

Voeg `/facturatie` entry toe voor de afsluitende `};` op regel 446:
- primaryAgent: "report_agent"
- 4 intents: create_factuur, check_openstaand, send_herinnering, auto_facturatie
- contextFields: factuur_id, status_filter, type_filter

## Stap 6: agentIntents.ts -- 6 keywords (na regel 559)

Voeg toe aan keywordMap: factuur, facturen, openstaand, vervallen, herinnering, facturatie.

## Gewijzigde Bestanden

1. `src/components/AIAssistant/ChatWidget.tsx` (wijzig) -- Receipt/Euro import, /facturatie PAGE_CONTEXT, dynamische status verrijking
2. `src/lib/agentIntents.ts` (wijzig) -- 4 intents, /facturatie PAGE_AGENT_CONFIG, 6 keywords
