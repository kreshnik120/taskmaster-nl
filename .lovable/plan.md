
# KL-1 -- Klanten Chat Verrijking

## Overzicht
Upgrade de /klanten chat integratie naar enterprise niveau: verrijkte PAGE_CONTEXT, betere quick actions, dynamische URL-param verrijking, 3 nieuwe intents en 4 keywords.

## Stap 1: ChatWidget.tsx -- /klanten PAGE_CONTEXT vervangen (regel 73-82)

Vervang het bestaande blok door een verrijkte versie met:
- Uitgebreide description (3-level hierarchie, vacaturebeheer, matching criteria, tarieven, sectoren, doelgroepen, bureaus, KPIs)
- 3 nieuwe quickActions: "Hierarchie uitleg" (Building2), "Matching tips" (Sparkles), "Vacature beheer" (MapPin)
- Geen import wijzigingen nodig (alle icons al aanwezig)

## Stap 2: ChatWidget.tsx -- Dynamische verrijking (na regel 359, voor return context)

Voeg /klanten enrichment toe na het /professionals blok:
- Leest `bureau` en `sector` params uit URL
- Voegt filter info toe aan description ("De gebruiker filtert op bureau X en sector Y.")

## Stap 3: agentIntents.ts -- 3 nieuwe intents (na regel 337, voor de `};` op regel 338)

Voeg toe aan ALL_INTENTS:
- `client_overview`: match_agent, met examples ("Hoeveel klanten hebben we?", etc.)
- `check_tarieven`: report_agent, met examples ("Wat zijn de tarieven?", etc.)
- `vacancy_overview`: match_agent, met examples ("Openstaande vacatures", etc.)

## Stap 4: agentIntents.ts -- /klanten PAGE_AGENT_CONFIG vervangen (regel 362-371)

Vervang door uitgebreide versie met 7 intents (client_overview, search_locations, vacancy_overview, check_tarieven, match_professional, create_vacancy, send_email) en 4 contextFields (organization_id, sublocation_id, bureau_filter, sector_filter).

## Stap 5: agentIntents.ts -- 4 keywords (na regel 653)

Voeg toe aan keywordMap: klant, organisatie, tarief, vacature.

## Gewijzigde Bestanden

1. `src/components/AIAssistant/ChatWidget.tsx` (wijzig) -- PAGE_CONTEXT upgrade + dynamische verrijking
2. `src/lib/agentIntents.ts` (wijzig) -- 3 intents, PAGE_AGENT_CONFIG uitbreiden, 4 keywords
