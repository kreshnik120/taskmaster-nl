
# PR-1 -- Professional Chat Verrijking

## Overzicht
Upgrade de /professionals chat integratie naar enterprise niveau: verrijkte PAGE_CONTEXT, betere quick actions, dynamische URL-param verrijking, 3 nieuwe intents en 5 keywords.

## Stap 1: ChatWidget.tsx -- /professionals PAGE_CONTEXT vervangen (regel 63-71)

Vervang het bestaande blok door een verrijkte versie met:
- Uitgebreide description (talent search, bulk-acties, completeness score, functieniveaus, werkvormen, statussen, KPIs, zoek-fallback)
- 3 nieuwe quickActions: "Talent zoeken" (Users), "Profiel tips" (Sparkles), "Beschikbaarheid" (MapPin)

## Stap 2: ChatWidget.tsx -- Dynamische verrijking (na regel 332, voor return context)

Voeg /professionals enrichment toe:
- Leest `status` param (actief/inactief/op_pauze) en `functie_niveau` param uit URL
- Voegt filter info toe aan description

## Stap 3: agentIntents.ts -- 3 nieuwe intents (na regel 311, voor de `};`)

Voeg toe aan ALL_INTENTS:
- `talent_search`: search_agent, met examples
- `profile_completeness`: search_agent, met examples
- `export_professionals`: report_agent, met examples

## Stap 4: agentIntents.ts -- /professionals PAGE_AGENT_CONFIG vervangen (regel 346-355)

Vervang door uitgebreide versie met 7 intents (talent_search, search_skills, check_availability, match_professional, profile_completeness, export_professionals, send_email) en 4 contextFields.

## Stap 5: agentIntents.ts -- 5 keywords (na regel 614)

Voeg toe aan keywordMap: professional, talent, profiel, incompleet, exporteer.

## Gewijzigde Bestanden

1. `src/components/AIAssistant/ChatWidget.tsx` (wijzig) -- PAGE_CONTEXT upgrade + dynamische verrijking
2. `src/lib/agentIntents.ts` (wijzig) -- 3 intents, PAGE_AGENT_CONFIG uitbreiden, 5 keywords
