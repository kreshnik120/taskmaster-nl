// Deno.serve() is used at bottom of file
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders, handleCors, createAdminClient } from '../_shared/core.ts';
import { getFullInstructions, detectRoleFromQuestion } from "../_shared/abczorg-instructions.ts";
import { preflightCompletenessCheck, executePreflightActions } from "../_shared/preflight-completeness.ts";
import { semanticKnowledgeRetrieval, calculateSemanticConfidence, mergeSemanticAndCategoryResults } from "../_shared/semantic-retrieval.ts";
import { validateResponse, addValidationContext } from "../_shared/response-validator.ts";
import { disambiguateEntities, applyTemporalFilter, expandViaRelationships } from "../_shared/entity-resolver.ts";
import { softDeleteKnowledge, reinforceKnowledge, updateConfidence } from "../_shared/knowledge-crud.ts";
import { detectPromptInjection, validateAIOutput } from "../_shared/healthcare-mappings.ts";
import { buildSystemPrompt, type SystemPromptContext } from "../_shared/ai-chat-system-prompt.ts";
import { logMatchKnowledgeCall, calculateAvgSimilarity, countSharedResults } from "../_shared/telemetry.ts";

// ============================================
// SYSTEM PROMPT VERSION FOR CACHE INVALIDATION
// ============================================
// Increment this version when system prompt changes to invalidate old cached responses
const SYSTEM_PROMPT_VERSION = "v2.13.0-count-fast-path";

// ============================================
// CACHE CONFIGURATION
// ============================================
const CACHE_TTL_MINUTES = 5; // Short TTL for development/testing (was 24 hours)

// ============================================
// ⚡ ULTRA FAST PATH: COUNT QUERIES (NO AI NEEDED)
// ============================================
// Pattern: Direct database count for simple "hoeveel" questions
// Goal: 30+ seconds → <100ms response time
type FilterOperator = 'eq' | 'ilike' | 'contains';

interface FastPathFilter {
  column: string;
  value: string;
  operator: FilterOperator;
}

interface FastPathPattern {
  pattern: RegExp;
  table: string;
  countColumn: string;
  activeFilter?: boolean;
  responseTemplate: (count: number, filterContext?: string) => string;
  // Advanced filter support - single filter
  extractFilter?: (match: RegExpMatchArray) => FastPathFilter | null;
  // 🆕 GECOMBINEERDE FILTERS: meerdere filters tegelijk (sector+plaats, doelgroep+plaats, etc.)
  extractFilters?: (match: RegExpMatchArray) => FastPathFilter[];
}

// ============================================
// UITGEBREIDE FAST PATH PATTERNS - ALLE NEDERLANDSE VARIATIES
// ============================================
// Synoniemen voor count-prefixes: hoeveel, tel, aantal, wat is het aantal, totaal, geef, count
// Dit voorkomt dat gebruikers specifieke formulering moeten gebruiken

const FAST_PATH_COUNT_PATTERNS: FastPathPattern[] = [
  // ═══════════════════════════════════════════════════════════════════
  // WERKLOCATIES / SUBLOCATIES / LOCATIES / PLAATSEN / VESTIGINGEN
  // ═══════════════════════════════════════════════════════════════════
  {
    // "hoeveel werklocaties", "hoeveel locaties zijn er", "hoeveel plaatsen hebben we"
    pattern: /^hoeveel\s+(actieve\s+)?(werklocaties|sublocaties|locaties|plaatsen|vestigingen|werkplekken)\s*(zijn\s*er|hebben\s*we|totaal|in\s*totaal)?/i,
    table: 'client_sublocations',
    countColumn: 'id',
    activeFilter: true,
    responseTemplate: (count: number) => `📍 Er zijn **${count}** actieve werklocaties in het systeem.`
  },
  {
    // "tel de werklocaties", "tel alle locaties", "tel het aantal vestigingen"
    pattern: /^tel\s+(de\s+|het\s+|alle\s+)?(actieve\s+)?(werklocaties|sublocaties|locaties|plaatsen|vestigingen|werkplekken)/i,
    table: 'client_sublocations',
    countColumn: 'id',
    activeFilter: true,
    responseTemplate: (count: number) => `📍 Er zijn **${count}** actieve werklocaties in het systeem.`
  },
  {
    // "aantal locaties", "het aantal werklocaties", "aantal plaatsen totaal"
    pattern: /^(het\s+)?aantal\s+(actieve\s+)?(werklocaties|sublocaties|locaties|plaatsen|vestigingen|werkplekken)\s*(totaal)?/i,
    table: 'client_sublocations',
    countColumn: 'id',
    activeFilter: true,
    responseTemplate: (count: number) => `📍 Er zijn **${count}** actieve werklocaties in het systeem.`
  },
  {
    // "wat is het aantal werklocaties", "wat is het totaal aantal locaties"
    pattern: /^wat\s+is\s+(het\s+)?(totaal\s+)?(aantal\s+)?(actieve\s+)?(werklocaties|sublocaties|locaties|plaatsen|vestigingen|werkplekken)/i,
    table: 'client_sublocations',
    countColumn: 'id',
    activeFilter: true,
    responseTemplate: (count: number) => `📍 Er zijn **${count}** actieve werklocaties in het systeem.`
  },
  {
    // "totaal werklocaties", "totaal aantal locaties"
    pattern: /^totaal\s+(aantal\s+)?(actieve\s+)?(werklocaties|sublocaties|locaties|plaatsen|vestigingen|werkplekken)/i,
    table: 'client_sublocations',
    countColumn: 'id',
    activeFilter: true,
    responseTemplate: (count: number) => `📍 Er zijn **${count}** actieve werklocaties in het systeem.`
  },
  {
    // "geef me het aantal werklocaties", "geef het totaal locaties"
    pattern: /^geef\s+.{0,20}(aantal|totaal)\s*(actieve\s+)?(werklocaties|sublocaties|locaties|plaatsen|vestigingen|werkplekken)/i,
    table: 'client_sublocations',
    countColumn: 'id',
    activeFilter: true,
    responseTemplate: (count: number) => `📍 Er zijn **${count}** actieve werklocaties in het systeem.`
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // PROFESSIONALS / ZZP'ERS / UITZENDKRACHTEN / MEDEWERKERS
  // ═══════════════════════════════════════════════════════════════════
  {
    pattern: /^hoeveel\s+(professionals|zzp.?ers?|uitzendkrachten|medewerkers|zorgprofessionals)\s*(zijn\s*er|hebben\s*we|totaal)?/i,
    table: 'professionals',
    countColumn: 'id',
    activeFilter: false,
    responseTemplate: (count: number) => `👥 Er zijn **${count}** professionals geregistreerd in het systeem.`
  },
  {
    pattern: /^tel\s+(de\s+|het\s+|alle\s+)?(professionals|zzp.?ers?|uitzendkrachten|medewerkers|zorgprofessionals)/i,
    table: 'professionals',
    countColumn: 'id',
    activeFilter: false,
    responseTemplate: (count: number) => `👥 Er zijn **${count}** professionals geregistreerd in het systeem.`
  },
  {
    pattern: /^(het\s+)?aantal\s+(professionals|zzp.?ers?|uitzendkrachten|medewerkers|zorgprofessionals)\s*(totaal)?/i,
    table: 'professionals',
    countColumn: 'id',
    activeFilter: false,
    responseTemplate: (count: number) => `👥 Er zijn **${count}** professionals geregistreerd in het systeem.`
  },
  {
    pattern: /^wat\s+is\s+(het\s+)?(totaal\s+)?(aantal\s+)?(professionals|zzp.?ers?|uitzendkrachten|medewerkers|zorgprofessionals)/i,
    table: 'professionals',
    countColumn: 'id',
    activeFilter: false,
    responseTemplate: (count: number) => `👥 Er zijn **${count}** professionals geregistreerd in het systeem.`
  },
  {
    pattern: /^totaal\s+(aantal\s+)?(professionals|zzp.?ers?|uitzendkrachten|medewerkers|zorgprofessionals)/i,
    table: 'professionals',
    countColumn: 'id',
    activeFilter: false,
    responseTemplate: (count: number) => `👥 Er zijn **${count}** professionals geregistreerd in het systeem.`
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // SOLLICITATIES / KANDIDATEN / AANMELDINGEN
  // ═══════════════════════════════════════════════════════════════════
  {
    pattern: /^hoeveel\s+(sollicitaties|kandidaten|aanmeldingen|applicaties)\s*(zijn\s*er|hebben\s*we|totaal)?/i,
    table: 'professional_applications',
    countColumn: 'id',
    activeFilter: false,
    responseTemplate: (count: number) => `📋 Er zijn **${count}** sollicitaties in het systeem.`
  },
  {
    pattern: /^tel\s+(de\s+|het\s+|alle\s+)?(sollicitaties|kandidaten|aanmeldingen|applicaties)/i,
    table: 'professional_applications',
    countColumn: 'id',
    activeFilter: false,
    responseTemplate: (count: number) => `📋 Er zijn **${count}** sollicitaties in het systeem.`
  },
  {
    pattern: /^(het\s+)?aantal\s+(sollicitaties|kandidaten|aanmeldingen|applicaties)\s*(totaal)?/i,
    table: 'professional_applications',
    countColumn: 'id',
    activeFilter: false,
    responseTemplate: (count: number) => `📋 Er zijn **${count}** sollicitaties in het systeem.`
  },
  {
    pattern: /^wat\s+is\s+(het\s+)?(totaal\s+)?(aantal\s+)?(sollicitaties|kandidaten|aanmeldingen|applicaties)/i,
    table: 'professional_applications',
    countColumn: 'id',
    activeFilter: false,
    responseTemplate: (count: number) => `📋 Er zijn **${count}** sollicitaties in het systeem.`
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // KLANTEN / ORGANISATIES / OPDRACHTGEVERS
  // ═══════════════════════════════════════════════════════════════════
  {
    pattern: /^hoeveel\s+(klanten|cliënten|organisaties|opdrachtgevers|zorginstellingen)\s*(zijn\s*er|hebben\s*we|totaal)?/i,
    table: 'client_organizations',
    countColumn: 'id',
    activeFilter: false,
    responseTemplate: (count: number) => `🏢 Er zijn **${count}** klantorganisaties geregistreerd.`
  },
  {
    pattern: /^tel\s+(de\s+|het\s+|alle\s+)?(klanten|cliënten|organisaties|opdrachtgevers|zorginstellingen)/i,
    table: 'client_organizations',
    countColumn: 'id',
    activeFilter: false,
    responseTemplate: (count: number) => `🏢 Er zijn **${count}** klantorganisaties geregistreerd.`
  },
  {
    pattern: /^(het\s+)?aantal\s+(klanten|cliënten|organisaties|opdrachtgevers|zorginstellingen)\s*(totaal)?/i,
    table: 'client_organizations',
    countColumn: 'id',
    activeFilter: false,
    responseTemplate: (count: number) => `🏢 Er zijn **${count}** klantorganisaties geregistreerd.`
  },
  {
    pattern: /^wat\s+is\s+(het\s+)?(totaal\s+)?(aantal\s+)?(klanten|cliënten|organisaties|opdrachtgevers|zorginstellingen)/i,
    table: 'client_organizations',
    countColumn: 'id',
    activeFilter: false,
    responseTemplate: (count: number) => `🏢 Er zijn **${count}** klantorganisaties geregistreerd.`
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // PLAATSINGEN / OPDRACHTEN / ASSIGNMENTS
  // ═══════════════════════════════════════════════════════════════════
  {
    pattern: /^hoeveel\s+(plaatsingen|opdrachten|assignments|matches)\s*(zijn\s*er|hebben\s*we|totaal)?/i,
    table: 'assignments',
    countColumn: 'id',
    activeFilter: false,
    responseTemplate: (count: number) => `✅ Er zijn **${count}** plaatsingen in het systeem.`
  },
  {
    pattern: /^tel\s+(de\s+|het\s+|alle\s+)?(plaatsingen|opdrachten|assignments|matches)/i,
    table: 'assignments',
    countColumn: 'id',
    activeFilter: false,
    responseTemplate: (count: number) => `✅ Er zijn **${count}** plaatsingen in het systeem.`
  },
  {
    pattern: /^(het\s+)?aantal\s+(plaatsingen|opdrachten|assignments|matches)\s*(totaal)?/i,
    table: 'assignments',
    countColumn: 'id',
    activeFilter: false,
    responseTemplate: (count: number) => `✅ Er zijn **${count}** plaatsingen in het systeem.`
  },
  {
    pattern: /^wat\s+is\s+(het\s+)?(totaal\s+)?(aantal\s+)?(plaatsingen|opdrachten|assignments|matches)/i,
    table: 'assignments',
    countColumn: 'id',
    activeFilter: false,
    responseTemplate: (count: number) => `✅ Er zijn **${count}** plaatsingen in het systeem.`
  },

  // ═══════════════════════════════════════════════════════════════════
  // 🆕 GEAVANCEERDE FILTERS: GEOGRAFISCH (PLAATS)
  // ═══════════════════════════════════════════════════════════════════
  {
    // "hoeveel werklocaties in Amsterdam", "aantal locaties in Rotterdam"
    pattern: /^(hoeveel|tel|aantal)\s+(werklocaties|locaties|vestigingen|plaatsen)\s+in\s+(\w+)/i,
    table: 'client_sublocations',
    countColumn: 'id',
    activeFilter: true,
    extractFilter: (match: RegExpMatchArray) => ({
      column: 'plaats',
      value: match[3],
      operator: 'ilike' as FilterOperator
    }),
    responseTemplate: (count: number, ctx?: string) => `📍 Er zijn **${count}** actieve werklocaties in ${ctx || 'deze plaats'}.`
  },
  {
    // "werklocaties in Utrecht", "locaties in Arnhem"
    pattern: /^(werklocaties|locaties|vestigingen)\s+in\s+(\w+)/i,
    table: 'client_sublocations',
    countColumn: 'id',
    activeFilter: true,
    extractFilter: (match: RegExpMatchArray) => ({
      column: 'plaats',
      value: match[2],
      operator: 'ilike' as FilterOperator
    }),
    responseTemplate: (count: number, ctx?: string) => `📍 Er zijn **${count}** actieve werklocaties in ${ctx || 'deze plaats'}.`
  },

  // ═══════════════════════════════════════════════════════════════════
  // 🆕 GEAVANCEERDE FILTERS: SECTOR (GGZ, GHZ, VVT, etc.)
  // ═══════════════════════════════════════════════════════════════════
  {
    // "hoeveel GGZ locaties", "aantal GHZ werklocaties"
    pattern: /^(hoeveel|tel|aantal)\s+(GGZ|GHZ|VVT|Jeugdzorg|Ouderenzorg|Gehandicaptenzorg)\s+(werklocaties|locaties|vestigingen)/i,
    table: 'client_sublocations',
    countColumn: 'id',
    activeFilter: true,
    extractFilter: (match: RegExpMatchArray) => ({
      column: 'sector',
      value: match[2],
      operator: 'contains' as FilterOperator
    }),
    responseTemplate: (count: number, ctx?: string) => `📍 Er zijn **${count}** actieve ${ctx || 'sector'} werklocaties.`
  },
  {
    // "GGZ locaties", "VVT werklocaties"
    pattern: /^(GGZ|GHZ|VVT|Jeugdzorg|Ouderenzorg|Gehandicaptenzorg)\s+(werklocaties|locaties|vestigingen)/i,
    table: 'client_sublocations',
    countColumn: 'id',
    activeFilter: true,
    extractFilter: (match: RegExpMatchArray) => ({
      column: 'sector',
      value: match[1],
      operator: 'contains' as FilterOperator
    }),
    responseTemplate: (count: number, ctx?: string) => `📍 Er zijn **${count}** actieve ${ctx || 'sector'} werklocaties.`
  },
  {
    // "hoeveel locaties in sector GGZ", "werklocaties in sector VVT"
    pattern: /^(hoeveel|tel|aantal)?\s*(werklocaties|locaties|vestigingen)\s+in\s+sector\s+(GGZ|GHZ|VVT|Jeugdzorg|Ouderenzorg|Gehandicaptenzorg)/i,
    table: 'client_sublocations',
    countColumn: 'id',
    activeFilter: true,
    extractFilter: (match: RegExpMatchArray) => ({
      column: 'sector',
      value: match[3],
      operator: 'contains' as FilterOperator
    }),
    responseTemplate: (count: number, ctx?: string) => `📍 Er zijn **${count}** actieve werklocaties in sector ${ctx || ''}.`
  },

  // ═══════════════════════════════════════════════════════════════════
  // 🆕 GEAVANCEERDE FILTERS: DOELGROEP (LVB, Autisme, NAH, etc.)
  // ═══════════════════════════════════════════════════════════════════
  {
    // "hoeveel locaties met doelgroep LVB", "aantal werklocaties voor Autisme"
    pattern: /^(hoeveel|tel|aantal)\s+(werklocaties|locaties|vestigingen)\s+(met|voor)\s+(doelgroep\s+)?(LVB|Autisme|Psychiatrie|Ouderen|NAH|EMB|Verslaving|Dementie)/i,
    table: 'client_sublocations',
    countColumn: 'id',
    activeFilter: true,
    extractFilter: (match: RegExpMatchArray) => ({
      column: 'doelgroep',
      value: match[5],
      operator: 'contains' as FilterOperator
    }),
    responseTemplate: (count: number, ctx?: string) => `📍 Er zijn **${count}** actieve werklocaties met doelgroep ${ctx || ''}.`
  },
  {
    // "LVB locaties", "Autisme werklocaties"
    pattern: /^(LVB|Autisme|Psychiatrie|Ouderen|NAH|EMB|Verslaving|Dementie)\s+(werklocaties|locaties|vestigingen)/i,
    table: 'client_sublocations',
    countColumn: 'id',
    activeFilter: true,
    extractFilter: (match: RegExpMatchArray) => ({
      column: 'doelgroep',
      value: match[1],
      operator: 'contains' as FilterOperator
    }),
    responseTemplate: (count: number, ctx?: string) => `📍 Er zijn **${count}** actieve ${ctx || 'doelgroep'} werklocaties.`
  },

  // ═══════════════════════════════════════════════════════════════════
  // 🆕 GEAVANCEERDE FILTERS: GEZOCHTE FUNCTIES
  // ═══════════════════════════════════════════════════════════════════
  {
    // "hoeveel locaties zoeken Begeleiders", "aantal werklocaties voor VIG"
    pattern: /^(hoeveel|tel|aantal)\s+(werklocaties|locaties|vestigingen)\s+(zoeken|voor|met)\s+(Begeleider|VIG|Activiteitenbegeleider|Persoonlijk\s*begeleider|Verpleegkundige|Verzorgende|EVV)/i,
    table: 'client_sublocations',
    countColumn: 'id',
    activeFilter: true,
    extractFilter: (match: RegExpMatchArray) => ({
      column: 'gezochte_functies',
      value: match[4].replace(/\s+/g, ' ').trim(),
      operator: 'contains' as FilterOperator
    }),
    responseTemplate: (count: number, ctx?: string) => `📍 Er zijn **${count}** actieve werklocaties die ${ctx || 'deze functie'}s zoeken.`
  },
  {
    // "locaties die Begeleiders zoeken"
    pattern: /^(werklocaties|locaties|vestigingen)\s+die\s+(Begeleider|VIG|Activiteitenbegeleider|Persoonlijk\s*begeleider|Verpleegkundige|Verzorgende|EVV)s?\s+zoeken/i,
    table: 'client_sublocations',
    countColumn: 'id',
    activeFilter: true,
    extractFilter: (match: RegExpMatchArray) => ({
      column: 'gezochte_functies',
      value: match[2].replace(/\s+/g, ' ').trim(),
      operator: 'contains' as FilterOperator
    }),
    responseTemplate: (count: number, ctx?: string) => `📍 Er zijn **${count}** actieve werklocaties die ${ctx || 'deze functie'}s zoeken.`
  },

  // ═══════════════════════════════════════════════════════════════════
  // 🆕 PROFESSIONALS MET WOONPLAATS FILTER
  // ═══════════════════════════════════════════════════════════════════
  {
    // "hoeveel professionals in Amsterdam", "aantal ZZP'ers in Rotterdam"
    pattern: /^(hoeveel|tel|aantal)\s+(professionals|zzp.?ers?|uitzendkrachten|medewerkers|zorgprofessionals)\s+in\s+(?!sector|provincie|regio|Gelderland|Noord-Holland|Zuid-Holland|Utrecht|Brabant|Noord-Brabant|Limburg|Overijssel|Flevoland|Friesland|Groningen|Drenthe|Zeeland)(\w+)/i,
    table: 'professionals',
    countColumn: 'id',
    activeFilter: false,
    extractFilter: (match: RegExpMatchArray) => ({
      column: 'woonplaats',
      value: match[3],
      operator: 'ilike' as FilterOperator
    }),
    responseTemplate: (count: number, ctx?: string) => `👥 Er zijn **${count}** professionals woonachtig in ${ctx || 'deze plaats'}.`
  },
  {
    // "professionals in Utrecht stad", "zzp'ers in Arnhem"
    pattern: /^(professionals|zzp.?ers?|uitzendkrachten)\s+in\s+(?!sector|provincie|regio|Gelderland|Noord-Holland|Zuid-Holland|Utrecht|Brabant|Noord-Brabant|Limburg|Overijssel|Flevoland|Friesland|Groningen|Drenthe|Zeeland)(\w+)/i,
    table: 'professionals',
    countColumn: 'id',
    activeFilter: false,
    extractFilter: (match: RegExpMatchArray) => ({
      column: 'woonplaats',
      value: match[2],
      operator: 'ilike' as FilterOperator
    }),
    responseTemplate: (count: number, ctx?: string) => `👥 Er zijn **${count}** professionals woonachtig in ${ctx || 'deze plaats'}.`
  },

  // ═══════════════════════════════════════════════════════════════════
  // 🆕 PROFESSIONALS MET PROVINCIE/REGIO FILTER
  // ═══════════════════════════════════════════════════════════════════
  {
    // "hoeveel professionals in Gelderland", "aantal zzp'ers in Noord-Holland"
    pattern: /^(hoeveel|tel|aantal)\s+(professionals|zzp.?ers?|uitzendkrachten|medewerkers)\s+in\s+(provincie\s+)?(Gelderland|Noord-Holland|Zuid-Holland|Utrecht|Brabant|Noord-Brabant|Limburg|Overijssel|Flevoland|Friesland|Groningen|Drenthe|Zeeland)/i,
    table: 'professionals',
    countColumn: 'id',
    activeFilter: false,
    extractFilter: (match: RegExpMatchArray) => ({
      column: 'provincie',
      value: match[4],
      operator: 'ilike' as FilterOperator
    }),
    responseTemplate: (count: number, ctx?: string) => `👥 Er zijn **${count}** professionals in provincie ${ctx || 'deze regio'}.`
  },
  {
    // "professionals in regio Gelderland"
    pattern: /^(professionals|zzp.?ers?|uitzendkrachten)\s+in\s+(regio|provincie)\s+(Gelderland|Noord-Holland|Zuid-Holland|Utrecht|Brabant|Noord-Brabant|Limburg|Overijssel|Flevoland|Friesland|Groningen|Drenthe|Zeeland)/i,
    table: 'professionals',
    countColumn: 'id',
    activeFilter: false,
    extractFilter: (match: RegExpMatchArray) => ({
      column: 'provincie',
      value: match[3],
      operator: 'ilike' as FilterOperator
    }),
    responseTemplate: (count: number, ctx?: string) => `👥 Er zijn **${count}** professionals in provincie ${ctx || 'deze regio'}.`
  },

  // ═══════════════════════════════════════════════════════════════════
  // 🆕 PROFESSIONALS MET WERKVORM FILTER (ZZP, Uitzend, Detachering)
  // ═══════════════════════════════════════════════════════════════════
  {
    // "hoeveel ZZP professionals", "aantal ZZP'ers"
    pattern: /^(hoeveel|tel|aantal)\s+(ZZP|zzp)\s*(professionals|.?ers?|medewerkers)?/i,
    table: 'professionals',
    countColumn: 'id',
    activeFilter: false,
    extractFilter: () => ({
      column: 'werkvorm',
      value: 'ZZP',
      operator: 'ilike' as FilterOperator
    }),
    responseTemplate: (count: number) => `👥 Er zijn **${count}** ZZP professionals geregistreerd.`
  },
  {
    // "hoeveel uitzendkracht professionals", "aantal uitzendkrachten"
    pattern: /^(hoeveel|tel|aantal)\s+(uitzend|detacherings?)\s*(krachten?|professionals|medewerkers)?/i,
    table: 'professionals',
    countColumn: 'id',
    activeFilter: false,
    extractFilter: () => ({
      column: 'werkvorm',
      value: 'Uitzend',
      operator: 'ilike' as FilterOperator
    }),
    responseTemplate: (count: number) => `👥 Er zijn **${count}** uitzendkracht professionals geregistreerd.`
  },

  // ═══════════════════════════════════════════════════════════════════
  // 🆕 GECOMBINEERDE FILTERS: SECTOR + PROVINCIE (MOET EERST VOOR PLAATS)
  // ═══════════════════════════════════════════════════════════════════════
  {
    // "hoeveel GGZ locaties in Gelderland", "aantal VVT werklocaties in Noord-Holland"
    pattern: /^(hoeveel|tel|aantal)\s+(GGZ|GHZ|VVT|Jeugdzorg|Ouderenzorg|Gehandicaptenzorg)\s+(werklocaties|locaties|vestigingen)\s+in\s+(Gelderland|Noord-Holland|Zuid-Holland|Utrecht|Brabant|Noord-Brabant|Limburg|Overijssel|Flevoland|Friesland|Groningen|Drenthe|Zeeland)/i,
    table: 'client_sublocations',
    countColumn: 'id',
    activeFilter: true,
    extractFilters: (match: RegExpMatchArray) => [
      { column: 'sector', value: match[2], operator: 'contains' as FilterOperator },
      { column: 'provincie', value: match[4], operator: 'ilike' as FilterOperator }
    ],
    responseTemplate: (count: number, ctx?: string) => `📍 Er zijn **${count}** actieve ${ctx || 'gefilterde'} werklocaties.`
  },

  // ═══════════════════════════════════════════════════════════════════
  // 🆕 GECOMBINEERDE FILTERS: DOELGROEP + PROVINCIE (MOET EERST VOOR PLAATS)
  // ═══════════════════════════════════════════════════════════════════════
  {
    // "hoeveel LVB locaties in Gelderland", "aantal Autisme werklocaties in Noord-Holland"
    pattern: /^(hoeveel|tel|aantal)\s+(LVB|Autisme|Psychiatrie|NAH|EMB|Verslaving|Dementie|Ouderen)\s+(werklocaties|locaties|vestigingen)\s+in\s+(Gelderland|Noord-Holland|Zuid-Holland|Utrecht|Brabant|Noord-Brabant|Limburg|Overijssel|Flevoland|Friesland|Groningen|Drenthe|Zeeland)/i,
    table: 'client_sublocations',
    countColumn: 'id',
    activeFilter: true,
    extractFilters: (match: RegExpMatchArray) => [
      { column: 'doelgroep', value: match[2], operator: 'contains' as FilterOperator },
      { column: 'provincie', value: match[4], operator: 'ilike' as FilterOperator }
    ],
    responseTemplate: (count: number, ctx?: string) => `📍 Er zijn **${count}** actieve ${ctx || 'gefilterde'} werklocaties.`
  },

  // ═══════════════════════════════════════════════════════════════════
  // 🆕 GECOMBINEERDE FILTERS: SECTOR + PLAATS (NA PROVINCIE PATTERNS)
  // ═══════════════════════════════════════════════════════════════════════
  {
    // "hoeveel GGZ locaties in Amsterdam", "aantal VVT werklocaties in Rotterdam"
    pattern: /^(hoeveel|tel|aantal)\s+(GGZ|GHZ|VVT|Jeugdzorg|Ouderenzorg|Gehandicaptenzorg)\s+(werklocaties|locaties|vestigingen)\s+in\s+(\w+)/i,
    table: 'client_sublocations',
    countColumn: 'id',
    activeFilter: true,
    extractFilters: (match: RegExpMatchArray) => [
      { column: 'sector', value: match[2], operator: 'contains' as FilterOperator },
      { column: 'plaats', value: match[4], operator: 'ilike' as FilterOperator }
    ],
    responseTemplate: (count: number, ctx?: string) => `📍 Er zijn **${count}** actieve ${ctx || 'gefilterde'} werklocaties.`
  },

  // ═══════════════════════════════════════════════════════════════════
  // 🆕 GECOMBINEERDE FILTERS: DOELGROEP + PLAATS (NA PROVINCIE PATTERNS)
  // ═══════════════════════════════════════════════════════════════════════
  {
    // "hoeveel LVB locaties in Amsterdam", "aantal Autisme werklocaties in Rotterdam"
    pattern: /^(hoeveel|tel|aantal)\s+(LVB|Autisme|Psychiatrie|NAH|EMB|Verslaving|Dementie|Ouderen)\s+(werklocaties|locaties|vestigingen)\s+in\s+(\w+)/i,
    table: 'client_sublocations',
    countColumn: 'id',
    activeFilter: true,
    extractFilters: (match: RegExpMatchArray) => [
      { column: 'doelgroep', value: match[2], operator: 'contains' as FilterOperator },
      { column: 'plaats', value: match[4], operator: 'ilike' as FilterOperator }
    ],
    responseTemplate: (count: number, ctx?: string) => `📍 Er zijn **${count}** actieve ${ctx || 'gefilterde'} werklocaties.`
  },

  // ═══════════════════════════════════════════════════════════════════
  // 🆕 GECOMBINEERDE FILTERS: SECTOR + DOELGROEP
  // ═══════════════════════════════════════════════════════════════════
  {
    // "hoeveel GGZ LVB locaties", "aantal VVT Autisme werklocaties"
    pattern: /^(hoeveel|tel|aantal)\s+(GGZ|GHZ|VVT|Jeugdzorg)\s+(LVB|Autisme|Psychiatrie|NAH|EMB|Verslaving|Dementie)\s+(werklocaties|locaties|vestigingen)/i,
    table: 'client_sublocations',
    countColumn: 'id',
    activeFilter: true,
    extractFilters: (match: RegExpMatchArray) => [
      { column: 'sector', value: match[2], operator: 'contains' as FilterOperator },
      { column: 'doelgroep', value: match[3], operator: 'contains' as FilterOperator }
    ],
    responseTemplate: (count: number, ctx?: string) => `📍 Er zijn **${count}** actieve ${ctx || 'gefilterde'} werklocaties.`
  }
];

// Helper: Build SSE response for fast path (no AI streaming needed)
function buildFastPathSSEResponse(content: string, encoder: TextEncoder): ReadableStream {
  return new ReadableStream({
    start(controller) {
      // Send content as single SSE chunk
      const sseData = JSON.stringify({
        choices: [{
          delta: { content },
          index: 0,
          finish_reason: null
        }]
      });
      controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
      
      // Send finish chunk
      const finishData = JSON.stringify({
        choices: [{
          delta: {},
          index: 0,
          finish_reason: 'stop'
        }]
      });
      controller.enqueue(encoder.encode(`data: ${finishData}\n\n`));
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      controller.close();
    }
  });
}

// ============================================
// SHA256 HASH HELPER FOR CACHE KEYS
// ============================================
async function sha256Hash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============================================
// RETRY HELPER WITH EXPONENTIAL BACKOFF
// ============================================
async function persistMessage(
  supabase: any,
  message: { user_id: string; org_id: string; conversation_id: string; role: string; content: string; metadata?: any },
  retries: number = 3
): Promise<{ success: boolean; messageId?: string }> {
  // Transform metadata to used_knowledge for ai_chat_messages table
  const insertData: any = {
    user_id: message.user_id,
    org_id: message.org_id,
    conversation_id: message.conversation_id,
    role: message.role,
    content: message.content.trim()
  };
  
  // Extract used_knowledge from metadata if present
  if (message.metadata?.usedKnowledge || message.metadata?.knowledge_ids_for_feedback) {
    insertData.used_knowledge = message.metadata.usedKnowledge || message.metadata.knowledge_ids_for_feedback || [];
  }
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    const { data, error } = await supabase
      .from('ai_chat_messages')
      .insert(insertData)
      .select('id')
      .single();
    
    if (!error && data) {
      console.log(`✅ ${insertData.role} message persisted (attempt ${attempt}/${retries}), id: ${data.id}`);
      return { success: true, messageId: data.id };
    }
    
    // ✅ NIEUWE LOGICA: Check of het een duplicate constraint error is
    if (error?.code === '23505') { // PostgreSQL unique violation
      console.log(`ℹ️ ${insertData.role} message already exists (deduplicated), fetching existing ID...`);
      
      // Haal bestaande message ID op
      const { data: existing } = await supabase
        .from('ai_chat_messages')
        .select('id')
        .eq('user_id', insertData.user_id)
        .eq('conversation_id', insertData.conversation_id)
        .eq('role', insertData.role)
        .eq('content', insertData.content)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (existing?.id) {
        console.log(`✅ Found existing message ID: ${existing.id}`);
        return { success: true, messageId: existing.id };
      }
      
      // Fallback zonder ID (edge case)
      console.warn(`⚠️ Duplicate detected but could not fetch existing ID`);
      return { success: true };
    }
    
    console.warn(`⚠️ Persist retry ${attempt}/${retries}:`, error);
    if (attempt < retries) {
      await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt - 1)));
    }
  }
  
  console.error(`❌ Failed to persist ${insertData.role} message after ${retries} attempts`);
  return { success: false };
}

// =============================================================================
// DEPRECATED: Old keyword-based confidence (replaced by semantic)
// Kept for backwards compatibility but not used in new flow
// =============================================================================
function calculateAnswerConfidenceDeprecated(
  knowledgeItems: any[],
  queryKeywords: string[],
  questionText: string,
  clientsContext: any[] = []
): { confidence: number; reasoning: string; gaps: string[] } {
  // This function is deprecated - use calculateSemanticConfidence from semantic-retrieval.ts instead
  if (knowledgeItems.length === 0 && clientsContext.length === 0) {
    return {
      confidence: 0,
      reasoning: "Geen relevante bronnen gevonden in de knowledge base",
      gaps: ["Geen geldige bronnen beschikbaar voor deze vraag"]
    };
  }

  let score = 0;
  const gaps: string[] = [];
  const reasons: string[] = [];
  
  // ✅ NIEUWE SCORING: Bron-gebaseerd, geen keyword bias
  
  // 1. SOURCE QUALITY (0-40 punten)
  const sourceCount = knowledgeItems.length + clientsContext.length;
  const sourceScore = Math.min((sourceCount / 3) * 40, 40);
  score += sourceScore;
  
  if (sourceCount === 0) {
    gaps.push("❌ Geen bronnen gevonden");
  } else if (sourceCount === 1) {
    gaps.push("⚠️ Slechts 1 bron - niet gevalideerd");
    reasons.push(`1 bron beschikbaar`);
  } else {
    reasons.push(`${sourceCount} bronnen geraadpleegd`);
  }

  // 2. CONFIDENCE SCORE van bronnen (0-40 punten)
  const avgConfidence = knowledgeItems.length > 0 
    ? knowledgeItems.reduce((sum, kb) => sum + (kb.confidence_score || 0.5), 0) / knowledgeItems.length 
    : 0.75;
  const confidenceScore = avgConfidence * 40;
  score += confidenceScore;
  
  if (avgConfidence < 0.6) {
    gaps.push("⚠️ Lage betrouwbaarheid van bronnen");
  } else if (avgConfidence >= 0.8) {
    reasons.push(`Hoge bronbetrouwbaarheid (${(avgConfidence * 100).toFixed(0)}%)`);
  }

  // 3. RECENCY (0-10 punten)
  const now = Date.now();
  const avgAge = knowledgeItems.length > 0
    ? knowledgeItems.reduce((sum, kb) => {
        const age = (now - new Date(kb.updated_at || kb.created_at || now).getTime()) / (1000 * 60 * 60 * 24);
        return sum + age;
      }, 0) / knowledgeItems.length
    : 0;
  
  let recencyScore = 0;
  if (avgAge < 7) recencyScore = 10;
  else if (avgAge < 30) recencyScore = 7;
  else if (avgAge < 90) recencyScore = 4;
  
  score += recencyScore;
  if (avgAge > 90) {
    gaps.push("⚠️ Bronnen mogelijk verouderd (>90 dagen)");
  }

  // 4. CLIENTS DATA BOOST (0-10 punten)
  const clientsRelatedKeywords = ['tarief', 'prijs', 'kostprijs', 'contract', 'overeenkomst'];
  const isClientsQuery = queryKeywords.some(kw => 
    clientsRelatedKeywords.some(ct => kw.toLowerCase().includes(ct))
  );
  
  if (clientsContext.length > 0 && isClientsQuery) {
    score += 10;
    reasons.push(`📋 Relevante cliëntdata beschikbaar`);
  }

  // Convert to 0-1 scale (max 100 punten)
  const confidence = Math.min(score / 100, 1.0);
  
  return {
    confidence,
    reasoning: reasons.length > 0 ? reasons.join(', ') : `Confidence: ${(confidence * 100).toFixed(0)}%`,
    gaps: gaps.length > 0 ? gaps : []
  };
}

// Helper: Extract client name from knowledge item
function extractClientFromKnowledge(kb: any): string | null {
  // Check kb.value.client_name first (most direct)
  if (kb.value?.client_name) {
    const clientLower = kb.value.client_name.toLowerCase();
    if (clientLower.includes('swz') || clientLower.includes('stichting swz') || clientLower.includes('citozorg')) return 'swz';
    if (clientLower.includes('prisma')) return 'prisma';
    if (clientLower.includes('lunet')) return 'lunet';
    if (clientLower.includes('evb')) return 'evb';
  }
  
  // Check source (document names)
  if (kb.source) {
    const sourceLower = kb.source.toLowerCase();
    if (sourceLower.includes('swz') || sourceLower.includes('citozorg') || sourceLower.includes('stichting_swz')) return 'swz';
    if (sourceLower.includes('prisma')) return 'prisma';
    if (sourceLower.includes('lunet')) return 'lunet';
    if (sourceLower.includes('evb')) return 'evb';
  }
  
  // Check key
  const keyLower = kb.key.toLowerCase();
  if (keyLower.includes('swz') || keyLower.includes('stichting_swz') || keyLower.includes('citozorg')) return 'swz';
  if (keyLower.includes('prisma')) return 'prisma';
  if (keyLower.includes('lunet')) return 'lunet';
  if (keyLower.includes('evb')) return 'evb';
  
  // Check value (last resort)
  const valueStr = JSON.stringify(kb.value).toLowerCase();
  if (valueStr.includes('stichting swz') || valueStr.includes('citozorg') || valueStr.includes('swz')) return 'swz';
  if (valueStr.includes('prisma')) return 'prisma';
  if (valueStr.includes('lunet')) return 'lunet';
  if (valueStr.includes('evb')) return 'evb';
  
  return null;
}

// ============================================
// BUSINESS QUERY DETECTION & KVK ENTITY EXTRACTION
// ============================================
function detectBusinessQuery(question: string): {
  isBusinessQuery: boolean;
  entities: string[];
  queryType: 'bedrijfsinfo' | 'adres' | 'kvk_nummer' | 'contact' | 'algemeen';
} {
  const lowerQ = question.toLowerCase();
  
  // Pattern matching voor business keywords
  const businessKeywords = [
    'kvk', 'kvk nummer', 'kvk-nummer', 'kamer van koophandel',
    'adres', 'bezoekadres', 'postcode', 'plaats', 'locatie',
    'bedrijf', 'organisatie', 'onderneming', 'firma',
    'contactgegevens', 'telefoonnummer', 'email', 'website',
    'citozorg', 'abczorg', 'stichting', 'b.v.', 'bv'
  ];
  
  const isBusinessQuery = businessKeywords.some(keyword => lowerQ.includes(keyword));
  
  // Extract potential business entities
  const entities: string[] = [];
  
  // 1. Extract KVK nummers (8 cijfers)
  const kvkMatches = question.match(/\b(\d{8})\b/g);
  if (kvkMatches) entities.push(...kvkMatches);
  
  // 2. Extract bedrijfsnamen (CitoZorg, ABCzorg, etc.)
  const namePatterns = [
    /\b(CitoZorg|Cito Zorg|Cito-Zorg)\b/gi,
    /\b(ABCzorg|ABC zorg|ABC-zorg)\b/gi,
    /\b(Stichting\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    /\b([A-Z][a-z]+\s+(?:B\.V\.|BV))\b/g
  ];
  
  namePatterns.forEach(pattern => {
    const matches = question.match(pattern);
    if (matches) entities.push(...matches.map(m => m.trim()));
  });
  
  // Determine query type
  let queryType: 'bedrijfsinfo' | 'adres' | 'kvk_nummer' | 'contact' | 'algemeen' = 'algemeen';
  if (lowerQ.includes('kvk') || lowerQ.includes('kamer van koophandel')) queryType = 'kvk_nummer';
  else if (lowerQ.includes('adres') || lowerQ.includes('postcode') || lowerQ.includes('plaats')) queryType = 'adres';
  else if (lowerQ.includes('contact') || lowerQ.includes('telefoon') || lowerQ.includes('email')) queryType = 'contact';
  else if (lowerQ.includes('bedrijf') || lowerQ.includes('organisatie')) queryType = 'bedrijfsinfo';
  
  return {
    isBusinessQuery,
    entities: [...new Set(entities)], // Remove duplicates
    queryType
  };
}

// PHASE 2: Get suggested source documents for conflicting knowledge items
async function getSuggestedDocuments(
  conflictedKnowledgeIds: string[],
  supabase: any
): Promise<{ document_name: string; kb_count: number }[]> {
  const { data: knowledgeItems } = await supabase
    .from('ai_knowledge_base')
    .select('source, key')
    .in('id', conflictedKnowledgeIds)
    .is('deleted_at', null);
  
  // Extract and count source documents
  const documentCounts: { [doc: string]: number } = {};
  
  knowledgeItems?.forEach((kb: any) => {
    if (kb.source?.startsWith('document:')) {
      const docName = kb.source.replace('document:', '');
      documentCounts[docName] = (documentCounts[docName] || 0) + 1;
    }
  });
  
  return Object.entries(documentCounts)
    .map(([name, count]) => ({ document_name: name, kb_count: count }))
    .sort((a, b) => b.kb_count - a.kb_count); // Most relevant first
}

// SPRINT 2: Semantic duplicate detection with AI
async function findSemanticDuplicates(
  newItem: { key: string; value: any; category: string },
  existingItems: any[],
  lovableApiKey: string
): Promise<Array<{ id: string; similarity: number; reason: string }>> {
  // Filter op zelfde category (performance optimization)
  const sameCategoryItems = existingItems.filter(item => item.category === newItem.category);
  
  if (sameCategoryItems.length === 0) return [];
  
  const semanticMatches: Array<{ id: string; similarity: number; reason: string }> = [];
  
  // Check elk item met AI
  for (const existingItem of sameCategoryItems) {
    const prompt = `Vergelijk deze twee knowledge items semantisch:

NIEUW ITEM:
Key: ${newItem.key}
Value: ${JSON.stringify(newItem.value, null, 2)}

BESTAAND ITEM:
Key: ${existingItem.key}
Value: ${JSON.stringify(existingItem.value, null, 2)}

Analyseer:
1. Betekenen ze hetzelfde? (synoniemen, taalvariaties)
2. Is het dezelfde informatie in andere woorden?
3. Overlappen ze qua context (client, contractperiode)?

Return ALLEEN een JSON object:
{
  "similarity": 0.0-1.0,
  "reason": "kort waarom wel/niet duplicate"
}`;

    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) continue;

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      
      // Parse JSON uit response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.similarity >= 0.85) {
          semanticMatches.push({
            id: existingItem.id,
            similarity: parsed.similarity,
            reason: parsed.reason || "Semantisch vergelijkbaar"
          });
        }
      }
    } catch (error) {
      console.error(`[SEMANTIC] Error comparing with ${existingItem.id}:`, error);
    }
  }
  
  return semanticMatches.sort((a, b) => b.similarity - a.similarity);
}

// SPRINT 2: Deep conflict analysis with 3-tier system
async function deepConflictAnalysis(
  items: any[],
  lovableApiKey: string
): Promise<{
  recommended_id: string | null;
  confidence: number;
  tier: 'auto_resolve' | 'suggestion' | 'preserve_all';
  reason: string;
  actions?: { item_id: string; action: 'keep' | 'delete' }[];
}> {
  // STEP 1: Heuristic checks (basis score)
  let baseConfidence = 0;
  let heuristicWinner: string | null = null;
  
  const scores = items.map(item => {
    let score = 0;
    
    // Recency check
    const ageInDays = (Date.now() - new Date(item.created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (ageInDays < 7) score += 30;
    else if (ageInDays < 30) score += 20;
    else if (ageInDays > 90) score -= 10; // Penalty voor oude items
    
    // Confidence score
    score += (item.confidence_score || 0.5) * 40;
    
    // Usage count
    if ((item.usage_count || 0) > 10) score += 20;
    else if ((item.usage_count || 0) > 0) score += 10;
    
    // Source
    if (item.source?.includes('document')) score += 10;
    
    return { id: item.id, key: item.key, score, item };
  });
  
  scores.sort((a, b) => b.score - a.score);
  heuristicWinner = scores[0].id;
  baseConfidence = scores[0].score / 100;
  
  // STEP 2: AI Deep Analysis
  const prompt = `Analyseer dit kennisconflict:

ITEMS:
${items.map((item, i) => `
Item ${i + 1} (ID: ${item.id}):
- Key: ${item.key}
- Value: ${JSON.stringify(item.value, null, 2)}
- Created: ${new Date(item.created_at).toLocaleDateString('nl-NL')}
- Usage: ${item.usage_count || 0} keer gebruikt
- Confidence: ${((item.confidence_score || 0.5) * 100).toFixed(0)}%
- Source: ${item.source || 'unknown'}
`).join('\n')}

VRAAG: Welk item is het meest betrouwbaar? Waarom?

Return ALLEEN een JSON object:
{
  "winner_id": "uuid of null als onduidelijk",
  "confidence": 0.0-1.0,
  "reasoning": "Max 2 zinnen waarom dit de beste keuze is",
  "should_delete_others": true/false
}`;

  let aiConfidence = 0;
  let aiWinnerId: string | null = null;
  let aiReasoning = "";
  
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        aiWinnerId = parsed.winner_id;
        aiConfidence = parsed.confidence || 0;
        aiReasoning = parsed.reasoning || "";
      }
    }
  } catch (error) {
    console.error('[DEEP-ANALYSIS] AI call failed:', error);
  }
  
  // STEP 3: Combine scores
  const finalConfidence = (baseConfidence * 0.4) + (aiConfidence * 0.6);
  const winnerId = aiWinnerId || heuristicWinner;
  
  // STEP 4: Tier assignment
  let tier: 'auto_resolve' | 'suggestion' | 'preserve_all';
  if (finalConfidence >= 0.95) {
    tier = 'auto_resolve';
  } else if (finalConfidence >= 0.70) {
    tier = 'suggestion';
  } else {
    tier = 'preserve_all';
  }
  
  // Build reason
  const reasons = [];
  if (aiReasoning) reasons.push(aiReasoning);
  const winnerItem = items.find(i => i.id === winnerId);
  if (winnerItem) {
    const ageInDays = (Date.now() - new Date(winnerItem.created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (ageInDays < 7) reasons.push('nieuwste data');
    if ((winnerItem.usage_count || 0) > 5) reasons.push('meest gebruikt');
  }
  
  const finalReason = reasons.length > 0 
    ? reasons.join(', ') 
    : `Analyse score: ${(finalConfidence * 100).toFixed(0)}%`;
  
  // Build actions
  const actions = winnerId 
    ? items.map(item => ({
        item_id: item.id,
        action: (item.id === winnerId ? 'keep' : 'delete') as 'keep' | 'delete'
      }))
    : [];
  
  return {
    recommended_id: winnerId,
    confidence: finalConfidence,
    tier,
    reason: finalReason,
    actions
  };
}

// Detect conflicts between knowledge items with SPRINT 2 deep analysis
async function detectKnowledgeConflicts(
  knowledgeBase: any[],
  supabase: any,
  orgId: string,
  lovableApiKey: string
): Promise<void> {
  // Group by category + client
  const grouped: { [key: string]: any[] } = {};
  
  knowledgeBase.forEach(kb => {
    const client = extractClientFromKnowledge(kb) || 'unknown';
    const groupKey = `${kb.category}_${client}`;
    
    if (!grouped[groupKey]) grouped[groupKey] = [];
    grouped[groupKey].push(kb);
  });
  
  // Check for conflicts within each group
  for (const [groupKey, items] of Object.entries(grouped)) {
    if (items.length > 1) {
      // Extract tariff values for comparison
      const tariffs = items.map(kb => {
        const val = kb.value;
        return val?.werkdagen_dagtarief?.all_in_tarief || 
               val?.overdag || 
               val?.helpende_niveau_2?.overdag ||
               val?.verzorgende_ig_niveau_3?.overdag ||
               JSON.stringify(val);
      }).filter(Boolean);
      
      const uniqueTariffs = [...new Set(tariffs.map(t => typeof t === 'number' ? t : JSON.stringify(t)))];
      
      if (uniqueTariffs.length > 1) {
        console.error(`🚨 CONFLICT DETECTED in ${groupKey}:`, uniqueTariffs);
        
        // Get suggested documents
        const suggestedDocs = await getSuggestedDocuments(
          items.map(kb => kb.id),
          supabase
        );
        
        // SPRINT 2: Deep conflict analysis with 3-tier system
        const aiRecommendation = await deepConflictAnalysis(items, lovableApiKey);
        
        // TIER 1: Auto-resolve (≥95% confidence)
        if (aiRecommendation.tier === 'auto_resolve' && aiRecommendation.recommended_id) {
          console.log(`🤖 AUTO-RESOLVE (Tier 1): ${groupKey} (${(aiRecommendation.confidence * 100).toFixed(0)}%)`);
          
          // Use unified softDeleteKnowledge for org-scoped deletion with audit trail
          const losers = items.filter(kb => kb.id !== aiRecommendation.recommended_id);
          for (const loser of losers) {
            try {
              await softDeleteKnowledge(supabase as any, loser.id, {
                reason: aiRecommendation.reason,
                deletedBy: 'AI_AUTO_RESOLVE',
                metadata: {
                  conflict_group: groupKey,
                  winner_id: aiRecommendation.recommended_id,
                  confidence: aiRecommendation.confidence,
                  tier: 'auto_resolve',
                  original_key: loser.key,
                  original_value: loser.value,
                  original_confidence: loser.confidence_score
                }
              });
            } catch (deleteError) {
              console.error(`Failed to soft-delete knowledge ${loser.id}:`, deleteError);
            }
          }
          
          await supabase.from('business_intelligence').insert({
            org_id: orgId,
            intelligence_type: 'auto_cleanup',
            type: 'knowledge',
            severity: 'low',
            priority: 'low',
            title: `Auto-resolved: ${groupKey}`,
            description: `AI heeft ${losers.length} item(s) verwijderd (${(aiRecommendation.confidence * 100).toFixed(0)}% zekerheid)`,
            data: {
              winner_id: aiRecommendation.recommended_id,
              deleted_ids: losers.map(kb => kb.id),
              reason: aiRecommendation.reason,
              restore_available_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            },
            impact_score: 0.3
          });
          
          continue;
        }
        
        // TIER 2: Suggestion (70-94% confidence)
        if (aiRecommendation.tier === 'suggestion') {
          console.log(`💡 SUGGESTION (Tier 2): ${groupKey} (${(aiRecommendation.confidence * 100).toFixed(0)}%)`);
          
          await supabase.from('business_intelligence').insert({
            org_id: orgId,
            intelligence_type: 'ai_suggestion',
            type: 'knowledge',
            severity: 'medium',
            priority: 'medium',
            title: `AI Suggestie: ${groupKey}`,
            description: `AI stelt voor om ${aiRecommendation.actions?.filter(a => a.action === 'delete').length} item(s) te verwijderen (${(aiRecommendation.confidence * 100).toFixed(0)}% zekerheid)`,
            data: {
              recommended_actions: aiRecommendation.actions,
              reasoning: aiRecommendation.reason,
              confidence: aiRecommendation.confidence,
              requires_approval: true,
              conflicting_items: items.map(kb => ({
                id: kb.id,
                key: kb.key,
                value: kb.value,
                confidence: kb.confidence_score,
                usage_count: kb.usage_count,
                created_at: kb.created_at
              })),
              suggested_documents: suggestedDocs
            },
            impact_score: 0.6
          });
          
          continue;
        }
        
        // TIER 3: Preserve all (<70% confidence)
        if (aiRecommendation.tier === 'preserve_all') {
          console.log(`⚠️ PRESERVE ALL (Tier 3): ${groupKey} (${(aiRecommendation.confidence * 100).toFixed(0)}%)`);
          
          // Mark all items as needing review - include org_id filter for security
          await supabase
            .from('ai_knowledge_base')
            .update({ needs_review: true })
            .in('id', items.map(kb => kb.id))
            .eq('org_id', orgId); // Added org_id filter for security
          
          await supabase.from('business_intelligence').insert({
            org_id: orgId,
            intelligence_type: 'data_quality',
            type: 'data_quality',
            severity: 'high',
            priority: 'high',
            title: `Complex conflict: ${groupKey}`,
            description: `AI kan niet met zekerheid bepalen welk item correct is (${(aiRecommendation.confidence * 100).toFixed(0)}%). Menselijke review vereist.`,
            data: {
              conflicting_items: items.map(kb => ({
                id: kb.id,
                key: kb.key,
                value: kb.value,
                confidence: kb.confidence_score,
                usage_count: kb.usage_count,
                created_at: kb.created_at
              })),
              unique_values: uniqueTariffs,
              ai_reasoning: aiRecommendation.reason,
              suggested_documents: suggestedDocs
            },
            impact_score: 0.9
          });
        }
      }
    }
  }
}

// Track knowledge usage based on AI response content with CLIENT VALIDATION
async function trackKnowledgeUsage(
  responseText: string,
  availableKnowledge: any[],
  supabase: any,
  userId: string,
  messages: any[]
): Promise<string[]> {
  const usedKnowledgeIds: string[] = [];
  const responseLower = responseText.toLowerCase();
  
  // Extract client name from user's question
  const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';
  const clientMentions = ['swz', 'stichting swz', 'prisma', 'lunet', 'evb'];
  let questionClient: string | null = null;
  for (const client of clientMentions) {
    if (lastMessage.includes(client)) {
      questionClient = client.includes('stichting') ? 'swz' : client;
      break;
    }
  }
  
  for (const kb of availableKnowledge) {
    let matchScore = 0;
    
    // Match 1: Direct key match in response
    const keyLower = kb.key.toLowerCase();
    if (responseLower.includes(keyLower.replace(/_/g, ' ')) || responseLower.includes(keyLower)) {
      matchScore += 3;
    }
    
    // Match 2: Category context match
    const categoryKeywords = kb.category.toLowerCase().split('_');
    categoryKeywords.forEach((keyword: string) => {
      if (keyword.length > 3 && responseLower.includes(keyword)) {
        matchScore += 1;
      }
    });
    
    // Match 3: Value content match (for string values or object fields)
    if (kb.value) {
      const valueStr = typeof kb.value === 'string' 
        ? kb.value.toLowerCase() 
        : JSON.stringify(kb.value).toLowerCase();
      
      // Extract meaningful words (>3 chars) from value
      const valueWords = valueStr.match(/\b\w{4,}\b/g) || [];
      valueWords.slice(0, 5).forEach((word: string) => {
        if (responseLower.includes(word)) {
          matchScore += 2;
        }
      });
    }
    
    // If sufficient match, validate client context
    if (matchScore >= 3) {
      const kbClient = extractClientFromKnowledge(kb);
      
      // CLIENT VALIDATION - Only penalize EXPLICIT mismatches
      // Accept knowledge if:
      // - kbClient is null (general knowledge)
      // - questionClient is null (no client filter in question)
      // - Both match
      // Only skip if BOTH are known AND different
      if (questionClient && kbClient && kbClient !== questionClient) {
        console.warn(`⚠️ Explicit client mismatch: KB="${kbClient}", Question="${questionClient}"`);
        
        // Use unified updateConfidence with atomic operation
        try {
          await updateConfidence(supabase as any, kb.id, kb.org_id, {
            ruleKey: 'negative_feedback', // Use negative_feedback rule
            customDelta: -0.30, // Override with -0.30 penalty for client mismatch
          });
          // Mark for review separately since updateConfidence doesn't handle this
          await supabase
            .from('ai_knowledge_base')
            .update({
              needs_review: true,
              validation_failures: (kb.validation_failures || 0) + 1,
              last_validation_error: `Client mismatch: KB claims ${kbClient}, but used for ${questionClient} query`
            })
            .eq('id', kb.id)
            .eq('org_id', kb.org_id);
        } catch (updateError) {
          console.error(`Failed to update confidence for ${kb.id}:`, updateError);
        }
        
        // Create business intelligence alert
        await supabase.from('business_intelligence').insert({
          org_id: kb.org_id,
          intelligence_type: 'knowledge_quality',
          type: 'knowledge',
          severity: 'high',
          priority: 'high',
          title: `Kennisfout: ${kb.key}`,
          description: `Knowledge item "${kb.key}" bevat ${kbClient} data maar werd gebruikt voor ${questionClient} vraag`,
          data: { 
            kb_id: kb.id, 
            expected_client: questionClient, 
            actual_client: kbClient,
            response_snippet: responseText.substring(0, 200)
          },
          impact_score: 0.8
        });
        
        continue; // Skip usage increment for explicit mismatches
      }
      
      // Valid usage: accept and track
      // This now includes:
      // - General knowledge (kbClient = null)
      // - Client-specific knowledge matching the question
      // - Knowledge used in non-client-specific questions
      usedKnowledgeIds.push(kb.id);
      
      // Use unified reinforceKnowledge for atomic usage tracking
      try {
        await reinforceKnowledge(supabase as any, kb.id, kb.org_id, {
          usageIncrement: 1,
          stabilityBoost: 0.01 // Small boost for validated usage
        });
      } catch (reinforceError) {
        console.error(`Failed to reinforce knowledge ${kb.id}:`, reinforceError);
      }
    }
  }
  
  if (usedKnowledgeIds.length > 0) {
    console.log(`🎯 Knowledge used in response: ${usedKnowledgeIds.length} items`, usedKnowledgeIds.slice(0, 5));
  }
  
  return usedKnowledgeIds;
}

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================
async function performHealthCheck(supabase: any): Promise<Response> {
  const checks: Record<string, { status: string; message: string; durationMs?: number }> = {};
  const startTime = Date.now();

  // 1. VERSION CHECK
  checks.version = {
    status: 'ok',
    message: SYSTEM_PROMPT_VERSION
  };

  // 2. KNOWLEDGE_CRUD VERSION
  checks.knowledge_crud_version = {
    status: 'ok',
    message: 'v2025-12-28-v2'
  };

  // 3. DATABASE CONNECTION TEST
  try {
    const start = Date.now();
    const { count, error } = await supabase
      .from('ai_knowledge_base')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null);
    
    checks.database = error 
      ? { status: 'error', message: error.message }
      : { status: 'ok', message: `Connected - ${count} knowledge items`, durationMs: Date.now() - start };
  } catch (e: any) {
    checks.database = { status: 'error', message: e.message };
  }

  // 4. RPC: atomic_reinforce_knowledge (dry-run with fake ID)
  try {
    const start = Date.now();
    const { data, error } = await supabase.rpc('atomic_reinforce_knowledge', {
      p_knowledge_id: '00000000-0000-0000-0000-000000000000',
      p_org_id: '550e8400-e29b-41d4-a716-446655440000',
      p_stability_boost: 0.0,
      p_usage_increment: 0
    });
    
    // Expected: success=false, error='Knowledge item not found or access denied'
    if (error) {
      // PGRST202 = function not found or wrong params (CACHE ISSUE!)
      const isCacheIssue = error.message?.includes('PGRST202') || error.code === 'PGRST202';
      checks.rpc_reinforce = { 
        status: 'error', 
        message: isCacheIssue 
          ? `CACHE ISSUE! RPC function not found or wrong parameters: ${error.message}` 
          : error.message,
        durationMs: Date.now() - start
      };
    } else {
      checks.rpc_reinforce = {
        status: (data?.success === false) ? 'ok' : 'warning',
        message: data?.error || data?.message || 'RPC callable with correct 4 parameters (incl. p_org_id)',
        durationMs: Date.now() - start
      };
    }
  } catch (e: any) {
    checks.rpc_reinforce = { 
      status: 'error', 
      message: e.message?.includes('PGRST202') 
        ? 'CACHE ISSUE! RPC function not found or wrong parameters' 
        : e.message 
    };
  }

  // 5. RPC: atomic_update_confidence (dry-run)
  try {
    const start = Date.now();
    const { data, error } = await supabase.rpc('atomic_update_confidence', {
      p_knowledge_id: '00000000-0000-0000-0000-000000000000',
      p_org_id: '550e8400-e29b-41d4-a716-446655440000',
      p_delta: 0.0,
      p_min_confidence: 0.0,
      p_max_confidence: 1.0,
      p_auto_prune: false
    });
    
    if (error) {
      const isCacheIssue = error.message?.includes('PGRST202') || error.code === 'PGRST202';
      checks.rpc_update_confidence = { 
        status: 'error', 
        message: isCacheIssue ? 'CACHE ISSUE! Wrong parameters' : error.message,
        durationMs: Date.now() - start
      };
    } else {
      checks.rpc_update_confidence = {
        status: (data?.success === false || data?.was_pruned === false) ? 'ok' : 'warning',
        message: data?.error || 'RPC callable with 6 parameters',
        durationMs: Date.now() - start
      };
    }
  } catch (e: any) {
    checks.rpc_update_confidence = { status: 'error', message: e.message };
  }

  // 6. RPC: match_knowledge (embedding test with dummy vector)
  try {
    const start = Date.now();
    const dummyEmbedding = new Array(1536).fill(0);
    const { data, error } = await supabase.rpc('match_knowledge', {
      query_embedding: dummyEmbedding,
      match_threshold: 0.99, // Very high threshold = no matches
      match_count: 1,
      filter_org_id: '550e8400-e29b-41d4-a716-446655440000',
      filter_role_tags: null,
      require_verified: false,
      include_shared: false
    });
    const duration = Date.now() - start;

    // 📊 Log health check call metrics (fire-and-forget)
    logMatchKnowledgeCall(supabase, {
      call_type: 'health_check',
      include_shared: false,
      threshold: 0.99,
      total_results: data?.length || 0,
      shared_results: 0,
      avg_similarity: 0,
      org_id: '550e8400-e29b-41d4-a716-446655440000',
      execution_time_ms: duration,
      success: error === null || error === undefined,
      error_message: error?.message || undefined
    }).catch(() => {}); // Non-blocking
    
    checks.rpc_match_knowledge = error 
      ? { status: 'error', message: error.message }
      : { status: 'ok', message: `RPC callable - ${data?.length || 0} results`, durationMs: duration };
  } catch (e: any) {
    checks.rpc_match_knowledge = { status: 'error', message: e.message };
  }

  // 7. CACHE TABLE ACCESS
  try {
    const start = Date.now();
    const { count, error } = await supabase
      .from('ai_response_cache')
      .select('*', { count: 'exact', head: true });
    
    checks.cache_table = error 
      ? { status: 'error', message: error.message }
      : { status: 'ok', message: `${count} cached responses`, durationMs: Date.now() - start };
  } catch (e: any) {
    checks.cache_table = { status: 'error', message: e.message };
  }

  // OVERALL STATUS
  const allOk = Object.values(checks).every(c => c.status === 'ok');
  const hasErrors = Object.values(checks).some(c => c.status === 'error');
  const status = hasErrors ? 'unhealthy' : (allOk ? 'healthy' : 'degraded');

  console.log(`🏥 [HEALTH-CHECK] Status: ${status}, Duration: ${Date.now() - startTime}ms`);

  return new Response(JSON.stringify({
    status,
    timestamp: new Date().toISOString(),
    totalDurationMs: Date.now() - startTime,
    checks
  }, null, 2), {
    status: hasErrors ? 503 : 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req: Request) => {
  const startTime = Date.now(); // Track execution time
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ============================================
  // HEALTH-CHECK ROUTE (uses admin client, no user auth required for health check)
  // ============================================
  try {
    const url = new URL(req.url);
    if (url.searchParams.get('health') === 'true') {
      console.log('🏥 Health-check requested');
      const supabaseServiceClient = createAdminClient();
      return await performHealthCheck(supabaseServiceClient);
    }
  } catch (healthError) {
    console.error('Health check URL parse error:', healthError);
  }

  try {
    // 🔒 SECURITY: Validate input with Zod schema
    const AiChatRequestSchema = z.object({
      messages: z.array(z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().min(1).max(50000)
      })).min(1).max(100),
      conversation_id: z.string().uuid(),
      pageContext: z.object({
        path: z.string(),
        label: z.string(),
        description: z.string()
      }).optional()
    });

    const rawBody = await req.json();
    const validation = AiChatRequestSchema.safeParse(rawBody);
    
    if (!validation.success) {
      const errors = validation.error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      console.error('❌ Validation failed:', errors);
      return new Response(
        JSON.stringify({ 
          error: `Validation failed: ${errors}` 
        }), 
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    const { messages, conversation_id, pageContext } = validation.data;
    console.log(`🔑 Processing conversation: ${conversation_id}${pageContext ? ` (page: ${pageContext.label})` : ''}`);
    
    // === FASE 2D: PROMPT INJECTION PROTECTION ===
    const lastUserMessage = messages[messages.length - 1]?.content || '';
    const injectionCheck = detectPromptInjection(lastUserMessage);
    
    if (injectionCheck.isInjection) {
      console.warn(`⚠️ Prompt injection detected - Severity: ${injectionCheck.severity}`, {
        patterns: injectionCheck.matchedPatterns,
        shouldBlock: injectionCheck.shouldBlock,
      });
      
      // Log security event for critical/high severity
      if (injectionCheck.severity === 'critical' || injectionCheck.severity === 'high') {
        const supabaseServiceClient = createAdminClient();
        await supabaseServiceClient.from('system_events').insert({
          event_type: 'security_alert',
          severity: injectionCheck.severity === 'critical' ? 'critical' : 'high',
          title: `🔴 Prompt Injection Attempt - ${injectionCheck.severity.toUpperCase()}`,
          details: {
            conversation_id,
            matched_patterns: injectionCheck.matchedPatterns,
            content_preview: lastUserMessage.substring(0, 200),
            blocked: injectionCheck.shouldBlock,
          },
        }).then(({ error }) => {
          if (error) console.error('Failed to log injection attempt:', error);
        });
      }
      
      // Block critical injections
      if (injectionCheck.shouldBlock) {
        return new Response(
          JSON.stringify({ 
            error: 'Je bericht bevat ongeldige inhoud. Probeer het opnieuw met een normale vraag.',
            code: 'INJECTION_BLOCKED'
          }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
      
      // For medium severity, use sanitized content
      if (injectionCheck.sanitizedContent && injectionCheck.severity !== 'low') {
        console.log('📝 Using sanitized input for medium severity injection');
        messages[messages.length - 1].content = injectionCheck.sanitizedContent;
      }
    }
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      return new Response(JSON.stringify({ error: 'Authenticatie vereist' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract the access token from the Authorization header
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase environment variables');
      throw new Error('Server configuration error');
    }

    // 🧪 TEST MODE: Allow service_role key for internal test calls (ai-chat-tester)
    const isServiceRoleAuth = serviceRoleKey && accessToken === serviceRoleKey;
    
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { 
        headers: { 
          Authorization: authHeader 
        } 
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    });

    // Service role client for background persistence (bypasses RLS)
    const supabaseServiceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      }
    );

    // 🧪 TEST MODE: Skip user auth for service_role authenticated requests
    let user: { id: string; email?: string } | null = null;
    let userOrgId: string | null = null;
    
    if (isServiceRoleAuth) {
      // Service role test mode - use synthetic test user
      console.log('🧪 Service role test mode detected - using test user context');
      user = { 
        id: 'test-orchestrator-service-role', 
        email: 'test@abczorg.nl' 
      };
      userOrgId = '550e8400-e29b-41d4-a716-446655440000'; // ABCzorg default org
    } else {
      // Normal user authentication flow
      let authResult;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Auth timeout')), 5000)
        );
        
        const authPromise = supabaseClient.auth.getUser(accessToken);
        
        authResult = await Promise.race([
          authPromise,
          timeoutPromise
        ]);
      } catch (authTimeoutError) {
        console.error('⚠️ Auth timeout na 5 seconden - mogelijk netwerk probleem');
        return new Response(
          JSON.stringify({ 
            error: 'Authenticatie timeout - probeer het opnieuw',
            details: 'De authenticatie service reageert niet binnen 5 seconden'
          }), 
          {
            status: 408, // Request Timeout
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const { data: { user: authUser }, error: userError } = authResult;
      
      if (userError) {
        console.error('Auth error:', userError);
        return new Response(JSON.stringify({ error: 'Authenticatie gefaald' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (!authUser) {
        console.error('No user found');
        return new Response(JSON.stringify({ error: 'Gebruiker niet gevonden' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      user = authUser;
      console.log('User authenticated:', user.id);
    }

    // ⏱️ Performance tracking
    const perfTimers = {
      start: Date.now(),
      embedding: 0,
      semanticSearch: 0,
      kvkLookup: 0,
      aiCall: 0,
      total: 0
    };

    // Get user's org_id (skip if already set in test mode)
    if (!userOrgId) {
      const { data: userOrg } = await supabaseClient
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', user.id)
        .single();
      
      userOrgId = userOrg?.org_id || null;
      
      // 🔧 FIX: Email-based org_id mapping voor ABCzorg/CitoZorg users
      if (!userOrgId && user.email) {
        const emailDomain = user.email.toLowerCase();
        if (emailDomain.endsWith('@abczorg.nl') || emailDomain.endsWith('@citozorg.nl')) {
          userOrgId = '550e8400-e29b-41d4-a716-446655440000'; // ABCzorg org_id
          console.log(`✅ Email-based org mapping: ${user.email} → ABCzorg org`);
        }
      }
    }
    
    if (!userOrgId) {
      console.error('❌ No organization associated with user');
      return new Response(JSON.stringify({ error: 'Geen organisatie gekoppeld aan dit account' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ✨ BUDGET CHECK: Check if org has budget left before continuing
    const { checkBudgetBeforeAiCall } = await import('../_shared/budget-guard.ts');
    const budgetCheck = await checkBudgetBeforeAiCall(
      supabaseClient, 
      userOrgId,
      0.002 // Estimated cost per call
    );

    if (!budgetCheck.allowed) {
      const status = budgetCheck.status;
      return new Response(
        JSON.stringify({ 
          error: 'Budget limit bereikt',
          message: `Je organisatie heeft het AI-budget limiet bereikt (${status?.month_percentage}% gebruikt). Neem contact op met een admin om het budget te verhogen.`,
          budget_status: status
        }),
        { 
          status: 429, // Too Many Requests
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // ============================================
    // ⚡ ULTRA FAST PATH: COUNT QUERIES (NO AI NEEDED)
    // ============================================
    // Check if this is a simple count query that can be answered directly
    const lastUserMessageForFastPath = messages[messages.length - 1]?.content || '';
    
    for (const fastPattern of FAST_PATH_COUNT_PATTERNS) {
      const match = lastUserMessageForFastPath.match(fastPattern.pattern);
      if (match) {
        console.log(`⚡ [ULTRA FAST PATH] Count query detected: ${fastPattern.table}`);
        const fastPathStart = Date.now();
        
        try {
          // Direct database count - NO AI needed!
          let countQuery = supabaseClient
            .from(fastPattern.table)
            .select(fastPattern.countColumn, { count: 'exact', head: true });
          
          // Add is_active filter for sublocations
          if (fastPattern.activeFilter && fastPattern.table === 'client_sublocations') {
            countQuery = countQuery.eq('is_active', true);
          }
          
          // Add deleted_at filter for applications and professionals
          if (fastPattern.table === 'professional_applications' || fastPattern.table === 'professionals') {
            countQuery = countQuery.is('deleted_at', null);
          }
          
          // 🆕 GEAVANCEERDE FILTERS: Dynamisch filter op basis van regex match
          let filterContext = '';
          let filters: FastPathFilter[] = [];
          
          // Collect all filters (supports both single and multiple filters)
          if (fastPattern.extractFilters && match) {
            filters = fastPattern.extractFilters(match);
          } else if (fastPattern.extractFilter && match) {
            const singleFilter = fastPattern.extractFilter(match);
            if (singleFilter) filters = [singleFilter];
          }
          
          // Apply all filters
          for (const filter of filters) {
            console.log(`⚡ [ULTRA FAST PATH] Applying filter: ${filter.column} ${filter.operator} "${filter.value}"`);
            filterContext += (filterContext ? ' + ' : '') + filter.value;
            
            switch (filter.operator) {
              case 'eq':
                countQuery = countQuery.eq(filter.column, filter.value);
                break;
              case 'ilike':
                countQuery = countQuery.ilike(filter.column, `%${filter.value}%`);
                break;
              case 'contains':
                // For array columns like sector[], doelgroep[], gezochte_functies[]
                countQuery = countQuery.contains(filter.column, [filter.value]);
                break;
            }
          }
          
          const { count, error: countError } = await countQuery;
          
          if (countError) {
            console.error(`⚡ [ULTRA FAST PATH] Count error:`, countError);
            // Fall through to normal processing
          } else {
            const responseContent = fastPattern.responseTemplate(count || 0, filterContext);
            const fastPathDuration = Date.now() - fastPathStart;
            
            console.log(`⚡ [ULTRA FAST PATH] SUCCESS: ${count} items, ${fastPathDuration}ms (vs ~30s with AI)${filterContext ? ` [filter: ${filterContext}]` : ''}`);
            
            // Persist messages in background
            persistMessage(supabaseServiceClient, {
              user_id: user.id,
              org_id: userOrgId,
              conversation_id: conversation_id,
              role: 'user',
              content: lastUserMessageForFastPath
            }).catch(() => {});
            
            persistMessage(supabaseServiceClient, {
              user_id: user.id,
              org_id: userOrgId,
              conversation_id: conversation_id,
              role: 'assistant',
              content: responseContent,
              metadata: { fast_path: true, duration_ms: fastPathDuration, filter: filterContext || null }
            }).catch(() => {});
            
            // Return SSE stream directly
            const encoder = new TextEncoder();
            const stream = buildFastPathSSEResponse(responseContent, encoder);
            
            return new Response(stream, {
              headers: {
                ...corsHeaders,
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Fast-Path': filterContext ? 'count-query-filtered' : 'count-query',
                'X-Fast-Path-Filter': filterContext || '',
                'X-Response-Time-Ms': String(fastPathDuration)
              }
            });
          }
        } catch (fastPathError) {
          console.error(`⚡ [ULTRA FAST PATH] Error, falling back to normal:`, fastPathError);
          // Fall through to normal processing
        }
      }
    }

    // ============================================
    // 🚀 FAST PATH DETECTION FOR SIMPLE DATA QUERIES
    // ============================================
    const lastUserMessageForCache = messages[messages.length - 1]?.content || '';
    const lastUserMessageLower = lastUserMessageForCache.toLowerCase();
    
    // Detect simple data queries (database lookups)
    const isSimpleDataQuery = /^(hoeveel|wie|welke|wanneer|aantal|lijst van|overzicht|toon|geef|laat.*zien)/i.test(lastUserMessageForCache);
    
    // Detect recruitment queries (professionals, clients, placements)
    const isRecruitmentQuery = /(professional|sollicitant|klant|client|plaatsing|bureau|abczorg|citozorg|werklocatie|sublocatie|locatie)/i.test(lastUserMessageLower);
    
    // Fast path: simple data queries about recruitment data
    const useFastPath = isSimpleDataQuery && isRecruitmentQuery;
    
    // ⏱️ Performance logging
    const fastPathStartTime = Date.now();
    
    if (useFastPath) {
      console.log('🚀 FAST PATH DETECTED: Simple recruitment data query - skipping heavy pre-processing');
      console.log(`⏱️ Fast Path initiated at ${fastPathStartTime}ms`);
    }
    
    // ============================================
    // FASE 1: CACHE LOOKUP (SHA256 HASH)
    // ============================================
    // Include SYSTEM_PROMPT_VERSION in cache key to auto-invalidate on prompt updates
    const cacheKey = await sha256Hash(`${userOrgId}|${SYSTEM_PROMPT_VERSION}|${lastUserMessageForCache.trim()}`);
    
    console.log('🔍 Cache lookup:', { 
      org_id: userOrgId, 
      question: lastUserMessageForCache.substring(0, 50) + '...', 
      cache_key: cacheKey.substring(0, 16) + '...',
      prompt_version: SYSTEM_PROMPT_VERSION,
      fast_path: useFastPath
    });
    
    const { data: cachedResponse, error: cacheError } = await supabaseServiceClient
      .from('ai_response_cache')
      .select('response, knowledge_ids, hit_count, id, created_at, expires_at')
      .eq('org_id', userOrgId)
      .eq('question_hash', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    
    if (cacheError) {
      console.error('❌ Cache lookup error:', cacheError);
    }
    
    if (cachedResponse) {
      console.log('💰 CACHE HIT - Reconstructing SSE stream...', {
        cache_id: cachedResponse.id,
        hit_count: cachedResponse.hit_count,
        knowledge_ids_count: cachedResponse.knowledge_ids?.length || 0
      });
      
      // Extract data
      const usedKnowledgeIds = cachedResponse.knowledge_ids || [];
      const cachedContent = cachedResponse.response;
      
      // Persist messages to get messageId
      const userMessage = messages[messages.length - 1]?.content || '';
      
      const userPersist = await persistMessage(supabaseServiceClient, {
        user_id: user.id,
        org_id: userOrgId,
        conversation_id: conversation_id,
        role: 'user',
        content: userMessage
      });
      
      const assistantPersist = await persistMessage(supabaseServiceClient, {
        user_id: user.id,
        org_id: userOrgId,
        conversation_id: conversation_id,
        role: 'assistant',
        content: cachedContent,
        metadata: {
          usedKnowledge: usedKnowledgeIds,
          cached: true,
          cache_id: cachedResponse.id
        }
      });
      
      const assistantMessageId = assistantPersist.messageId;
      console.log('💾 Messages persisted:', { 
        user: userPersist.success, 
        assistant: assistantPersist.success,
        messageId: assistantMessageId 
      });
      
      // Build SSE stream
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          try {
            // 1. Metadata event
            const metadataEvent = {
              choices: [{
                delta: {
                  metadata: {
                    usedKnowledge: usedKnowledgeIds,
                    messageId: assistantMessageId,
                    cached: true
                  }
                },
                index: 0
              }]
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(metadataEvent)}\n\n`));
            
            // 2. Content chunks (max 2000 chars per chunk)
            const chunkSize = 2000;
            for (let i = 0; i < cachedContent.length; i += chunkSize) {
              const chunk = cachedContent.slice(i, Math.min(i + chunkSize, cachedContent.length));
              const contentEvent = {
                choices: [{
                  delta: { content: chunk },
                  index: 0
                }]
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(contentEvent)}\n\n`));
            }
            
            // 3. Done event
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            
            console.log('✅ SSE stream reconstructed:', {
              chunks: Math.ceil(cachedContent.length / chunkSize),
              totalLength: cachedContent.length
            });
          } catch (e) {
            console.error('❌ Error building SSE stream:', e);
            controller.error(e);
          }
        }
      });
      
      // Update hit count (non-blocking)
      supabaseServiceClient
        .from('ai_response_cache')
        .update({ hit_count: cachedResponse.hit_count + 1 })
        .eq('id', cachedResponse.id)
        .then(() => console.log('📊 Cache hit count updated'));
      
      // Trigger continuous-learner (fire-and-forget)
      if (usedKnowledgeIds.length > 0 && assistantMessageId) {
        supabaseServiceClient.functions.invoke('continuous-learner', {
          body: {
            user_question: userMessage,
            ai_response: cachedContent,
            knowledge_used: usedKnowledgeIds.map((id: string) => ({ id })),
            auto_apply: true
          }
        }).then(({ error }: { error: any }) => {
          if (error) {
            console.error('❌ Continuous-learner trigger failed:', error);
          } else {
            console.log('🧠 Continuous-learner triggered (cache hit)');
          }
        });
      }
      
      return new Response(stream, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' }
      });
    }
    
    console.log('⚡ CACHE MISS - Calling AI');

    // Smart context filtering - alleen relevante data
    const [
      tasksResult,
      profileResult,
      clientsResult,
      projectsResult,
      subtasksResult,
      commentsResult,
      timeEntriesResult,
      activeTimeResult,
      chatHistoryResult,
      deletedTasksResult,
      knowledgeBaseResult,
      learningEventsResult,
      businessIntelResult,
      conversationContextResult
    ] = await Promise.all([
      // Top 10 recente actieve taken
      supabaseClient
        .from('tasks')
        .select('id, title, priority, due_at, start_at, next_action, description, estimate_min, completed_at, revenue_impact_eur, transition_related, client_id, assignee_id')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10),
      
      // User profile
      supabaseClient
        .from('profiles')
        .select('name, email')
        .eq('id', user.id)
        .single(),
      
      // Top 10 werklocaties (sublocations) - map to flat structure
      (async () => {
        const { data: subs } = await supabaseClient
          .from('client_sublocations')
          .select(`
            id, naam, sector, doelgroep, plaats,
            location:client_locations!inner(
              naam,
              organization:client_organizations!inner(name)
            )
          `)
          .eq('is_active', true)
          .limit(10);
        
        // Map to expected format
        return { 
          data: subs?.map((s: any) => ({
            id: s.id,
            naam: s.naam,
            sector: s.sector,
            doelgroep: s.doelgroep,
            plaats: s.plaats,
            organization_name: s.location?.organization?.name || ''
          })) || null 
        };
      })(),
      
      // Top 5 projecten
      supabaseClient
        .from('projects')
        .select('id, name, description')
        .limit(5),
      
      // Top 10 actieve subtaken
      supabaseClient
        .from('subtasks')
        .select('id, title, status, due_at, task_id')
        .eq('status', 'active')
        .limit(10),
      
      // 5 meest recente comments
      supabaseClient
        .from('comments')
        .select('body, created_at, task_id')
        .order('created_at', { ascending: false })
        .limit(5),
      
      // Time entries laatste 7 dagen (max 20)
      supabaseClient
        .from('time_entries')
        .select('duration_min, start, task_id')
        .gte('start', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .limit(20),
      
      // Check for active time tracking
      supabaseClient
        .from('time_entries')
        .select('task_id, start')
        .is('end', null)
        .eq('user_id', user.id)
        .maybeSingle(),
      
      // 5 meest recente chat berichten - ALLEEN als conversation_id bestaat
      supabaseClient
        .from('chat_messages')
        .select('role, content, created_at')
        .eq('user_id', user.id)
        .eq('conversation_id', conversation_id || '__NEVER_MATCH__') // ✅ Fallback naar unmatchable ID
        .order('created_at', { ascending: false })
        .limit(5),
      
      // Count deleted tasks for context awareness
      supabaseClient
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .not('deleted_at', 'is', null),
      
      // Top 10 kennis items
      supabaseClient
        .from('ai_knowledge_base')
        .select('*')
        .eq('user_id', user.id)
        .order('confidence_score', { ascending: false })
        .order('usage_count', { ascending: false })
        .limit(10),
      
      // 5 meest recente learning events
      supabaseClient
        .from('ai_learning_events')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5),
      
      // Top 5 business intelligence insights
      userOrgId ? supabaseClient
        .from('business_intelligence')
        .select('*')
        .eq('org_id', userOrgId)
        .eq('status', 'active')
        .order('impact_score', { ascending: false })
        .limit(5) : Promise.resolve({ data: [], error: null }),
      
      // 3 meest recente conversatie contexten
      supabaseClient
        .from('conversation_context')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3)
    ]);

    const tasks = tasksResult.data;
    const profile = profileResult.data;
    const clients = clientsResult.data;
    const projects = projectsResult.data;
    const subtasks = subtasksResult.data;
    const recentComments = commentsResult.data;
    const timeEntries = timeEntriesResult.data;
    const activeTimeEntry = activeTimeResult.data;
    const chatHistory = chatHistoryResult.data;
    const deletedTasksCount = deletedTasksResult.count || 0;
    const knowledgeBase = knowledgeBaseResult.data || [];
    const learningEvents = learningEventsResult.data || [];
    const businessIntel = businessIntelResult.data || [];
    const conversationContext = conversationContextResult.data || [];

    // Analyze patterns and build rich context
    const activeTasks = tasks?.filter(t => !t.completed_at) || [];
    const completedTasks = tasks?.filter(t => t.completed_at) || [];
    const overdueTasks = activeTasks.filter(t => t.due_at && new Date(t.due_at) < new Date());
    const highPriorityTasks = activeTasks.filter(t => t.priority === 'HIGH' || t.priority === 'CRITICAL');
    const revenueImpactTasks = activeTasks.filter(t => t.revenue_impact_eur && t.revenue_impact_eur > 0);
    
    // 🤖 FASE 3: Smart Context Builder - Gebruik Meta-Orchestrator categorieën
    const lastUserMessageLowerContext = messages[messages.length - 1]?.content?.toLowerCase() || '';
    const messageKeywords = lastUserMessageLowerContext.split(' ').filter((w: string) => w.length > 3); // Voor confidence calc
    
    console.log('🤖 Smart Context Builder: Zoek relevante categorieën...');
    
    // Detect user's role from the question for role-based knowledge filtering
    const detectedRole = detectRoleFromQuestion(lastUserMessageLowerContext);
    
    // 🎯 CLIENT-VRAAG DETECTIE
    const isClientQuestion = /\b(klant|client|opdrachtgever|customer|organisatie)\b/i.test(lastUserMessageLowerContext);
    
    // Guardrail verwijderd - volledig AI model altijd actief
    let answerSource = 'ai_knowledge_base';
    let orgProfileUsed = false;
    
    // Haal relevante AI categorieën op via Meta-Orchestrator
    const { data: relevantCategories } = await supabaseClient
      .rpc('get_relevant_categories', { 
        user_question: lastUserMessageLowerContext,
        org_id_param: userOrgId 
      });

    console.log(`📂 Gevonden categorieën: ${relevantCategories?.length || 0}`);

    // ============================================
    // 🏢 FASE 2.5: KVK SMART LOOKUP (COST-FREE BUSINESS DATA)
    // ⚡ SKIP FOR FAST PATH (recruitment data queries)
    // ============================================
    let kvkEnrichedData: any[] = [];
    let kvkCostSaved = 0;
    const kvkLookupStart = Date.now();
    
    const businessQuery = detectBusinessQuery(lastUserMessage);
    
    // ⚡ Fast path: skip KVK lookup voor simpele recruitment queries
    if (!useFastPath && businessQuery.isBusinessQuery && businessQuery.entities.length > 0) {
      console.log(`🏢 Business query detected: ${businessQuery.queryType}`);
      console.log(`📋 Entities to lookup: ${businessQuery.entities.join(', ')}`);
      
      // Call kvk-smart-lookup voor elk entity
      for (const entity of businessQuery.entities) {
        try {
          console.log(`🔍 KVK Smart Lookup: "${entity}"...`);
          
          const { data: kvkLookup, error: kvkError } = await supabaseServiceClient.functions.invoke('kvk-smart-lookup', {
            body: { 
              query: entity, 
              org_id: userOrgId,
              query_type: 'auto'
            }
          });
          
          if (kvkError) {
            console.warn(`⚠️ KVK lookup failed for ${entity}:`, kvkError);
            continue;
          }
          
          if (kvkLookup) {
            console.log(`✅ KVK Smart Lookup SUCCESS: source=${kvkLookup.source}, cost_saved=€${kvkLookup.cost_saved}`);
            
            // Track cost savings
            kvkCostSaved += kvkLookup.cost_saved;
            
            // Convert KVK data naar knowledge base format
            const enrichedKnowledge = {
              id: `kvk_${entity.replace(/\s+/g, '_')}`,
              category: 'org_profile',
              key: `bedrijfsinformatie_${entity.toLowerCase().replace(/\s+/g, '_')}`,
              value: kvkLookup.data,
              confidence_score: 1.0, // KVK API is authoritative
              source: `kvk_smart_lookup_${kvkLookup.source}`,
              created_at: kvkLookup.freshness.last_updated,
              updated_at: kvkLookup.freshness.last_updated,
              usage_count: 0,
              role_tags: [],
              valid_from: null,
              valid_to: null,
              validation_status: 'verified'
            };
            
            kvkEnrichedData.push(enrichedKnowledge);
            
            // Log naar business intelligence
            await supabaseServiceClient.from('business_intelligence').insert({
              org_id: userOrgId,
              intelligence_type: 'cost_optimization',
              title: `KVK Smart Lookup: ${kvkLookup.source} hit`,
              description: `Business query voor "${entity}" gebruikt ${kvkLookup.source} (€${kvkLookup.cost_saved} bespaard)`,
              data: {
                entity: entity,
                query_type: businessQuery.queryType,
                source: kvkLookup.source,
                cost_saved: kvkLookup.cost_saved,
                data_age_days: Math.floor(
                  (Date.now() - new Date(kvkLookup.freshness.last_updated).getTime()) / (1000 * 60 * 60 * 24)
                )
              },
              impact_score: kvkLookup.cost_saved > 0 ? 0.8 : 0.5,
              status: 'active'
            });
          }
        } catch (error) {
          console.error(`❌ KVK Smart Lookup error for ${entity}:`, error);
          // Continue met volgende entity, don't break flow
        }
      }
      
      if (kvkEnrichedData.length > 0) {
        console.log(`💰 Total KVK cost saved: €${kvkCostSaved.toFixed(2)}`);
        console.log(`📊 KVK enriched data items: ${kvkEnrichedData.length}`);
      }
    }
    
    perfTimers.kvkLookup = Date.now() - kvkLookupStart;

    // FASE 2: Graph Traversal Helper Function (Neural Brain)
    async function expandViaRelationships(coreItems: any[], maxDepth = 2) {
      if (coreItems.length === 0) return coreItems;
      
      let expanded = [...coreItems];
      let currentIds = coreItems.map((i: any) => i.id);
      
      for (let depth = 0; depth < maxDepth; depth++) {
        // Fetch relationships where source is one of our current items
        const { data: connectedRels } = await supabaseClient
          .from('knowledge_relationships')
          .select(`
            id, 
            target_knowledge_id, 
            relationship_type, 
            confidence_score,
            usage_count
          `)
          .in('source_knowledge_id', currentIds)
          .gte('usage_count', 3)
          .order('usage_count', { ascending: false })
          .limit(20);
        
        if (!connectedRels || connectedRels.length === 0) break;
        
        // Fetch the actual target knowledge items
        const targetIds = connectedRels.map((r: any) => r.target_knowledge_id);
        const { data: targetItems } = await supabaseClient
          .from('ai_knowledge_base')
          .select('id, category, key, value, confidence_score, usage_count, source, created_at, role_tags, valid_from, valid_to')
          .in('id', targetIds)
          .is('deleted_at', null);
        
        if (!targetItems || targetItems.length === 0) break;
        
        // Filter out items we already have
        const newItems = targetItems.filter((t: any) => 
          !expanded.some((e: any) => e.id === t.id)
        );
        
        if (newItems.length === 0) break;
        
        expanded.push(...newItems);
        currentIds = newItems.map((i: any) => i.id);
        
        console.log(`🔗 Graph depth ${depth + 1}: Added ${newItems.length} related items via neural connections`);
      }
      
      return expanded;
    }

    let fullKnowledgeBase: any[] = [];
    let semanticKnowledge: any[] = [];

    // ============================================
    // ⚡ FAST PATH: MINIMAL KNOWLEDGE BASE FOR DATABASE QUERIES
    // ============================================
    if (useFastPath) {
      console.log('⚡ Fast path: using minimal knowledge base (tools-only mode)');
      // Skip knowledge base retrieval entirely for fast path
      // AI will rely on database tools (query_professionals, query_clients, etc.)
      fullKnowledgeBase = [];
    } else {
      // ============================================
      // MERGE KVK DATA MET KNOWLEDGE BASE (HOOGSTE PRIORITEIT)
      // ============================================
      if (kvkEnrichedData.length > 0) {
        console.log('🔗 Prepending KVK enriched data to knowledge base (highest priority)...');
        fullKnowledgeBase = [...kvkEnrichedData];
        console.log(`✅ KVK data prepended: ${kvkEnrichedData.length} items`);
      }

    if (!useFastPath && relevantCategories && relevantCategories.length > 0) {
      // Haal ALLE items uit relevante categorieën (geen limit!)
      const categoryNames = relevantCategories.map((c: any) => c.category_name);
      
      const { data: categoryItems } = await supabaseClient
        .from('ai_knowledge_base')
        .select('id, category, key, value, confidence_score, usage_count, source, created_at, updated_at, role_tags, valid_from, valid_to, validation_status')
        .eq('org_id', userOrgId)
        .eq('validation_status', 'verified')
        .is('deleted_at', null)
        .in('category', categoryNames)
        .order('confidence_score', { ascending: false })
        .order('updated_at', { ascending: false });

      if (categoryItems) {
        // 🛡️ FASE 5: OPTIMIZED RETRIEVAL RANKING
        // Split org_profile vs rest (excluding KVK items already added)
        const existingIds = new Set(fullKnowledgeBase.map((kb: any) => kb.id));
        const filteredCategoryItems = categoryItems.filter((item: any) => !existingIds.has(item.id));
        
        const orgProfileItems = filteredCategoryItems.filter((item: any) => item.category === 'org_profile');
        const otherItems = filteredCategoryItems.filter((item: any) => item.category !== 'org_profile');
        
        console.log(`🏢 Org-profile items: ${orgProfileItems.length}`);
        console.log(`📚 Other items: ${otherItems.length}`);
        
        // Sort each group independently
        orgProfileItems.sort((a: any, b: any) => {
          if (a.confidence_score !== b.confidence_score) {
            return (b.confidence_score || 0) - (a.confidence_score || 0);
          }
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
        
        otherItems.sort((a: any, b: any) => {
          if (a.confidence_score !== b.confidence_score) {
            return (b.confidence_score || 0) - (a.confidence_score || 0);
          }
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
        
        // Recombine: KVK items FIRST, then org_profile, then rest
        const maxContextItems = 15;
        const categoryBasedItems = [
          ...orgProfileItems,
          ...otherItems.slice(0, Math.max(0, maxContextItems - orgProfileItems.length))
        ];
        
        // Merge with KVK items (KVK has priority)
        fullKnowledgeBase = [
          ...fullKnowledgeBase, // KVK items already prepended
          ...categoryBasedItems
        ];
        
        console.log(`✅ Smart Context: ${fullKnowledgeBase.length} items (${kvkEnrichedData.length} KVK + ${orgProfileItems.length} org-profiles) uit ${categoryNames.length} categorieën`);
        
        // FASE 2: Expand via relationships (Neural Graph Traversal)
        fullKnowledgeBase = await expandViaRelationships(fullKnowledgeBase, 2);
        console.log(`🧠 After neural graph expansion: ${fullKnowledgeBase.length} total items`);
      }
    }

    // Fallback: Als geen categorieën gevonden, gebruik standaard query met verhoogd limit
    // ⚡ Skip for fast path
    if (!useFastPath && fullKnowledgeBase.length === 0) {
      console.log('⚠️ Geen categorieën gevonden, fallback naar standaard query (300 items)...');
      const { data: fallbackKnowledge } = await supabaseClient
        .from('ai_knowledge_base')
        .select('id, category, key, value, confidence_score, usage_count, source, created_at, updated_at, role_tags, valid_from, valid_to, validation_status')
        .eq('org_id', userOrgId)
        .eq('validation_status', 'verified')
        .is('deleted_at', null)
        .gte('confidence_score', 0.3)
        .order('usage_count', { ascending: false })
        .order('confidence_score', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(300);

      if (fallbackKnowledge) {
        // 🛡️ FASE 5: OPTIMIZED RETRIEVAL RANKING (fallback)
        const orgProfileItems = fallbackKnowledge.filter((item: any) => item.category === 'org_profile');
        const otherItems = fallbackKnowledge.filter((item: any) => item.category !== 'org_profile');
        
        orgProfileItems.sort((a: any, b: any) => {
          if (a.confidence_score !== b.confidence_score) {
            return (b.confidence_score || 0) - (a.confidence_score || 0);
          }
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
        
        otherItems.sort((a: any, b: any) => {
          if (a.confidence_score !== b.confidence_score) {
            return (b.confidence_score || 0) - (a.confidence_score || 0);
          }
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
        
        const maxContextItems = 300;
        fullKnowledgeBase = [
          ...orgProfileItems,
          ...otherItems.slice(0, Math.max(0, maxContextItems - orgProfileItems.length))
        ];
        
        console.log(`✅ Fallback: ${fullKnowledgeBase.length} items (${orgProfileItems.length} org-profiles)`);
      }
    }
    } // End of !useFastPath block
    
    // 🎯 MERGE SEMANTIC + CATEGORY RESULTS
    // ⚡ Skip for fast path
    if (!useFastPath && semanticKnowledge.length > 0) {
      // Deduplicate: semantic results hebben voorrang
      const existingIds = new Set(fullKnowledgeBase.map((kb: any) => kb.id));
      const newSemanticItems = semanticKnowledge.filter((kb: any) => !existingIds.has(kb.id));
      
      // Voeg nieuwe semantic items toe aan het begin (hoogste prioriteit)
      fullKnowledgeBase = [...semanticKnowledge, ...fullKnowledgeBase];
      
      console.log(`🎯 Final knowledge base: ${fullKnowledgeBase.length} items (${semanticKnowledge.length} from semantic search, ${fullKnowledgeBase.length - semanticKnowledge.length} from categories)`);
    } else {
      console.log(`📚 Using category-based search only: ${fullKnowledgeBase.length} items`);
    }

    // FASE 1: Track which relationships were used (Synaptic Reinforcement)
    // ⚡ Skip for fast path
    if (!useFastPath && fullKnowledgeBase.length > 0) {
      const relevantIds = fullKnowledgeBase.map((i: any) => i.id);
      
      // Fetch relationships that involve any of our knowledge items (with current usage_count)
      const { data: usedRelationships } = await supabaseClient
        .from('knowledge_relationships')
        .select('id, usage_count')
        .or(`source_knowledge_id.in.(${relevantIds.join(',')}),target_knowledge_id.in.(${relevantIds.join(',')})`)
        .limit(100);
      
      if (usedRelationships && usedRelationships.length > 0) {
        // Update each relationship with incremented usage_count
        const updatePromises = usedRelationships.map((rel: any) => 
          supabaseClient
            .from('knowledge_relationships')
            .update({ 
              usage_count: (rel.usage_count || 0) + 1,
              last_used_at: new Date().toISOString()
            })
            .eq('id', rel.id)
        );
        
        await Promise.all(updatePromises);
        console.log(`✅ Strengthened ${usedRelationships.length} synaptic connections`);
      }
    }
    
    // Get API Keys for AI operations
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }
    
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    
    // 🎯 FIX 3: KEYWORD MATCHING voor bedrijfsinformatie queries
    const isCompanyInfoQuery = /\b(adres|gegevens|kvk|bedrijfsinformatie|contactgegevens|postcode|plaats|vestiging)\b/i.test(lastUserMessage);
    
    // Als het een bedrijfsinformatie query is, haal ALTIJD bedrijfsinformatie items op
    // ⚡ Skip for fast path
    if (!useFastPath && isCompanyInfoQuery) {
      console.log('🏢 Bedrijfsinformatie query gedetecteerd - haal specifieke items op');
      const { data: companyInfo } = await supabaseClient
        .from('ai_knowledge_base')
        .select('id, category, key, value, confidence_score, usage_count, source, created_at, updated_at, role_tags, valid_from, valid_to, validation_status')
        .eq('org_id', userOrgId)
        .or('key.ilike.%bedrijfsinformatie%,key.ilike.%contactgegevens%,key.ilike.%kvk%,key.ilike.%adres%')
        .eq('validation_status', 'verified')
        .is('deleted_at', null)
        .limit(20);
      
      if (companyInfo && companyInfo.length > 0) {
        semanticKnowledge = companyInfo.map((item: any) => ({
          ...item,
          similarity: 0.95, // Hoge similarity voor keyword matches
          source: 'keyword_match'
        }));
        console.log(`✅ Keyword match: ${companyInfo.length} bedrijfsinformatie items gevonden`);
      }
    }
    
    // 🧠 SEMANTIC SEARCH: Generate embedding and find relevant knowledge
    // ⚡ SKIP FOR FAST PATH (biggest performance win: ~1500ms saved)
    if (!useFastPath && OPENAI_API_KEY && lastUserMessage.length > 0) {
      console.log('🧠 Generating embedding for semantic search...');
      
      try {
        const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: lastUserMessage,
          }),
        });

        if (embeddingResponse.ok) {
          const embeddingData = await embeddingResponse.json();
          const queryEmbedding = embeddingData.data[0].embedding;
          
          console.log('✅ Embedding generated, calling match_knowledge...');
          
          perfTimers.embedding = Date.now() - perfTimers.start;
          console.log(`⏱️ Embedding generated in ${perfTimers.embedding}ms`);
          
          // 🎯 FIX 3: Verlaag threshold voor bedrijfsinformatie queries
          const matchThreshold = isCompanyInfoQuery ? 0.65 : 0.75;
          
          // Call match_knowledge V3 function with validation filter AND explicit shared knowledge
          // ⚠️ CRITICAL: Parameter order must match function signature exactly!
          const { data: semanticMatches, error: matchError } = await supabaseClient
            .rpc('match_knowledge', {
              query_embedding: queryEmbedding,
              match_threshold: matchThreshold,  // Dynamisch gebaseerd op query type
              match_count: 20,  // Verlaagd voor snelheid
              filter_org_id: userOrgId,
              filter_role_tags: [detectedRole],
              filter_customer_id: null,         // ✅ Positie 6: geen customer filtering
              filter_jurisdiction: 'NL',        // ✅ Positie 7: Nederlandse jurisdictie
              require_verified: true,           // ✅ Positie 8: alleen verified items
              include_shared: true              // ✅ Positie 9: shared knowledge ophalen
            });

          // 📊 Log match_knowledge call metrics (fire-and-forget)
          const searchDurationMs = Date.now() - perfTimers.start - perfTimers.embedding;
          logMatchKnowledgeCall(supabaseServiceClient, {
            call_type: 'primary',
            include_shared: true,
            threshold: matchThreshold,
            total_results: semanticMatches?.length || 0,
            shared_results: countSharedResults(semanticMatches),
            avg_similarity: calculateAvgSimilarity(semanticMatches),
            org_id: userOrgId,
            execution_time_ms: searchDurationMs,
            success: !matchError,
            error_message: matchError?.message
          }).catch(() => {}); // Non-blocking

          if (matchError) {
            console.error('❌ match_knowledge error:', matchError);
          } else if (!semanticMatches || semanticMatches.length === 0) {
            // ⚠️ No results logging for debugging
            console.log('⚠️ [SEMANTIC SEARCH] No matches found');
            console.log(`   - Threshold: ${matchThreshold}, Org: ${userOrgId}, include_shared: true`);
          } else if (semanticMatches.length > 0) {
            // 🔍 DEBUG: Log shared knowledge retrieval
            const sharedCount = semanticMatches.filter((m: any) => m.is_shared === true).length;
            const ownOrgCount = semanticMatches.filter((m: any) => m.org_id === userOrgId && !m.is_shared).length;
            console.log(`🔗 [SHARED KNOWLEDGE DEBUG] Retrieved ${semanticMatches.length} items:`);
            console.log(`   - Shared (is_shared=true): ${sharedCount}`);
            console.log(`   - Own org: ${ownOrgCount}`);
            console.log(`   - User org_id: ${userOrgId}`);
            if (sharedCount > 0) {
              const sharedCategories = [...new Set(semanticMatches.filter((m: any) => m.is_shared).map((m: any) => m.category))];
              console.log(`   - Shared categories: ${sharedCategories.join(', ')}`);
            }
            
            // Merge keyword matches met semantic matches (keyword matches eerst)
            const existingIds = new Set(semanticKnowledge.map((k: any) => k.id));
            const newSemanticMatches = semanticMatches
              .filter((m: any) => !existingIds.has(m.knowledge_id))
              .map((m: any) => ({
                id: m.knowledge_id,
                category: m.category,
                key: m.key,
                value: m.value,
                confidence_score: m.confidence_score,
                similarity: m.similarity,
                role_tags: m.role_tags,
                valid_from: m.valid_from,
                valid_to: m.valid_to,
                usage_count: 0,
                source: 'semantic_search',
                created_at: new Date().toISOString(),
                is_shared: m.is_shared || false  // Track shared status
              }));
            
            // Voeg semantic matches toe aan bestaande keyword matches
            semanticKnowledge = [...semanticKnowledge, ...newSemanticMatches];
            
            perfTimers.semanticSearch = Date.now() - perfTimers.start - perfTimers.embedding;
            console.log(`✅ Found ${semanticKnowledge.length} total items (${semanticMatches.length} from semantic, ${semanticKnowledge.length - semanticMatches.length} from keywords) in ${perfTimers.semanticSearch}ms`);
            console.log(`   Top 3 similarities: ${semanticMatches.slice(0,3).map((m: any) => m.similarity.toFixed(3)).join(', ')}`);
          }
        } else {
          console.log('⚠️ Embedding generation failed:', await embeddingResponse.text());
        }
      } catch (error) {
        console.error('❌ Semantic search error:', error);
      }
    } else {
      console.log('⚠️ OPENAI_API_KEY not configured or empty message - falling back to category-based search only');
    }
    
    // ============================================
    // PHASE 1.4: CONFIDENCE THRESHOLD CHECK
    // ============================================
    // Calculate pre-generation confidence to determine if we should proceed
    if (fullKnowledgeBase.length > 0) {
      const avgConfidence = fullKnowledgeBase.reduce((sum: number, kb: any) => 
        sum + (kb.confidence_score || kb.similarity || 0.5), 0
      ) / fullKnowledgeBase.length;
      
      const verifiedCount = fullKnowledgeBase.filter((kb: any) => 
        kb.validation_status === 'verified'
      ).length;
      const verifiedRatio = verifiedCount / fullKnowledgeBase.length;
      
      // Weighted confidence: 60% avg confidence + 40% verified ratio
      const semanticConfidence = (avgConfidence * 0.6) + (verifiedRatio * 0.4);
      
      console.log(`🎯 Pre-generation confidence: ${(semanticConfidence * 100).toFixed(0)}% (avg: ${(avgConfidence * 100).toFixed(0)}%, verified: ${(verifiedRatio * 100).toFixed(0)}%)`);
      
      // CRITICAL: If confidence < 0.6, return refusal response immediately
      if (semanticConfidence < 0.6) {
        console.warn(`⚠️ CONFIDENCE THRESHOLD NOT MET: ${(semanticConfidence * 100).toFixed(0)}% < 60%`);
        
        // Identify what we DO know with high confidence
        const highConfidenceItems = fullKnowledgeBase
          .filter((kb: any) => (kb.confidence_score || 0) >= 0.8)
          .slice(0, 3);
        
        const knownInfo = highConfidenceItems.length > 0
          ? `\n\n✅ **Wat ik WEL met zekerheid weet:**\n${highConfidenceItems.map((kb: any) => 
              `• ${kb.key}: ${typeof kb.value === 'string' ? kb.value : JSON.stringify(kb.value)}`
            ).join('\n')}`
          : '';
        
        const refusalMessage = `⚠️ **Onvoldoende zekerheid om te antwoorden**

Ik kan deze vraag niet met voldoende betrouwbaarheid beantwoorden op basis van de beschikbare informatie in de kennisbank.

📊 **Huidige confidence:** ${(semanticConfidence * 100).toFixed(0)}% (minimaal vereist: 60%)
📚 **Beschikbare bronnen:** ${fullKnowledgeBase.length} items (waarvan ${verifiedCount} geverifieerd)${knownInfo}

💡 **Om een betrouwbaar antwoord te geven heb ik nodig:**
• Meer specifieke context (bijvoorbeeld periode, locatie, of specifieke situatie)
• Aanvullende informatie in de kennisbank over dit onderwerp
• Verificatie van bestaande bronnen

🔍 Je kunt ook proberen:
• De vraag anders formuleren met meer specifieke details
• Vragen naar gerelateerde onderwerpen waar meer kennis over beschikbaar is`;

        // Return refusal response immediately without AI call
        return new Response(
          JSON.stringify({
            role: 'assistant',
            content: refusalMessage,
            confidence_refusal: true,
            semantic_confidence: semanticConfidence
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      console.log(`✅ Confidence threshold met (${(semanticConfidence * 100).toFixed(0)}% >= 60%), proceeding with AI generation`);
    }
    
    // PHASE 1.5: Detect knowledge conflicts before using (with SPRINT 2 deep analysis)
    await detectKnowledgeConflicts(fullKnowledgeBase, supabaseClient, userOrgId, LOVABLE_API_KEY);
    
    // Organize knowledge by category for structured presentation
    const knowledgeByCategory: { [key: string]: any[] } = {};
    fullKnowledgeBase.forEach((kb: any) => {
      if (!knowledgeByCategory[kb.category]) {
        knowledgeByCategory[kb.category] = [];
      }
      knowledgeByCategory[kb.category].push(kb);
    });
    
    // Format knowledge base for AI consumption
    const formatKnowledgeBase = () => {
      if (fullKnowledgeBase.length === 0) return "Geen kennis beschikbaar.";
      
      let formatted = "";
      const categoryLabels: { [key: string]: string } = {
        bedrijfsgegevens: "📋 BEDRIJFSGEGEVENS",
        tarieven: "💰 TARIEVEN & PRIJZEN",
        contracten: "📝 CONTRACTEN & AFSPRAKEN",
        processen: "⚙️ PROCESSEN & WORKFLOWS",
        compliance: "✅ COMPLIANCE & REGELGEVING",
        zzp_vereisten: "👤 ZZP VEREISTEN",
        user_preference: "⭐ GEBRUIKER VOORKEUREN",
        business_rule: "📏 BEDRIJFSREGELS",
        workflow_pattern: "🔄 WORKFLOW PATRONEN",
        decision_context: "🎯 BESLISSING CONTEXT"
      };
      
      // Priority order for categories
      const priorityCategories = [
        "contracten", "tarieven", "zzp_vereisten", "compliance", 
        "processen", "bedrijfsgegevens", "user_preference", "business_rule", 
        "workflow_pattern", "decision_context"
      ];
      
      priorityCategories.forEach(category => {
        if (knowledgeByCategory[category] && knowledgeByCategory[category].length > 0) {
          formatted += `\n${categoryLabels[category] || category.toUpperCase()}:\n`;
          knowledgeByCategory[category].forEach((kb: any) => {
            const value = typeof kb.value === 'string' ? kb.value : JSON.stringify(kb.value, null, 2);
            formatted += `  • [ID: ${kb.id}] ${kb.key}: ${value}`;
            if (kb.confidence_score) formatted += ` [Zekerheid: ${(kb.confidence_score * 100).toFixed(0)}%]`;
            if (kb.source) formatted += ` [Bron: ${kb.source}]`;
            formatted += `\n`;
          });
        }
      });
      
      return formatted;
    };
    
    // Analyze knowledge base for user preferences and patterns (keep for backward compatibility)
    const userPreferences = fullKnowledgeBase.filter((kb: any) => kb.category === 'user_preference');
    const businessRules = fullKnowledgeBase.filter((kb: any) => kb.category === 'business_rule');
    const workflowPatterns = fullKnowledgeBase.filter((kb: any) => kb.category === 'workflow_pattern');
    const decisionContexts = fullKnowledgeBase.filter((kb: any) => kb.category === 'decision_context');
    
    // Analyze learning events for patterns
    const successfulPatterns = learningEvents.filter((le: any) => le.outcome === 'success' && le.learning_score > 0.7);
    const rejectedSuggestions = learningEvents.filter((le: any) => le.event_type === 'suggestion_rejected');
    const acceptedSuggestions = learningEvents.filter((le: any) => le.event_type === 'suggestion_accepted');
    
    // Calculate workload metrics
    const totalTimeThisWeek = timeEntries?.reduce((sum, e) => sum + (e.duration_min || 0), 0) || 0;
    const avgTasksPerDay = activeTasks.length / 7;
    
    // Client insights
    const clientMap = new Map(clients?.map(c => [c.id, c]) || []);
    const tasksWithClients = activeTasks.filter(t => t.client_id);
    
    // Compacte context summary
    const contextSummary = `
GEBRUIKER: ${profile?.name || 'Gebruiker'}

STATUS OVERZICHT (VOOR CONTEXT - NIET VOLLEDIG):
- Actief: ${activeTasks.length} | Afgerond: ${completedTasks.length} | Verlopen: ${overdueTasks.length}
${activeTimeEntry ? `🟢 Bezig: Taak ${activeTimeEntry.task_id}` : ''}

⚠️ BELANGRIJK: Dit is NIET de volledige takenlijst!
→ Voor taken queries: gebruik ALTIJD de query_tasks tool voor actuele, complete data

WERKLOCATIES (${clients?.length || 0}):
${clients?.map(c => `${c.organization_name || ''} - ${c.naam}${c.plaats ? ` (${c.plaats})` : ''}`).join(' | ') || 'Geen'}

TOP 5 ACTIEVE TAKEN (ter referentie):
${activeTasks.slice(0, 5).map((t, i) => `${i + 1}. [${t.priority}] ${t.title}${t.due_at ? ` (${new Date(t.due_at).toLocaleDateString('nl-NL')})` : ''}`).join('\n')}

KENNIS: ${fullKnowledgeBase.length} items | INSIGHTS: ${businessIntel.length}
`;

    // Get current Dutch date/time
    const dutchDateTime = new Date().toLocaleString('nl-NL', { 
      timeZone: 'Europe/Amsterdam',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const dutchDate = new Date().toLocaleDateString('nl-NL', {
      timeZone: 'Europe/Amsterdam',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });

    // Extract key facts from conversation history
    const extractKeyFacts = (history: any[]): string | null => {
      if (!history || history.length === 0) return null;
      
      const facts: string[] = [];
      const recentMessages = [...history].reverse().slice(0, 10);
      
      recentMessages.forEach(msg => {
        if (msg.role === 'user') {
          const content = msg.content.toLowerCase();
          
          // Detect preferences
          if (content.includes('mijn voorkeur') || content.includes('ik wil altijd') || content.includes('standaard')) {
            facts.push(`👤 Voorkeur: ${msg.content.substring(0, 150)}`);
          }
          
          // Detect context switches (client/project names)
          if (content.includes('klant') || content.includes('client')) {
            const clientMatch = msg.content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/);
            if (clientMatch) {
              facts.push(`🏢 Context: Bezig met ${clientMatch[0]}`);
            }
          }
          
          // Detect important facts
          if (content.includes('belangrijk') || content.includes('let op') || content.includes('onthoud')) {
            facts.push(`⚠️ ${msg.content.substring(0, 150)}`);
          }
        }
      });
      
      const uniqueFacts = [...new Set(facts)].slice(0, 5);
      return uniqueFacts.length > 0 ? uniqueFacts.join('\n') : null;
    };

    const keyFacts = extractKeyFacts(chatHistory || []);
    const conversationSummary = keyFacts 
      ? `\n📋 BELANGRIJKE CONTEXT UIT EERDERE GESPREKKEN:\n${keyFacts}\n`
      : '';

    // ✅ STAP 3: Haal org_profiles op voor ground truth context
    const { data: orgProfiles } = await supabaseClient
      .from('org_profiles')
      .select('*')
      .eq('org_id', userOrgId);
    
    // 🧠 INTELLIGENT CONFLICT RESOLUTION: org_profiles met cross-validatie
    
    // 🏢 FASE 6: ORGANISATIEGEGEVENS MET INTELLIGENTE VALIDATIE
    let orgProfileGroundTruth = '';
    if (orgProfiles && orgProfiles.length > 0) {
      orgProfileGroundTruth = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      orgProfileGroundTruth += `🏢 **GEVERIFIEERDE ORGANISATIEGEGEVENS**\n`;
      orgProfileGroundTruth += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      
      // ✅ KVK ENRICHED DATA DISCLAIMER (HOOGSTE PRIORITEIT)
      if (kvkEnrichedData.length > 0) {
        orgProfileGroundTruth += `🏛️ **KVK GEVERIFIEERDE DATA** (${kvkEnrichedData.length} items):\n`;
        orgProfileGroundTruth += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        orgProfileGroundTruth += `✅ Deze gegevens zijn real-time opgehaald uit het officiële KVK register\n`;
        orgProfileGroundTruth += `✅ Dit is de MEEST BETROUWBARE bron voor bedrijfsgegevens (confidence: 100%)\n`;
        orgProfileGroundTruth += `✅ Bij tegenstrijdigheden: KVK data heeft ALTIJD voorrang boven andere bronnen\n`;
        orgProfileGroundTruth += `💰 Cost saved door smart caching: €${kvkCostSaved.toFixed(2)}\n\n`;
        
        kvkEnrichedData.forEach((item: any) => {
          const data = item.value;
          orgProfileGroundTruth += `**${data.naam || 'Bedrijf'}:**\n`;
          orgProfileGroundTruth += `├─ **KvK-nummer:** ${data.kvk_nummer}\n`;
          orgProfileGroundTruth += `├─ **Adres:** ${data.bezoekadres || 'Niet beschikbaar'}\n`;
          orgProfileGroundTruth += `├─ **Postcode:** ${data.postcode || 'Niet beschikbaar'}\n`;
          orgProfileGroundTruth += `├─ **Plaats:** ${data.plaats || 'Niet beschikbaar'}\n`;
          if (data.telefoonnummer) orgProfileGroundTruth += `├─ **Telefoon:** ${data.telefoonnummer}\n`;
          if (data.email) orgProfileGroundTruth += `├─ **Email:** ${data.email}\n`;
          if (data.website) orgProfileGroundTruth += `├─ **Website:** ${data.website}\n`;
          if (data.type_onderneming) orgProfileGroundTruth += `├─ **Type:** ${data.type_onderneming}\n`;
          if (data.hoofdactiviteit) orgProfileGroundTruth += `├─ **Hoofdactiviteit:** ${data.hoofdactiviteit}\n`;
          orgProfileGroundTruth += `└─ **Data bron:** ${item.source} (cached)\n\n`;
        });
        
        orgProfileGroundTruth += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      }
      
      orgProfileGroundTruth += `ℹ️ **BELANGRIJK:** Deze gegevens worden continu gevalideerd tegen de kennisbank.\n`;
      orgProfileGroundTruth += `Als je tegenstrijdige informatie vindt met hoge betrouwbaarheid (>85%), meld dit.\n\n`;
      
      orgProfiles.forEach((profile: any) => {
        orgProfileGroundTruth += `**${profile.brand_name}:**\n`;
        orgProfileGroundTruth += `├─ **KvK-nummer:** ${profile.kvk_number}\n`;
        orgProfileGroundTruth += `├─ **Adres:** ${profile.address || 'Niet gespecificeerd'}\n`;
        orgProfileGroundTruth += `├─ **Postcode:** ${profile.postal_code || 'Niet gespecificeerd'}\n`;
        orgProfileGroundTruth += `├─ **Plaats:** ${profile.city || 'Niet gespecificeerd'}\n`;
        orgProfileGroundTruth += `├─ **Bedrijfstype:** ${profile.business_type || 'Niet gespecificeerd'}\n`;
        orgProfileGroundTruth += `├─ **Primair domein:** ${profile.primary_domain || 'Niet gespecificeerd'}\n`;
        
        const services = profile.services || [];
        const excluded = profile.excluded_services || [];
        
        if (services.length > 0) {
          orgProfileGroundTruth += `├─ **Diensten:** ${services.join(', ')}\n`;
        }
        if (excluded.length > 0) {
          orgProfileGroundTruth += `├─ **NIET geleverd:** ${excluded.join(', ')}\n`;
        }
        
        orgProfileGroundTruth += `└─ **Laatste update:** ${new Date(profile.updated_at).toLocaleDateString('nl-NL')}\n\n`;
      });
      
      // 🎯 FIX 2: EXPLICIETE ADRESGEGEVENS INSTRUCTIE
      orgProfileGroundTruth += `🔍 **VALIDATIE INSTRUCTIES:**\n`;
      orgProfileGroundTruth += `- Combineer org_profiles met de kennisbank voor complete informatie\n`;
      orgProfileGroundTruth += `- Bij conflict: kies de bron met hoogste confidence EN meest recente verificatie\n`;
      orgProfileGroundTruth += `- Als org_profiles ouder of minder betrouwbaar: volg de kennisbank en meld het verschil\n`;
      orgProfileGroundTruth += `- Ontbrekende info: "Niet beschikbaar, graag bevestigen"\n`;
      orgProfileGroundTruth += `- Bij twijfel: vraag om verificatie in plaats van te speculeren\n\n`;
      
      orgProfileGroundTruth += `⚠️ **KRITIEKE REGEL VOOR ADRESGEGEVENS:**\n`;
      orgProfileGroundTruth += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      orgProfileGroundTruth += `🚫 ZEG NOOIT "Niet gespecificeerd" of "Niet beschikbaar" als de data WEL bestaat!\n\n`;
      orgProfileGroundTruth += `✅ GEBRUIK ALTIJD de beschikbare data uit:\n`;
      orgProfileGroundTruth += `   1. org_profiles (hierboven)\n`;
      orgProfileGroundTruth += `   2. ai_knowledge_base items (met keys zoals: bedrijfsinformatie_*, contactgegevens_*, etc.)\n\n`;
      orgProfileGroundTruth += `📋 Als je GEVRAAGD wordt naar adres/KvK/gegevens:\n`;
      orgProfileGroundTruth += `   → Check EERST org_profiles\n`;
      orgProfileGroundTruth += `   → Check DAARNA knowledge base items\n`;
      orgProfileGroundTruth += `   → Gebruik de MEEST COMPLETE en RECENTE data\n`;
      orgProfileGroundTruth += `   → Combineer bronnen voor volledigheid\n\n`;
      orgProfileGroundTruth += `❌ ALLEEN zeg "Niet beschikbaar" als de data ECHT niet bestaat in BEIDE bronnen\n`;
      orgProfileGroundTruth += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }

    // ⚡ SYSTEM PROMPT: Built via extracted module for maintainability
    const systemPromptContext: SystemPromptContext = {
      detectedRole,
      orgProfileGroundTruth,
      dutchDateTime,
      conversationSummary,
      keyFacts,
      pageContext,
      contextSummary,
      clients,
      fullKnowledgeBase,
      formatKnowledgeBase,
    };
    
    const systemPrompt = buildSystemPrompt(systemPromptContext);

    // LOVABLE_API_KEY already fetched earlier for conflict detection
    // Just verify it's still available
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Define available tools for the AI
    const tools = [
      {
        type: "function",
        function: {
          name: "create_task",
          description: "Maak een nieuwe taak aan in het systeem",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Titel van de taak" },
              description: { type: "string", description: "Gedetailleerde beschrijving van de taak" },
              priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], description: "Prioriteit van de taak (gebruik LOW, MEDIUM, HIGH, of CRITICAL)" },
              due_at: { type: "string", description: "Deadline in ISO 8601 formaat (optioneel)" },
              start_at: { type: "string", description: "Start datum/tijd in ISO 8601 formaat (optioneel, maar aanbevolen voor kalender zichtbaarheid)" },
              project_id: { type: "string", description: "UUID van het project (optioneel)" },
              client_id: { type: "string", description: "UUID van de client (optioneel)" },
              assignee_id: { type: "string", description: "UUID van de toegewezen persoon (optioneel)" }
            },
            required: ["title"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_task",
          description: "Wijzig een bestaande taak",
          parameters: {
            type: "object",
            properties: {
              task_id: { type: "string", description: "UUID van de taak om te wijzigen" },
              title: { type: "string", description: "Nieuwe titel (optioneel)" },
              description: { type: "string", description: "Nieuwe beschrijving (optioneel)" },
              priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], description: "Nieuwe prioriteit (gebruik LOW, MEDIUM, HIGH, of CRITICAL)" },
              start_at: { type: "string", description: "Nieuwe start datum/tijd in ISO 8601 formaat (optioneel)" },
              due_at: { type: "string", description: "Nieuwe deadline in ISO 8601 formaat (optioneel)" },
              completed_at: { type: "string", description: "Completion timestamp in ISO 8601 formaat om taak af te ronden (optioneel)" }
            },
            required: ["task_id"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "add_comment",
          description: "Voeg een comment toe aan een taak",
          parameters: {
            type: "object",
            properties: {
              task_id: { type: "string", description: "UUID van de taak" },
              body: { type: "string", description: "Inhoud van de comment" }
            },
            required: ["task_id", "body"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "save_knowledge",
          description: "Sla belangrijke informatie op in de permanente knowledge base (gebruiker voorkeuren, bedrijfsregels, workflow patronen, beslissingen)",
          parameters: {
            type: "object",
            properties: {
              category: { 
                type: "string", 
                enum: ["user_preference", "business_rule", "workflow_pattern", "decision_context"],
                description: "Type kennis: user_preference (hoe gebruiker werkt), business_rule (policies/procedures), workflow_pattern (herhalende processen), decision_context (waarom iets besloten is)" 
              },
              key: { type: "string", description: "Unieke sleutel voor deze kennis (bijv. 'preferred_work_hours', 'client_x_sla')" },
              value: { type: "object", description: "De data om op te slaan (JSON object)" },
              confidence_score: { type: "number", description: "Hoe zeker ben je van deze informatie (0.0 - 1.0)", minimum: 0, maximum: 1 },
              source: { type: "string", description: "Waar komt deze kennis vandaan (bijv. 'user_stated', 'observed_pattern')" }
            },
            required: ["category", "key", "value"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "log_learning_event",
          description: "Log een leer gebeurtenis voor pattern recognition en verbetering",
          parameters: {
            type: "object",
            properties: {
              event_type: { 
                type: "string",
                enum: ["feedback_positive", "feedback_negative", "task_completed", "pattern_detected", "suggestion_accepted", "suggestion_rejected"],
                description: "Type leer gebeurtenis"
              },
              context: { type: "object", description: "Alle relevante context (wat gebeurde er)" },
              ai_response: { type: "object", description: "Wat had je gesuggereerd/gezegd (optioneel)" },
              user_action: { type: "object", description: "Wat deed de gebruiker (optioneel)" },
              outcome: { type: "string", enum: ["success", "failure", "partial"], description: "Resultaat" },
              learning_score: { type: "number", description: "Hoe waardevol is deze learning (0.0 - 1.0)", minimum: 0, maximum: 1 }
            },
            required: ["event_type", "context", "outcome"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_business_intelligence",
          description: "Creëer een business intelligence insight. Gebruik dit ALTIJD bij knowledge gaps om de gap te loggen. NA het loggen van een knowledge_gap, gebruik DIRECT auto_harvest_knowledge.",
          parameters: {
            type: "object",
            properties: {
              intelligence_type: {
                type: "string",
                enum: ["workflow_pattern", "productivity_insight", "bottleneck", "optimization_opportunity", "knowledge_gap", "market_insight"],
                description: "Type insight. Gebruik 'knowledge_gap' wanneer ontbrekende kennis wordt gedetecteerd."
              },
              title: { type: "string", description: "Korte titel van het insight" },
              description: { type: "string", description: "Gedetailleerde beschrijving" },
              data: { type: "object", description: "Alle ondersteunende data" },
              priority: { type: "string", enum: ["low", "medium", "high"], description: "Prioriteit van dit insight" },
              impact_score: { type: "number", description: "Verwachte impact (0.0 - 10.0)", minimum: 0, maximum: 10 }
            },
            required: ["intelligence_type", "title", "data"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "verify_answer_confidence",
          description: "🔒 INTERN VALIDATION TOOL - Gebruik dit NADAT je het volledige antwoord hebt gegeven. Deze tool berekent je confidence (0-100%) voor interne validatie. Gebruiker ziet ALLEEN je antwoord content, NIET de raw tool output. De confidence badge wordt automatisch toegevoegd door het systeem.",
          strict: false,
          parameters: {
            type: "object",
            properties: {
              used_knowledge_ids: {
                type: "array",
                items: { type: "string" },
                description: "UUIDs van kennisitems gebruikt in antwoord"
              },
              answer_summary: {
                type: "string",
                description: "Korte samenvatting van je antwoord (max 200 chars)"
              },
              key_claims: {
                type: "array",
                items: { type: "string" },
                description: "Belangrijkste feiten/claims in je antwoord"
              }
            },
            required: ["used_knowledge_ids", "answer_summary"]
          }
        }
      },
      // NOTE: auto_harvest_knowledge tool verwijderd in Fase 16 - edge function bestaat niet
        {
          type: "function",
          function: {
            name: "search_professionals",
            description: "⚠️ ALLEEN VOOR PERSONEN/ZZP'ERS - NIET VOOR KLANTEN/ORGANISATIES! Zoek beschikbare ZZP'ers/professionals/freelancers op basis van filters. Gebruik dit wanneer gebruiker vraagt om NAMEN VAN ZZP'ERS, WIE BESCHIKBAAR IS, of een lijst van PROFESSIONALS/PERSONEN wil. 🚫 GEBRUIK NOOIT voor vragen over 'klanten', 'klantenoverzicht', 'opdrachtgevers', 'organisaties' - dit zijn GEEN professionals maar client bedrijven!",
            parameters: {
            type: "object",
            properties: {
              functie: {
                type: "string",
                enum: ["Helpende 2", "VIG", "VP3", "VP4", "HBO-V"],
                description: "Functie niveau van de professional"
              },
              regio: {
                type: "string",
                description: "Regio/locatie waar professional moet werken (bijv. Eindhoven, Nijmegen)"
              },
              vanaf_datum: {
                type: "string",
                description: "Start datum (YYYY-MM-DD) voor beschikbaarheid check"
              },
              tot_datum: {
                type: "string",
                description: "Eind datum (YYYY-MM-DD) voor beschikbaarheid check"
              },
              aantal: {
                type: "number",
                description: "Aantal professionals om te tonen",
                default: 10
              }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_multiple_tasks",
          description: "Maak meerdere taken tegelijk aan in bulk. Gebruik dit wanneer de gebruiker een lijst van taken uploadt of meerdere taken tegelijk wil aanmaken (bijv. uit een Excel/tabel). Voor 1-3 taken gebruik create_task, voor 4+ taken gebruik create_multiple_tasks.",
          parameters: {
            type: "object",
            properties: {
              tasks: {
                type: "array",
                description: "Array van taken om aan te maken",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "Titel van de taak" },
                    description: { type: "string", description: "Gedetailleerde beschrijving" },
                    priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], description: "Prioriteit (LOW, MEDIUM, HIGH, of CRITICAL)" },
                    due_at: { type: "string", description: "Deadline in ISO 8601 formaat (optioneel)" },
                    start_at: { type: "string", description: "Start datum/tijd in ISO 8601 formaat (optioneel)" },
                    project_id: { type: "string", description: "UUID van het project (optioneel)" },
                    client_id: { type: "string", description: "UUID van de client (optioneel)" },
                    assignee_id: { type: "string", description: "UUID van de toegewezen persoon (optioneel)" }
                  },
                  required: ["title"]
                }
              }
            },
            required: ["tasks"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "declare_knowledge_usage",
          description: "🎯 CRITICAL: Declareer expliciet welke knowledge base items je hebt gebruikt in je antwoord. Dit zorgt voor accurate tracking en verbetert mijn learning loop. Roep deze tool ALTIJD aan nadat je een antwoord hebt gegeven dat gebaseerd is op de kennisbank.",
          parameters: {
            type: "object",
            properties: {
              knowledge_ids: {
                type: "array",
                description: "Array van knowledge base item UUIDs die je hebt gebruikt in je antwoord",
                items: {
                  type: "string",
                  description: "UUID van een knowledge base item"
                }
              },
              usage_context: {
                type: "string",
                description: "Korte beschrijving van hoe je deze kennis hebt toegepast (optioneel)"
              }
            },
            required: ["knowledge_ids"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "query_tasks",
          description: "Query de tasks database om vragen te beantwoorden over taak geschiedenis, voltooiingen, verantwoordelijken, tijdsregistraties, etc. Gebruik dit wanneer gebruikers vragen stellen over welke taken zijn afgerond, wie verantwoordelijk was, hoelang er aan is gewerkt, etc.",
          parameters: {
            type: "object",
            properties: {
              filter: {
                type: "object",
                description: "Filters voor de query",
                properties: {
                  completed: { type: "boolean", description: "Filter op afgeronde taken (true) of actieve taken (false)" },
                  assignee_id: { type: "string", description: "Filter op toegewezen persoon UUID" },
                  date_range: { 
                    type: "object",
                    description: "Filter op datum bereik",
                    properties: {
                      start: { type: "string", description: "Start datum (ISO 8601)" },
                      end: { type: "string", description: "Eind datum (ISO 8601)" }
                    }
                  },
                  priority: { 
                    type: "string", 
                    enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
                    description: "Filter op prioriteit" 
                  },
                  on_time: { type: "boolean", description: "Filter op tijdig afgeronde taken" }
                }
              },
              include: {
                type: "array",
                description: "Welke gerelateerde data moet worden meegenomen",
                items: { 
                  type: "string", 
                  enum: ["subtasks", "time_entries", "assignee", "comments"]
                }
              },
              limit: {
                type: "number",
                description: "Maximum aantal resultaten",
                default: 50
              }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "query_applications",
          description: "Doorzoek sollicitaties/applications om vragen te beantwoorden over kandidaten, pipeline status, completeness scores, ontbrekende informatie, etc. Gebruik dit wanneer gebruikers vragen stellen over sollicitanten, wie er in de pipeline zit, hoeveel nieuwe aanmeldingen er zijn, etc.",
          parameters: {
            type: "object",
            properties: {
              filter: {
                type: "object",
                properties: {
                  pipeline_stage: { 
                    type: "string", 
                    enum: ["nieuw", "screening", "interview", "goedgekeurd", "geplaatst", "afgewezen"],
                    description: "Filter op pipeline fase"
                  },
                  status: { 
                    type: "string", 
                    enum: ["nieuw", "in_behandeling", "wacht_op_info", "compleet", "afgerond"],
                    description: "Filter op status"
                  },
                  completeness_min: { 
                    type: "number", 
                    description: "Minimum completeness score (0-100)"
                  },
                  date_range: {
                    type: "object",
                    properties: {
                      start: { type: "string", description: "Start datum (ISO 8601)" },
                      end: { type: "string", description: "Eind datum (ISO 8601)" }
                    }
                  },
                  functie_niveau: { 
                    type: "string", 
                    enum: ["VIG", "HBO-V", "Verpleegkundige MBO", "Helpende", "Begeleider", "Persoonlijk begeleider", "GGZ-agoog"],
                    description: "Filter op functieniveau"
                  },
                  werkvorm: { 
                    type: "string", 
                    enum: ["ZZP", "Uitzendkracht", "ABCito constructie"],
                    description: "Filter op gewenste werkvorm"
                  },
                  assigned_organization: { 
                    type: "string", 
                    enum: ["ABCzorg", "CitoZorg"],
                    description: "Filter op toegewezen organisatie"
                  },
                  regio: { 
                    type: "string",
                    description: "Filter op regio (bijv. 'Utrecht', 'Amsterdam')"
                  }
                }
              },
              include: {
                type: "array",
                items: { 
                  type: "string", 
                  enum: ["extracted_data", "missing_info", "professional", "conversations"]
                }
              },
              limit: { type: "number", default: 50 }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "query_professional_matches",
          description: "Doorzoek bestaande match-suggesties tussen professionals en clients. Gebruik dit om te zien welke matches zijn voorgesteld, goedgekeurd of afgewezen.",
          parameters: {
            type: "object",
            properties: {
              filter: {
                type: "object",
                properties: {
                  professional_id: { type: "string", description: "Filter op specifieke professional UUID" },
                  client_id: { type: "string", description: "Filter op specifieke client UUID" },
                  status: { 
                    type: "string", 
                    enum: ["suggested", "approved", "rejected", "placed"],
                    description: "Filter op match status"
                  },
                  min_score: { type: "number", description: "Minimum match score (0-100)" }
                }
              },
              include: {
                type: "array",
                items: { 
                  type: "string", 
                  enum: ["professional", "client", "reasoning"]
                }
              },
              limit: { type: "number", default: 20 }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "query_placements",
          description: "Doorzoek actieve plaatsingen van professionals bij klanten. Gebruik dit om te zien wie waar werkt, match scores, en placement status.",
          parameters: {
            type: "object",
            properties: {
              filter: {
                type: "object",
                properties: {
                  status: { type: "string", description: "Filter op status (suggested/active/completed)" },
                  professional_id: { type: "string", description: "Filter op specifieke professional UUID" },
                  client_id: { type: "string", description: "Filter op specifieke client UUID" },
                  min_match_score: { type: "number", description: "Minimum match score (0-100)" },
                  date_range: {
                    type: "object",
                    properties: {
                      start: { type: "string", format: "date" },
                      end: { type: "string", format: "date" }
                    }
                  }
                }
              },
              limit: { type: "number", default: 50 }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "query_clients",
          description: "Doorzoek de VOLLEDIGE klant-hiërarchie: organisaties → locaties → sublocaties (930+ werklocaties). Gebruik voor telefoonnummers, adressen, contactpersonen, werklocaties. Dit is de primaire bron voor klantinformatie zoals Prisma, Lunet, SWZ, Amarant, etc.",
          parameters: {
            type: "object",
            properties: {
              filter: {
                type: "object",
                properties: {
                  organization_name: { 
                    type: "string",
                    description: "Zoek op organisatienaam (bijv. 'Prisma', 'Lunet', 'SWZ', 'Amarant')"
                  },
                  sublocation_name: { 
                    type: "string",
                    description: "Zoek op specifieke werklocatie/sublocation naam"
                  },
                  bureau: { 
                    type: "string", 
                    enum: ["ABCzorg", "CitoZorg"],
                    description: "Filter op bemiddelingsbureau" 
                  },
                  sector: { 
                    type: "string",
                    description: "Filter op sector (bijv. 'GHZ', 'GGZ', 'VVT', 'Jeugdzorg')"
                  },
                  plaats: { 
                    type: "string",
                    description: "Filter op stad/plaats (bijv. 'Eindhoven', 'Tilburg', 'Waalwijk')"
                  },
                  is_active: {
                    type: "boolean",
                    description: "Filter op actieve (true) of inactieve (false) locaties"
                  }
                }
              },
              include: {
                type: "array",
                description: "Welke extra data moet worden meegenomen",
                items: { 
                  type: "string", 
                  enum: ["telefoon", "adres", "contactpersoon", "sublocaties", "sector", "doelgroep"]
                }
              },
              limit: {
                type: "number",
                description: "Maximum aantal organisaties (default 15, sublocaties worden per org getoond)",
                default: 15
              }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "query_sublocations",
          description: "Zoek DIRECT in werklocaties/sublocaties (930+ locaties). Gebruik voor specifieke locaties, telefoonnummers, adressen. Sneller dan query_clients voor directe sublocation zoekopdrachten. ⚡ TIP: Gebruik count_only=true voor telvragen (hoeveel werklocaties) - VEEL sneller!",
          parameters: {
            type: "object",
            properties: {
              count_only: {
                type: "boolean",
                description: "⚡ SNELLE TELLING: Als true, retourneer alleen het totaal aantal (geen data ophalen). Gebruik dit voor 'hoeveel' vragen - 100x sneller!",
                default: false
              },
              filter: {
                type: "object",
                properties: {
                  naam: { 
                    type: "string",
                    description: "Zoek op (deel van) sublocation naam"
                  },
                  plaats: { 
                    type: "string",
                    description: "Filter op stad/plaats (bijv. 'Tilburg', 'Eindhoven')"
                  },
                  sector: { 
                    type: "string",
                    description: "Filter op sector (GHZ, GGZ, VVT, Jeugdzorg)"
                  },
                  doelgroep: { 
                    type: "string",
                    description: "Filter op doelgroep (LVB, Ouderen, Psychiatrie)"
                  },
                  bureau: { 
                    type: "string", 
                    enum: ["ABCzorg", "CitoZorg"],
                    description: "Filter op bemiddelingsbureau" 
                  },
                  is_active: {
                    type: "boolean",
                    description: "Filter op actieve locaties (default: true)"
                  }
                }
              },
              include: {
                type: "array",
                items: { 
                  type: "string", 
                  enum: ["telefoon", "adres", "sector", "doelgroep", "organisatie", "gezochte_functies"]
                }
              },
              limit: {
                type: "number",
                description: "Maximum aantal resultaten (default: 25)",
                default: 25
              }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "query_professionals",
          description: "Doorzoek professionals/ZZP'ers/uitzendkrachten database om vragen te beantwoorden over beschikbare professionals, hun functieniveau, werkvorm, regio, skills, etc. Gebruik dit wanneer gebruikers vragen stellen over professionals, zzp'ers, beschikbare arbeidskrachten, of wie er kan worden ingezet.",
          parameters: {
            type: "object",
            properties: {
              filter: {
                type: "object",
                description: "Filters voor de query",
                properties: {
                  functie_niveau: { 
                    type: "string", 
                    enum: ["VIG", "HBO-V", "Verpleegkundige MBO", "Helpende", "Begeleider", "Persoonlijk begeleider", "GGZ-agoog"],
                    description: "Filter op functieniveau"
                  },
                  werkvorm: { 
                    type: "string", 
                    enum: ["ZZP", "Uitzendkracht", "ABCito constructie"],
                    description: "Filter op werkvorm (ZZP, Uitzendkracht, ABCito)"
                  },
                  bureau: { 
                    type: "string", 
                    enum: ["ABCzorg", "CitoZorg"],
                    description: "Filter op bemiddelingsbureau waar de professional bij is geregistreerd"
                  },
                  regio: { 
                    type: "string",
                    description: "Filter op regio/werkgebied (bijv. 'Utrecht', 'Nijmegen')"
                  },
                  status: { 
                    type: "string",
                    description: "Filter op status (bijv. 'beschikbaar', 'actief')"
                  },
                  has_auto: { 
                    type: "boolean",
                    description: "Filter op professionals met eigen vervoer"
                  }
                }
              },
              limit: {
                type: "number",
                description: "Maximum aantal resultaten",
                default: 50
              }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "suggest_placements",
          description: "Genereer AI-gestuurde match suggesties tussen beschikbare professionals en clients. De AI analyseert functie niveau, regio, skills, beschikbaarheid en tarief om de beste matches te vinden.",
          parameters: {
            type: "object",
            properties: {
              professional_id: { 
                type: "string", 
                description: "Specifieke professional UUID (optioneel - als leeg: alle beschikbare professionals)"
              },
              client_id: { 
                type: "string", 
                description: "Specifieke client UUID (optioneel - als leeg: alle actieve clients)"
              },
              criteria: {
                type: "object",
                properties: {
                  min_match_score: { type: "number", default: 70 },
                  prioritize: { 
                    type: "string", 
                    enum: ["skills", "regio", "beschikbaarheid", "tarief"],
                    description: "Welk criterium heeft de hoogste prioriteit"
                  },
                  functie_niveau: { 
                    type: "string",
                    enum: ["Helpende 2", "VIG", "VP3", "VP4", "HBO-V"]
                  }
                }
              },
              save_suggestions: { 
                type: "boolean", 
                default: true,
                description: "Sla suggesties op in professional_client_matches tabel"
              }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "query_candidate_skills",
          description: "Doorzoek kandidaat skills en ervaring uit CV data. Gebruik dit wanneer gebruikers vragen stellen over kandidaten met specifieke sector ervaring (GHZ, GGZ, VVT, etc.) of doelgroep ervaring (LVB, Ouderen, Psychiatrie, etc.).",
          parameters: {
            type: "object",
            properties: {
              sector: {
                type: "array",
                items: { 
                  type: "string",
                  enum: ["GHZ", "GGZ", "VVT", "Jeugdzorg", "Thuiszorg", "Ziekenhuis"]
                },
                description: "Filter op sector ervaring (bijv. ['GHZ', 'GGZ'])"
              },
              doelgroep: {
                type: "array",
                items: { 
                  type: "string",
                  enum: ["LVB", "Ouderen", "Psychiatrie", "Somatiek", "Verslaving", "Kinderen/Jeugd"]
                },
                description: "Filter op doelgroep ervaring (bijv. ['LVB', 'Ouderen'])"
              },
              functie_niveau: {
                type: "string",
                enum: ["VIG", "HBO-V", "Verpleegkundige MBO", "Helpende", "Begeleider", "Persoonlijk begeleider", "GGZ-agoog"],
                description: "Filter op functieniveau (optioneel)"
              },
              limit: {
                type: "number",
                description: "Maximum aantal resultaten",
                default: 20
              }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "query_evaluation_insights",
          description: "Haal AI-geleerde inzichten op uit plaatsingsevaluaties. Gebruik dit om vragen te beantwoorden over match nauwkeurigheid, succesfactoren, verbeterpunten, en wat de AI heeft geleerd van voltooide plaatsingen.",
          parameters: {
            type: "object",
            properties: {
              insight_type: {
                type: "string",
                enum: ["success_patterns", "improvement_areas", "match_accuracy", "function_performance", "all"],
                description: "Type inzicht: success_patterns (wat werkt), improvement_areas (verbeterpunten), match_accuracy (AI voorspelling nauwkeurigheid), function_performance (prestatie per functieniveau)"
              },
              functie_niveau: {
                type: "string",
                enum: ["VIG", "HBO-V", "Verpleegkundige MBO", "Helpende", "Begeleider", "Persoonlijk begeleider", "GGZ-agoog"],
                description: "Filter op specifiek functieniveau (optioneel)"
              },
              time_period: {
                type: "string",
                enum: ["week", "month", "quarter", "year", "all"],
                description: "Periode voor analyse (default: all)"
              }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "query_learning_stats",
          description: "Rapporteer de AI's eigen leervoortgang en kennisstatistieken. Gebruik dit wanneer gebruikers vragen stellen over hoeveel de AI heeft geleerd, welke patronen bekend zijn, leervoortgang, of de AI zichzelf moet beschrijven qua kennis.",
          parameters: {
            type: "object",
            properties: {
              stat_type: {
                type: "string",
                enum: ["overview", "patterns", "categories", "growth", "all"],
                description: "Type statistiek: overview (samenvatting), patterns (geleerde succespatronen), categories (kennis per categorie), growth (groei over tijd)"
              }
            }
          }
        }
      },
      // =====================================================
      // CANDIDATE LOOKUP & SMART FOLLOW-UP TOOLS (Chat ↔ Agent Integration)
      // =====================================================
      {
        type: "function",
        function: {
          name: "lookup_candidate",
          description: "🔍 Zoek een kandidaat/sollicitant op basis van naam, email, of (deel van) ID. GEBRUIK DIT EERST voordat je follow-up, interview, of document acties uitvoert. Retourneert alle relevante info inclusief ontbrekende velden en huidige status.",
          parameters: {
            type: "object",
            properties: {
              search_query: { 
                type: "string", 
                description: "Naam, email, of (deel van) UUID om te zoeken" 
              },
              include_missing_info: {
                type: "boolean",
                description: "Haal ook ontbrekende informatie op (default: true)"
              }
            },
            required: ["search_query"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "send_smart_followup",
          description: "📧 Stuur een intelligente follow-up email naar een kandidaat. Haalt automatisch ontbrekende informatie op en genereert context-aware email. Toont een bevestigingskaart voordat de email wordt verstuurd.",
          parameters: {
            type: "object",
            properties: {
              application_id: { 
                type: "string", 
                description: "UUID van de sollicitatie (verkrijg via lookup_candidate)" 
              },
              candidate_name: {
                type: "string",
                description: "Naam van de kandidaat"
              },
              candidate_email: {
                type: "string",
                description: "Email adres van de kandidaat"
              },
              custom_message: { 
                type: "string", 
                description: "Optionele aangepaste boodschap toe te voegen aan de email" 
              },
              priority_fields: {
                type: "array",
                items: { type: "string" },
                description: "Optioneel: specifieke velden om prioriteit aan te geven (bijv. ['functie_niveau', 'werkvorm'])"
              }
            },
            required: ["application_id", "candidate_name", "candidate_email"]
          }
        }
      },
      // =====================================================
      // AI AGENT ACTIE TOOLS - Voert acties uit via orchestrator
      // =====================================================
      {
        type: "function",
        function: {
          name: "send_email",
          description: "Verstuur een email naar een kandidaat of klant. Gebruik dit wanneer de gebruiker vraagt om een email te sturen, follow-up te doen, of contact op te nemen. De AI genereert de email inhoud en verstuurt via n8n/Outlook.",
          parameters: {
            type: "object",
            properties: {
              recipient_email: {
                type: "string",
                description: "Email adres van de ontvanger"
              },
              recipient_name: {
                type: "string",
                description: "Naam van de ontvanger"
              },
              subject: {
                type: "string",
                description: "Onderwerp van de email"
              },
              email_type: {
                type: "string",
                enum: ["followup", "interview_confirmation", "document_request", "general", "reminder"],
                description: "Type email (bepaalt template en stijl)"
              },
              context: {
                type: "object",
                description: "Extra context voor email generatie (bijv. application_id, fields_to_ask, interview_details)",
                properties: {
                  application_id: { type: "string" },
                  fields_to_ask: { type: "array", items: { type: "string" } },
                  interview_date: { type: "string" },
                  interview_time: { type: "string" },
                  location: { type: "string" },
                  documents_needed: { type: "array", items: { type: "string" } }
                }
              }
            },
            required: ["recipient_email", "recipient_name", "subject", "email_type"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "schedule_interview",
          description: "Plan een interview afspraak in met een kandidaat. Creëert taak, stuurt bevestigingsmail, en maakt optioneel een kalender event aan.",
          parameters: {
            type: "object",
            properties: {
              application_id: {
                type: "string",
                description: "UUID van de sollicitatie"
              },
              candidate_email: {
                type: "string",
                description: "Email van de kandidaat"
              },
              candidate_name: {
                type: "string",
                description: "Naam van de kandidaat"
              },
              scheduled_at: {
                type: "string",
                description: "Datum en tijd in ISO format (bijv. 2025-12-10T14:00:00+01:00)"
              },
              duration_minutes: {
                type: "number",
                description: "Duur van interview in minuten (default: 30)",
                default: 30
              },
              location_type: {
                type: "string",
                enum: ["video", "kantoor", "telefoon"],
                description: "Type locatie"
              },
              location_details: {
                type: "string",
                description: "Adres of meeting link details"
              },
              send_confirmation: {
                type: "boolean",
                description: "Verstuur bevestigingsmail naar kandidaat",
                default: true
              },
              create_calendar_event: {
                type: "boolean",
                description: "Maak kalender event aan",
                default: true
              }
            },
            required: ["application_id", "candidate_email", "candidate_name", "scheduled_at", "location_type"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "request_documents",
          description: "Vraag documenten op bij een kandidaat (VOG, diploma's, certificaten, etc.). Verstuurt een vriendelijke email met instructies.",
          parameters: {
            type: "object",
            properties: {
              application_id: {
                type: "string",
                description: "UUID van de sollicitatie"
              },
              candidate_email: {
                type: "string",
                description: "Email van de kandidaat"
              },
              candidate_name: {
                type: "string",
                description: "Naam van de kandidaat"
              },
              documents: {
                type: "array",
                items: {
                  type: "string",
                  enum: ["VOG", "diploma", "BIG_registratie", "certificaten", "cv", "id_bewijs", "referenties", "anders"]
                },
                description: "Welke documenten worden gevraagd"
              },
              deadline_days: {
                type: "number",
                description: "Deadline in dagen (default: 7)",
                default: 7
              },
              urgent: {
                type: "boolean",
                description: "Is dit urgent?",
                default: false
              }
            },
            required: ["application_id", "candidate_email", "candidate_name", "documents"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_calendar_event",
          description: "Maak een kalender afspraak aan (los van interview). Stuurt uitnodiging via Outlook/Teams.",
          parameters: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "Titel van de afspraak"
              },
              start_time: {
                type: "string",
                description: "Start tijd in ISO format"
              },
              end_time: {
                type: "string",
                description: "Eind tijd in ISO format"
              },
              attendees: {
                type: "array",
                items: { type: "string" },
                description: "Email adressen van deelnemers"
              },
              location: {
                type: "string",
                description: "Locatie (adres of 'Microsoft Teams')"
              },
              description: {
                type: "string",
                description: "Beschrijving/agenda van de afspraak"
              },
              is_online_meeting: {
                type: "boolean",
                description: "Maak Teams meeting link aan",
                default: false
              }
            },
            required: ["title", "start_time", "end_time", "attendees"]
          }
        }
      }
    ];

    // Call Lovable AI Gateway for streaming with tool support
    // ⏱️ TIMEOUT INCREASED: 60s (was 30s)
    const AI_TIMEOUT_MS = 60000; // 60 seconden max (was 30s)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error('⏱️ AI call timeout after 60s');
      controller.abort();
    }, AI_TIMEOUT_MS);

    let response;
    try {
      const aiCallStart = Date.now();
      response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
          ],
          tools: tools,
          stream: true,
        }),
      });
      
      clearTimeout(timeoutId);
      console.log(`⏱️ AI Gateway responded in ${Date.now() - aiCallStart}ms`);
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('🚨 AI Gateway timeout - returning fallback response');
        return new Response(
          JSON.stringify({
            error: 'timeout',
            message: 'Het AI systeem reageert momenteel traag. Probeer het over enkele minuten opnieuw.',
            fallback: true
          }),
          {
            status: 504,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      
      throw error;
    }

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit bereikt, probeer het later opnieuw.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits op. Neem contact op met support.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      return new Response(JSON.stringify({ error: 'AI gateway fout' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Process the streaming response and handle tool calls
    const reader = response.body?.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        let toolCalls: any[] = [];
        let fullResponse = ""; // Collect complete AI response for usage tracking
        let declaredKnowledgeIds: string[] = []; // 🎯 NEW: Store explicitly declared knowledge IDs
        
        // 🔄 Retry loop state tracking
        let needsRetryWithNewKnowledge = false;
        let newKnowledgeMessage = "";
        let retryCount = 0;
        const MAX_RETRIES = 3;
        let noResultsAfterHarvest = false; // Track if harvester found 0 results after waiting
        
        try {
          while (true) {
            const { done, value } = await reader!.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.trim() || line.startsWith(":")) continue;
              if (!line.startsWith("data: ")) continue;

              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;

                // Handle tool calls
                if (delta?.tool_calls) {
                  for (const toolCall of delta.tool_calls) {
                    if (!toolCalls[toolCall.index]) {
                      toolCalls[toolCall.index] = {
                        id: toolCall.id,
                        type: toolCall.type,
                        function: { name: toolCall.function?.name || "", arguments: "" }
                      };
                    }
                    if (toolCall.function?.arguments) {
                      toolCalls[toolCall.index].function.arguments += toolCall.function.arguments;
                    }
                  }
                }

                // Stream regular content
                if (delta?.content) {
                  fullResponse += delta.content; // Collect for usage tracking
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                }

                // Check if we're done and have tool calls to execute
                if (parsed.choices?.[0]?.finish_reason === "tool_calls" && toolCalls.length > 0) {
                  
                  // 🚨 FALLBACK: Check if AI only did tool_calls without any content
                  if (!fullResponse.trim() && toolCalls.some(tc => tc.function.name === "verify_answer_confidence")) {
                    console.log("⚠️ AI only called verify_answer_confidence without content - sending nudge to generate answer");
                    
                    // Send a message to user explaining the issue
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                      choices: [{
                        delta: { content: "⚠️ De AI heeft alleen een confidence check uitgevoerd zonder antwoord te geven. Ik vraag om het volledige antwoord..." },
                        index: 0
                      }]
                    })}\n\n`));
                    
                    // Continue to next AI call with nudge prompt
                    // The retry logic below will handle this case
                    needsRetryWithNewKnowledge = true;
                    newKnowledgeMessage = "\n\n🔄 Ik probeer het opnieuw met een volledig antwoord...\n";
                  }
                  
                  // 🔒 TOOL CALL DEDUPLICATION: Track executed tools to prevent duplicates
                  const executedToolCalls = new Set<string>();
                  
                  const createToolCallKey = (functionName: string, args: any): string => {
                    // Create unique key from function name + normalized args
                    const normalizedArgs = JSON.stringify(args, Object.keys(args).sort());
                    return `${functionName}::${normalizedArgs}`;
                  };
                  
                  // Execute all tool calls
                  for (const toolCall of toolCalls) {
                    try {
                      const args = JSON.parse(toolCall.function.arguments);
                      
                      // 🚫 DEDUPLICATION CHECK: Skip if already executed
                      const toolCallKey = createToolCallKey(toolCall.function.name, args);
                      if (executedToolCalls.has(toolCallKey)) {
                        console.log(`⏭️ SKIPPED DUPLICATE: ${toolCall.function.name} with same args already executed`);
                        continue; // Skip this duplicate call
                      }
                      
                      // Mark as executed
                      executedToolCalls.add(toolCallKey);
                      console.log(`✅ EXECUTING: ${toolCall.function.name} (unique call #${executedToolCalls.size})`);
                      
                      let result;

                      switch (toolCall.function.name) {
                        case "create_task":
                          // Normalize priority (handle NORMAL -> MEDIUM mapping)
                          let normalizedPriority = (args.priority || "MEDIUM").toUpperCase();
                          if (normalizedPriority === "NORMAL") normalizedPriority = "MEDIUM";
                          if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(normalizedPriority)) {
                            normalizedPriority = "MEDIUM";
                          }

                          // Smart date defaults: if due_at is set but start_at isn't, set start_at to today
                          let startAt = args.start_at || null;
                          const dueAt = args.due_at || null;
                          
                          if (dueAt && !startAt) {
                            // If only due_at is provided, set start_at to now (for calendar visibility)
                            startAt = new Date().toISOString();
                          } else if (!dueAt && !startAt) {
                            // If neither is provided, set both to today (for "Mijn Dag" context)
                            const today = new Date();
                            startAt = today.toISOString();
                          }

                          const { data: newTask, error: createError } = await supabaseClient
                            .from("tasks")
                            .insert({
                              title: args.title,
                              description: args.description || null,
                              priority: normalizedPriority,
                              due_at: dueAt,
                              start_at: startAt,
                              project_id: args.project_id || null,
                              client_id: args.client_id || null,
                              assignee_id: args.assignee_id || null,
                              org_id: userOrgId,
                              reporter_id: user.id
                            })
                            .select()
                            .single();

                          if (createError) throw createError;
                          
                          const dateInfo = startAt ? ` (start: ${new Date(startAt).toLocaleString('nl-NL')})` : '';
                          result = { 
                            success: true, 
                            task_id: newTask.id, 
                            message: `✅ Taak "${args.title}" succesvol aangemaakt met ID ${newTask.sequence_number || newTask.id}${dateInfo}. Deze taak is nu zichtbaar in de kalender!` 
                          };
                          break;

                        case "update_task":
                          const updateData: any = {};
                          if (args.title) updateData.title = args.title;
                          if (args.description !== undefined) updateData.description = args.description;
                          
                          // Normalize priority
                          if (args.priority) {
                            let normalizedUpdatePriority = args.priority.toUpperCase();
                            if (normalizedUpdatePriority === "NORMAL") normalizedUpdatePriority = "MEDIUM";
                            if (["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(normalizedUpdatePriority)) {
                              updateData.priority = normalizedUpdatePriority;
                            }
                          }
                          
                          if (args.start_at !== undefined) updateData.start_at = args.start_at;
                          if (args.due_at !== undefined) updateData.due_at = args.due_at;
                          if (args.completed_at !== undefined) updateData.completed_at = args.completed_at;

                          const { data: updatedTask, error: updateError } = await supabaseClient
                            .from("tasks")
                            .update(updateData)
                            .eq("id", args.task_id)
                            .select()
                            .single();

                          if (updateError) throw updateError;
                          result = { success: true, task_id: updatedTask.id, message: `Taak "${updatedTask.title}" succesvol gewijzigd` };
                          break;

                        case "add_comment":
                          const { data: newComment, error: commentError } = await supabaseClient
                            .from("comments")
                            .insert({
                              task_id: args.task_id,
                              body: args.body,
                              author_id: user.id
                            })
                            .select()
                            .single();

                          if (commentError) throw commentError;
                          result = { success: true, comment_id: newComment.id, message: `Comment toegevoegd aan taak` };
                          break;

                        case "save_knowledge":
                          const { data: knowledge, error: knowledgeError } = await supabaseClient
                            .from("ai_knowledge_base")
                            .upsert({
                              user_id: user.id,
                              org_id: userOrgId,
                              category: args.category,
                              key: args.key,
                              value: args.value,
                              confidence_score: args.confidence_score || 1.0,
                              source: args.source || 'ai_conversation',
                              usage_count: 0,
                              last_used_at: new Date().toISOString()
                            }, {
                              onConflict: 'user_id,org_id,category,key'
                            })
                            .select()
                            .single();

                          if (knowledgeError) throw knowledgeError;
                          
                          // ✅ STAP 1: Direct embedding triggeren (geen afhankelijkheid van DB triggers)
                          console.log(`🔄 Triggering embedding generation for ${knowledge.id}...`);
                          supabaseClient.functions.invoke('generate-embedding', {
                            body: { knowledge_id: knowledge.id }
                          }).catch(err => console.warn('⚠️ Embedding trigger failed (will retry):', err));
                          
                          // ✅ FASE 3: Wait for embedding to be created
                          let embeddingReady = false;
                          let retries = 0;
                          const maxRetries = 10; // 5 seconds max (10 x 500ms)
                          
                          while (!embeddingReady && retries < maxRetries) {
                            await new Promise(r => setTimeout(r, 500)); // 0.5s wait
                            
                            const { data: embedding } = await supabaseClient
                              .from('knowledge_embeddings')
                              .select('id')
                              .eq('knowledge_id', knowledge.id)
                              .maybeSingle();
                            
                            if (embedding) {
                              embeddingReady = true;
                              console.log(`✅ [FASE 3] Embedding ready for ${args.key} after ${(retries + 1) * 0.5}s`);
                            }
                            retries++;
                          }
                          
                          if (!embeddingReady) {
                            console.warn(`⚠️ [FASE 3] Embedding not ready after ${maxRetries * 0.5}s for ${args.key} - will be available shortly`);
                          }
                          
                          result = { 
                            success: true, 
                            knowledge_id: knowledge.id, 
                            embedding_ready: embeddingReady,
                            message: `📚 Kennis opgeslagen: ${args.key} (${args.category})${embeddingReady ? ' ✅ direct beschikbaar' : ' ⏳ wordt verwerkt'}` 
                          };
                          break;

                        case "log_learning_event":
                          const { data: learningEvent, error: learningError } = await supabaseClient
                            .from("ai_learning_events")
                            .insert({
                              user_id: user.id,
                              org_id: userOrgId,
                              event_type: args.event_type,
                              context: args.context,
                              ai_response: args.ai_response || null,
                              user_action: args.user_action || null,
                              outcome: args.outcome,
                              learning_score: args.learning_score || 0.5,
                              applied_to_knowledge_base: false
                            })
                            .select()
                            .single();

                          if (learningError) throw learningError;
                          result = { 
                            success: true, 
                            event_id: learningEvent.id, 
                            message: `🎓 Leer event gelogd: ${args.event_type}` 
                          };
                          break;

                        case "create_business_intelligence":
                          const { data: biInsight, error: biError } = await supabaseClient
                            .from("business_intelligence")
                            .insert({
                              org_id: userOrgId,
                              intelligence_type: args.intelligence_type,
                              title: args.title,
                              description: args.description || null,
                              data: args.data,
                              priority: args.priority || 'medium',
                              impact_score: args.impact_score || 5.0,
                              status: 'active'
                            })
                            .select()
                            .single();

                          if (biError) throw biError;
                          result = { 
                            success: true, 
                            insight_id: biInsight.id, 
                            message: `💡 Business Intelligence insight gecreëerd: ${args.title}` 
                          };
                          break;

                        case "verify_answer_confidence":
                          const usedKnowledge = fullKnowledgeBase.filter((kb: any) => 
                            args.used_knowledge_ids.includes(kb.id)
                          );
                          
                          // Use semantic confidence calculation
                          const confidenceCalc = calculateSemanticConfidence(
                            lastUserMessage,
                            args.answer || '',
                            usedKnowledge.map(kb => ({
                              ...kb,
                              knowledge_id: kb.id,
                              similarity: kb.similarity || 0.8
                            }))
                          );
                          
                          result = {
                            success: true,
                            confidence: confidenceCalc.confidence,
                            confidence_percent: (confidenceCalc.confidence * 100).toFixed(0),
                            reasoning: confidenceCalc.reasoning,
                            gaps: confidenceCalc.gaps,
                            message: `📊 Confidence: ${(confidenceCalc.confidence * 100).toFixed(0)}%\n${confidenceCalc.reasoning}${confidenceCalc.gaps.length > 0 ? `\n⚠️ Gaps: ${confidenceCalc.gaps.join(', ')}` : ''}`
                          };
                          break;

                        // NOTE: auto_harvest_knowledge case verwijderd in Fase 16 - edge function auto-knowledge-harvester bestaat niet

                        case "query_professionals":
                          console.log("🔍 Executing database query for professionals...", args);
                          
                          // 🔧 FIX: Check BOTH org_id sources (professionals.org_id AND professional_applications.org_id)
                          // This ensures we find all professionals regardless of where org_id is set
                          
                          // Build base query with JOIN to applications for dual org_id check
                          let professionalsQuery = supabaseClient
                            .from('professionals')
                            .select(`
                              *,
                              professional_applications!inner(org_id)
                            `)
                            .is('deleted_at', null);
                          
                          // Apply filters
                          if (args.filter?.functie_niveau) {
                            professionalsQuery = professionalsQuery.eq('functie_niveau', args.filter.functie_niveau);
                          }
                          if (args.filter?.werkvorm) {
                            professionalsQuery = professionalsQuery.eq('werkvorm', args.filter.werkvorm);
                          }
                          if (args.filter?.regio) {
                            professionalsQuery = professionalsQuery.ilike('regio', `%${args.filter.regio}%`);
                          }
                          if (args.filter?.status) {
                            professionalsQuery = professionalsQuery.eq('status', args.filter.status);
                          }
                          if (args.filter?.has_auto !== undefined) {
                            professionalsQuery = professionalsQuery.eq('heeft_auto', args.filter.has_auto);
                          }
                          
                          const { data: professionalsRaw, error: professionalsError } = await professionalsQuery;
                          
                          if (professionalsError) throw professionalsError;
                          
                          // 🎯 Filter by bureau: check BOTH professionals.org_id AND professional_applications.org_id
                          let professionals = professionalsRaw || [];
                          if (args.filter?.bureau) {
                            const bureauOrgId = args.filter.bureau === 'ABCzorg' 
                              ? '550e8400-e29b-41d4-a716-446655440000'
                              : '650e8400-e29b-41d4-a716-446655440001';
                            
                            professionals = professionals.filter((p: any) => {
                              // Check professionals.org_id OR any linked application's org_id
                              const hasMatchingOrgId = p.org_id === bureauOrgId;
                              const hasMatchingApplicationOrgId = p.professional_applications?.some((pa: any) => pa.org_id === bureauOrgId);
                              return hasMatchingOrgId || hasMatchingApplicationOrgId;
                            });
                            
                            console.log(`🔍 Filtered by bureau ${args.filter.bureau}: ${professionals.length} professionals found`);
                          }
                          
                          result = {
                            success: true,
                            count: professionals.length,
                            professionals: professionals.map((p: any) => ({
                              id: p.id,
                              full_name: p.full_name,
                              functie_niveau: p.functie_niveau,
                              werkvorm: p.werkvorm,
                              regio: p.regio,
                              status: p.status,
                              heeft_auto: p.heeft_auto,
                              heeft_rijbewijs: p.heeft_rijbewijs,
                              skills: p.skills,
                              rating: p.rating,
                              email: p.email,
                              telefoonnummer: p.telefoonnummer,
                              org_id: p.org_id
                            })),
                            message: `✅ ${professionals.length} professional${professionals.length !== 1 ? 's' : ''} gevonden${args.filter?.bureau ? ` bij ${args.filter.bureau}` : ''}`
                          };
                          break;

                        case "query_tasks":
                          console.log("🔍 Executing database query for tasks...", args);
                          
                          // Build query with dynamic select
                          const selectFields = [
                            'id', 'title', 'description', 'priority', 'status',
                            'due_at', 'start_at', 'completed_at', 'created_at',
                            'assignee_id', 'revenue_impact_eur', 'estimate_min'
                          ];
                          
                          let selectString = selectFields.join(', ');
                          
                          if (args.include?.includes('subtasks')) {
                            selectString += ', subtasks(id, title, status, order)';
                          }
                          if (args.include?.includes('time_entries')) {
                            selectString += ', time_entries(id, start, end, duration_min)';
                          }
                          if (args.include?.includes('comments')) {
                            selectString += ', comments(id, body, created_at, author_id)';
                          }
                          if (args.include?.includes('assignee')) {
                            selectString += ', profiles:assignee_id(id, name, email)';
                          }
                          
                          let tasksQuery = supabaseClient
                            .from('tasks')
                            .select(selectString);
                          
                          // Apply filters
                          if (args.filter?.completed !== undefined) {
                            if (args.filter.completed) {
                              tasksQuery = tasksQuery.not('completed_at', 'is', null);
                            } else {
                              tasksQuery = tasksQuery.is('completed_at', null);
                            }
                          }
                          
                          if (args.filter?.assignee_id) {
                            tasksQuery = tasksQuery.eq('assignee_id', args.filter.assignee_id);
                          }
                          
                          if (args.filter?.priority) {
                            tasksQuery = tasksQuery.eq('priority', args.filter.priority);
                          }
                          
                          if (args.filter?.date_range) {
                            const dateField = args.filter.completed ? 'completed_at' : 'created_at';
                            tasksQuery = tasksQuery
                              .gte(dateField, args.filter.date_range.start)
                              .lte(dateField, args.filter.date_range.end);
                          }
                          
                          tasksQuery = tasksQuery
                            .is('deleted_at', null)
                            .order('completed_at', { ascending: false, nullsFirst: false })
                            .limit(args.limit || 50);
                          
                          const { data: queriedTasks, error: queryError } = await tasksQuery;
                          
                          if (queryError) {
                            console.error('❌ Task query error:', queryError);
                            result = {
                              success: false,
                              message: `❌ Database query mislukt: ${queryError.message}`
                            };
                            break;
                          }
                          
                          // Enrich tasks with calculated fields
                          const enrichedTasks = queriedTasks?.map((task: any) => {
                            const timeEntries = task.time_entries || [];
                            const totalMinutes = timeEntries.reduce((sum: number, entry: any) => {
                              if (entry.duration_min) return sum + entry.duration_min;
                              if (entry.start && entry.end) {
                                const duration = (new Date(entry.end).getTime() - new Date(entry.start).getTime()) / 60000;
                                return sum + duration;
                              }
                              return sum;
                            }, 0);
                            
                            const totalHours = (totalMinutes / 60).toFixed(1);
                            
                            const onTime = task.due_at && task.completed_at
                              ? new Date(task.completed_at) <= new Date(task.due_at)
                              : task.due_at ? false : true;
                            
                            const daysLate = task.due_at && task.completed_at && !onTime
                              ? Math.ceil((new Date(task.completed_at).getTime() - new Date(task.due_at).getTime()) / (1000 * 60 * 60 * 24))
                              : 0;
                            
                            return {
                              id: task.id,
                              title: task.title,
                              priority: task.priority,
                              completed_at: task.completed_at,
                              due_at: task.due_at,
                              assignee_name: task.profiles?.name || 'Niet toegewezen',
                              assignee_email: task.profiles?.email || null,
                              total_hours_worked: totalHours,
                              on_time: onTime,
                              days_late: daysLate,
                              subtasks_count: task.subtasks?.length || 0,
                              comments_count: task.comments?.length || 0
                            };
                          }) || [];
                          
                          console.log(`✅ Query results: ${enrichedTasks.length} taken gevonden`);
                          
                          // Calculate summary stats
                          const onTimeTasks = enrichedTasks.filter((t: any) => t.on_time);
                          const lateTasks = enrichedTasks.filter((t: any) => !t.on_time && t.due_at);
                          
                          // Format detailed task list
                          const formattedTasks = enrichedTasks.map((task: any, i: number) => {
                            const statusIcon = task.on_time ? '✅' : (task.due_at ? '⚠️' : '⏱️');
                            const lateInfo = !task.on_time && task.days_late > 0 ? ` (${task.days_late}d te laat)` : '';
                            const completedDate = task.completed_at 
                              ? new Date(task.completed_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
                              : 'Niet afgerond';
                            
                            return `${i + 1}. **${task.title}** (${task.priority})\n` +
                              `   └ Afgerond: ${completedDate}${lateInfo}\n` +
                              `   └ Door: ${task.assignee_name}\n` +
                              `   └ Tijd besteed: ${task.total_hours_worked}u ${statusIcon}`;
                          }).join('\n\n');
                          
                          const summaryHeader = `📊 **${enrichedTasks.length} taken gevonden** - ${onTimeTasks.length} tijdig, ${lateTasks.length} te laat`;
                          const detailedMessage = enrichedTasks.length > 0 
                            ? `${summaryHeader}\n\n${formattedTasks}`
                            : `${summaryHeader}\n\nℹ️ Geen taken gevonden met deze filters.`;
                          
                          result = {
                            success: true,
                            tasks: enrichedTasks,
                            summary: {
                              total: enrichedTasks.length,
                              on_time: onTimeTasks.length,
                              late: lateTasks.length,
                              on_time_percentage: enrichedTasks.length > 0 
                                ? ((onTimeTasks.length / enrichedTasks.length) * 100).toFixed(1) 
                                : '0'
                            },
                            message: detailedMessage
                          };
                          break;

                        case "search_professionals":
                          const { functie, regio, vanaf_datum, tot_datum, aantal = 10 } = args;
                          
                          console.log("🔍 Searching professionals:", { functie, regio, vanaf_datum, tot_datum, aantal });

                          // Call talent-search function
                          const { data: searchData, error: searchError } = await supabaseClient.functions.invoke('talent-search', {
                            body: { functie, regio, vanaf_datum, tot_datum, aantal }
                          });

                          if (searchError) {
                            console.error("Search error:", searchError);
                            result = { 
                              success: false, 
                              message: `❌ Fout bij zoeken professionals: ${searchError.message}` 
                            };
                          } else if (!searchData.professionals || searchData.professionals.length === 0) {
                            result = { 
                              success: false, 
                              message: `ℹ️ Geen professionals gevonden met deze filters. Probeer filters te verruimen of voeg eerst professionals toe via de Professionals pagina.` 
                            };
                          } else {
                            const profList = searchData.professionals
                              .map((p: any, i: number) => 
                                `${i + 1}. **${p.full_name}** - ${p.functie_niveau}${p.regio ? ` (${p.regio})` : ''}${p.rating ? ` ⭐ ${p.rating.toFixed(1)}` : ''}`
                              )
                              .join('\n');
                            
                            const filterInfo = [];
                            if (functie) filterInfo.push(`functie: ${functie}`);
                            if (regio) filterInfo.push(`regio: ${regio}`);
                            if (vanaf_datum) filterInfo.push(`vanaf: ${vanaf_datum}`);
                            if (tot_datum) filterInfo.push(`tot: ${tot_datum}`);
                            
                            result = { 
                              success: true, 
                              message: `✅ ${searchData.total_found} professionals gevonden${filterInfo.length > 0 ? ` (${filterInfo.join(', ')})` : ''}:\n\n${profList}` 
                            };
                          }
                          break;

                        case "query_clients":
                          console.log("🔍 Querying clients (full hierarchy)...", args);
                          
                          // Query the FULL hierarchy: organizations → locations → sublocations
                          let orgQuery = supabaseClient
                            .from('client_organizations')
                            .select(`
                              id, name, org_id, kvk_nummer, btw_nummer, website,
                              locations:client_locations(
                                id, naam, telefoon, contactpersoon_naam, contactpersoon_email, factuur_email, plaats, adres, postcode,
                                sublocations:client_sublocations(
                                  id, naam, telefoon, adres, postcode, plaats, sector, doelgroep, gezochte_functies, is_active
                                )
                              )
                            `);
                          
                          // Apply filters
                          if (args.filter) {
                            if (args.filter.organization_name) {
                              orgQuery = orgQuery.ilike('name', `%${args.filter.organization_name}%`);
                            }
                            
                            if (args.filter.bureau) {
                              const bureauOrgId = args.filter.bureau === "ABCzorg" 
                                ? "550e8400-e29b-41d4-a716-446655440000"
                                : "650e8400-e29b-41d4-a716-446655440001";
                              orgQuery = orgQuery.eq('org_id', bureauOrgId);
                            }
                          }
                          
                          // Limit organizations
                          const orgLimit = args.limit || 15;
                          orgQuery = orgQuery.order('name', { ascending: true }).limit(orgLimit);
                          
                          const { data: orgsData, error: orgsError } = await orgQuery;
                          
                          if (orgsError) {
                            console.error("Client hierarchy query error:", orgsError);
                            result = {
                              success: false,
                              message: `❌ Fout bij ophalen klanten: ${orgsError.message}`
                            };
                          } else if (!orgsData || orgsData.length === 0) {
                            result = {
                              success: true,
                              organizations: [],
                              message: `ℹ️ Geen organisaties gevonden. Probeer met een andere zoekterm.`
                            };
                          } else {
                            // Post-filter on sublocation criteria if specified
                            let filteredOrgs = orgsData;
                            
                            if (args.filter?.sublocation_name || args.filter?.plaats || args.filter?.sector) {
                              filteredOrgs = orgsData.map((org: any) => {
                                const filteredLocations = (org.locations || []).map((loc: any) => {
                                  let subs = loc.sublocations || [];
                                  
                                  if (args.filter?.sublocation_name) {
                                    subs = subs.filter((s: any) => 
                                      s.naam?.toLowerCase().includes(args.filter.sublocation_name.toLowerCase())
                                    );
                                  }
                                  if (args.filter?.plaats) {
                                    subs = subs.filter((s: any) => 
                                      s.plaats?.toLowerCase().includes(args.filter.plaats.toLowerCase()) ||
                                      loc.plaats?.toLowerCase().includes(args.filter.plaats.toLowerCase())
                                    );
                                  }
                                  if (args.filter?.sector) {
                                    subs = subs.filter((s: any) => 
                                      s.sector?.some((sec: string) => sec.toLowerCase().includes(args.filter.sector.toLowerCase()))
                                    );
                                  }
                                  if (args.filter?.is_active !== undefined) {
                                    subs = subs.filter((s: any) => s.is_active === args.filter.is_active);
                                  }
                                  
                                  return { ...loc, sublocations: subs };
                                }).filter((loc: any) => loc.sublocations.length > 0);
                                
                                return { ...org, locations: filteredLocations };
                              }).filter((org: any) => org.locations.length > 0);
                            }
                            
                            // Format output with full hierarchy
                            const includePhone = args.include?.includes('telefoon') !== false; // default true
                            const includeAddress = args.include?.includes('adres');
                            const includeContact = args.include?.includes('contactpersoon');
                            const includeSublocations = args.include?.includes('sublocaties') !== false; // default true
                            const includeSector = args.include?.includes('sector');
                            const includeDoelgroep = args.include?.includes('doelgroep');
                            
                            let totalSublocations = 0;
                            let totalPhones = 0;
                            
                            const orgList = filteredOrgs.map((org: any, i: number) => {
                              const bureau = org.org_id === "550e8400-e29b-41d4-a716-446655440000" ? "ABCzorg" : 
                                             org.org_id === "650e8400-e29b-41d4-a716-446655440001" ? "CitoZorg" : "Onbekend";
                              
                              let output = `${i + 1}. **${org.name}** (${bureau})`;
                              if (org.kvk_nummer) output += `\n   KvK: ${org.kvk_nummer}`;
                              if (org.website) output += ` | Website: ${org.website}`;
                              
                              // Process locations and sublocations
                              const locations = org.locations || [];
                              locations.forEach((loc: any) => {
                                const locPhone = loc.telefoon ? ` - Tel: ${loc.telefoon}` : '';
                                if (loc.telefoon) totalPhones++;
                                
                                output += `\n   📍 **${loc.naam}**${loc.plaats ? ` (${loc.plaats})` : ''}${includePhone ? locPhone : ''}`;
                                
                                if (includeContact && loc.contactpersoon_naam) {
                                  output += `\n      Contact: ${loc.contactpersoon_naam}${loc.contactpersoon_email ? ` <${loc.contactpersoon_email}>` : ''}`;
                                }
                                
                                if (includeSublocations && loc.sublocations?.length > 0) {
                                  const sublocs = loc.sublocations.slice(0, 10); // Max 10 per location
                                  const moreCount = loc.sublocations.length - sublocs.length;
                                  
                                  sublocs.forEach((sub: any) => {
                                    totalSublocations++;
                                    const subPhone = sub.telefoon ? ` - 📞 ${sub.telefoon}` : '';
                                    if (sub.telefoon) totalPhones++;
                                    
                                    let subLine = `\n      └─ ${sub.naam}`;
                                    if (sub.plaats) subLine += `, ${sub.plaats}`;
                                    if (includePhone && sub.telefoon) subLine += subPhone;
                                    if (includeAddress && sub.adres) subLine += `\n         Adres: ${sub.adres}, ${sub.postcode || ''} ${sub.plaats || ''}`;
                                    if (includeSector && sub.sector?.length > 0) subLine += ` [${sub.sector.join(', ')}]`;
                                    if (includeDoelgroep && sub.doelgroep?.length > 0) subLine += ` (${sub.doelgroep.join(', ')})`;
                                    
                                    output += subLine;
                                  });
                                  
                                  if (moreCount > 0) {
                                    output += `\n      └─ ... en ${moreCount} meer sublocaties`;
                                  }
                                }
                              });
                              
                              return output;
                            }).join('\n\n');
                            
                            const summary = `📊 **${filteredOrgs.length} organisaties** gevonden met **${totalSublocations} werklocaties** en **${totalPhones} telefoonnummers**`;
                            
                            result = {
                              success: true,
                              organizations: filteredOrgs.map((org: any) => ({
                                id: org.id,
                                name: org.name,
                                bureau: org.org_id === "550e8400-e29b-41d4-a716-446655440000" ? "ABCzorg" : "CitoZorg",
                                kvk_nummer: org.kvk_nummer,
                                website: org.website,
                                locations: (org.locations || []).map((loc: any) => ({
                                  id: loc.id,
                                  naam: loc.naam,
                                  telefoon: loc.telefoon,
                                  plaats: loc.plaats,
                                  contactpersoon: loc.contactpersoon_naam,
                                  sublocations: (loc.sublocations || []).map((sub: any) => ({
                                    id: sub.id,
                                    naam: sub.naam,
                                    telefoon: sub.telefoon,
                                    adres: sub.adres,
                                    plaats: sub.plaats,
                                    sector: sub.sector,
                                    doelgroep: sub.doelgroep
                                  }))
                                }))
                              })),
                              summary: {
                                total_organizations: filteredOrgs.length,
                                total_sublocations: totalSublocations,
                                total_phones: totalPhones
                              },
                              message: `${summary}\n\n${orgList}\n\n💡 **Tip:** Vraag naar een specifieke organisatie (bijv. "telefoonnummer Prisma") voor gedetailleerde contactinfo.`
                            };
                          }
                          break;

                        case "query_sublocations":
                          console.log("🔍 Querying sublocations directly...", args);
                          
                          // ⚡ FAST COUNT PATH: No data retrieval needed
                          if (args.count_only === true) {
                            console.log("⚡ [COUNT_ONLY] Fast count query - no data retrieval");
                            const countStart = Date.now();
                            
                            let countQuery = supabaseClient
                              .from('client_sublocations')
                              .select('id', { count: 'exact', head: true });
                            
                            // Apply same filters as regular query
                            if (args.filter) {
                              if (args.filter.plaats) {
                                countQuery = countQuery.ilike('plaats', `%${args.filter.plaats}%`);
                              }
                              if (args.filter.sector) {
                                countQuery = countQuery.contains('sector', [args.filter.sector]);
                              }
                              if (args.filter.doelgroep) {
                                countQuery = countQuery.contains('doelgroep', [args.filter.doelgroep]);
                              }
                              if (args.filter.is_active !== undefined) {
                                countQuery = countQuery.eq('is_active', args.filter.is_active);
                              } else {
                                countQuery = countQuery.eq('is_active', true);
                              }
                            } else {
                              countQuery = countQuery.eq('is_active', true);
                            }
                            
                            const { count: sublocCount, error: countError } = await countQuery;
                            const countDuration = Date.now() - countStart;
                            
                            if (countError) {
                              console.error("Count query error:", countError);
                              result = {
                                success: false,
                                message: `❌ Fout bij tellen werklocaties: ${countError.message}`
                              };
                            } else {
                              console.log(`⚡ [COUNT_ONLY] ${sublocCount} items in ${countDuration}ms`);
                              result = {
                                success: true,
                                total_count: sublocCount,
                                query_time_ms: countDuration,
                                message: `📍 Er zijn **${sublocCount}** ${args.filter?.is_active === false ? 'inactieve' : 'actieve'} werklocaties${args.filter?.plaats ? ` in ${args.filter.plaats}` : ''}${args.filter?.sector ? ` (sector: ${args.filter.sector})` : ''} in het systeem.`
                              };
                            }
                            break;
                          }
                          
                          // Regular query with full data retrieval
                          let sublocQuery = supabaseClient
                            .from('client_sublocations')
                            .select(`
                              id, naam, telefoon, adres, postcode, plaats, sector, doelgroep, gezochte_functies, is_active,
                              location:client_locations!inner(
                                id, naam, telefoon, plaats,
                                organization:client_organizations!inner(id, name, org_id)
                              )
                            `);
                          
                          // Apply filters
                          if (args.filter) {
                            if (args.filter.naam) {
                              sublocQuery = sublocQuery.ilike('naam', `%${args.filter.naam}%`);
                            }
                            if (args.filter.plaats) {
                              sublocQuery = sublocQuery.ilike('plaats', `%${args.filter.plaats}%`);
                            }
                            if (args.filter.sector) {
                              sublocQuery = sublocQuery.contains('sector', [args.filter.sector]);
                            }
                            if (args.filter.doelgroep) {
                              sublocQuery = sublocQuery.contains('doelgroep', [args.filter.doelgroep]);
                            }
                            if (args.filter.is_active !== undefined) {
                              sublocQuery = sublocQuery.eq('is_active', args.filter.is_active);
                            } else {
                              // Default to active only
                              sublocQuery = sublocQuery.eq('is_active', true);
                            }
                            if (args.filter.bureau) {
                              const bureauOrgId = args.filter.bureau === "ABCzorg" 
                                ? "550e8400-e29b-41d4-a716-446655440000"
                                : "650e8400-e29b-41d4-a716-446655440001";
                              sublocQuery = sublocQuery.eq('location.organization.org_id', bureauOrgId);
                            }
                          } else {
                            // Default to active only
                            sublocQuery = sublocQuery.eq('is_active', true);
                          }
                          
                          const subLimit = args.limit || 25;
                          sublocQuery = sublocQuery.order('naam', { ascending: true }).limit(subLimit);
                          
                          const { data: sublocsData, error: sublocsError } = await sublocQuery;
                          
                          if (sublocsError) {
                            console.error("Sublocations query error:", sublocsError);
                            result = {
                              success: false,
                              message: `❌ Fout bij ophalen werklocaties: ${sublocsError.message}`
                            };
                          } else if (!sublocsData || sublocsData.length === 0) {
                            result = {
                              success: true,
                              sublocations: [],
                              message: `ℹ️ Geen werklocaties gevonden met deze zoekcriteria.`
                            };
                          } else {
                            // Format output
                            const includePhone = args.include?.includes('telefoon') !== false;
                            const includeAddress = args.include?.includes('adres');
                            const includeSector = args.include?.includes('sector');
                            const includeDoelgroep = args.include?.includes('doelgroep');
                            const includeOrg = args.include?.includes('organisatie');
                            const includeFuncties = args.include?.includes('gezochte_functies');
                            
                            const sublocList = sublocsData.map((sub: any, i: number) => {
                              const org = sub.location?.organization;
                              const bureau = org?.org_id === "550e8400-e29b-41d4-a716-446655440000" ? "ABCzorg" : 
                                             org?.org_id === "650e8400-e29b-41d4-a716-446655440001" ? "CitoZorg" : "";
                              
                              let line = `${i + 1}. **${sub.naam}**`;
                              if (sub.plaats) line += ` (${sub.plaats})`;
                              if (includePhone && sub.telefoon) line += ` - 📞 ${sub.telefoon}`;
                              
                              if (includeOrg && org) {
                                line += `\n   └─ Organisatie: ${org.name}${bureau ? ` [${bureau}]` : ''}`;
                              }
                              if (includeAddress && sub.adres) {
                                line += `\n   └─ Adres: ${sub.adres}, ${sub.postcode || ''} ${sub.plaats || ''}`;
                              }
                              if (includeSector && sub.sector?.length > 0) {
                                line += `\n   └─ Sector: ${sub.sector.join(', ')}`;
                              }
                              if (includeDoelgroep && sub.doelgroep?.length > 0) {
                                line += `\n   └─ Doelgroep: ${sub.doelgroep.join(', ')}`;
                              }
                              if (includeFuncties && sub.gezochte_functies?.length > 0) {
                                line += `\n   └─ Gezochte functies: ${sub.gezochte_functies.join(', ')}`;
                              }
                              
                              return line;
                            }).join('\n\n');
                            
                            const phonesFound = sublocsData.filter((s: any) => s.telefoon).length;
                            const summary = `📍 **${sublocsData.length} werklocaties** gevonden (${phonesFound} met telefoonnummer)`;
                            
                            result = {
                              success: true,
                              sublocations: sublocsData.map((sub: any) => ({
                                id: sub.id,
                                naam: sub.naam,
                                telefoon: sub.telefoon,
                                adres: sub.adres,
                                postcode: sub.postcode,
                                plaats: sub.plaats,
                                sector: sub.sector,
                                doelgroep: sub.doelgroep,
                                gezochte_functies: sub.gezochte_functies,
                                organization: sub.location?.organization?.name,
                                bureau: sub.location?.organization?.org_id === "550e8400-e29b-41d4-a716-446655440000" ? "ABCzorg" : "CitoZorg"
                              })),
                              summary: {
                                total: sublocsData.length,
                                with_phone: phonesFound
                              },
                              message: `${summary}\n\n${sublocList}`
                            };
                          }
                          break;

                        case "query_applications":
                          console.log("🔍 Querying applications...", args);
                          
                          let appQuery = supabaseClient
                            .from('professional_applications')
                            .select(`
                              *,
                              professional:professionals(id, full_name, functie_niveau, regio, skills, status)
                            `)
                            .is('deleted_at', null);
                          
                          // Apply filters
                          if (args.filter) {
                            if (args.filter.pipeline_stage) {
                              appQuery = appQuery.eq('pipeline_stage', args.filter.pipeline_stage);
                            }
                            if (args.filter.status) {
                              appQuery = appQuery.eq('status', args.filter.status);
                            }
                            if (args.filter.completeness_min !== undefined) {
                              appQuery = appQuery.gte('completeness_score', args.filter.completeness_min);
                            }
                            if (args.filter.date_range) {
                              if (args.filter.date_range.start) {
                                appQuery = appQuery.gte('created_at', args.filter.date_range.start);
                              }
                              if (args.filter.date_range.end) {
                                appQuery = appQuery.lte('created_at', args.filter.date_range.end);
                              }
                            }
                            if (args.filter.functie_niveau) {
                              appQuery = appQuery.eq('extracted_data->>functie_niveau', args.filter.functie_niveau);
                            }
                            if (args.filter.werkvorm) {
                              appQuery = appQuery.eq('extracted_data->>werkvorm', args.filter.werkvorm);
                            }
                            if (args.filter.assigned_organization) {
                              // ✅ FIX: Lookup org_id via organizations table instead of JSONB field
                              const { data: orgData } = await supabaseClient
                                .from('organizations')
                                .select('id')
                                .eq('name', args.filter.assigned_organization)
                                .single();
                              
                              if (orgData) {
                                appQuery = appQuery.eq('org_id', orgData.id);
                              }
                            }
                            if (args.filter.regio) {
                              appQuery = appQuery.ilike('extracted_data->>regio', `%${args.filter.regio}%`);
                            }
                          }
                          
                          appQuery = appQuery
                            .order('created_at', { ascending: false })
                            .limit(args.limit || 50);
                          
                          const { data: applications, error: appError } = await appQuery;
                          
                          if (appError) {
                            console.error("Applications query error:", appError);
                            result = {
                              success: false,
                              message: `❌ Fout bij ophalen sollicitaties: ${appError.message}`
                            };
                          } else {
                            const appList = applications
                              ?.map((app: any, i: number) => {
                                const data = app.extracted_data || {};
                                const completeness = app.completeness_score ? `${Math.round(app.completeness_score)}%` : 'n/a';
                                const stage = app.pipeline_stage || app.status;
                                const naam = data.naam || app.email_from || 'Onbekend';
                                const functie = data.functie_niveau || 'n/a';
                                const werkvorm = data.werkvorm || 'n/a';
                                const organisatie = app.org_id === "550e8400-e29b-41d4-a716-446655440000" ? "ABCzorg" :
                                                    app.org_id === "650e8400-e29b-41d4-a716-446655440001" ? "CitoZorg" : 
                                                    "Niet toegewezen";
                                const regio = data.regio || 'n/a';
                                
                                return `${i + 1}. **${naam}** (${functie})
   ├─ Fase: ${stage} | Completeness: ${completeness}
   ├─ Werkvorm: ${werkvorm} | Organisatie: ${organisatie}
   └─ Regio: ${regio}`;
                              })
                              .join('\n\n') || 'Geen sollicitaties gevonden';
                            
                            // Calculate summary stats
                            const byStage = applications?.reduce((acc: any, app: any) => {
                              const stage = app.pipeline_stage || 'onbekend';
                              acc[stage] = (acc[stage] || 0) + 1;
                              return acc;
                            }, {});
                            
                            const avgCompleteness = applications?.length 
                              ? (applications.reduce((sum: number, app: any) => sum + (app.completeness_score || 0), 0) / applications.length).toFixed(1)
                              : 0;
                            
                            const summary = `📊 **Samenvatting**: ${applications?.length || 0} sollicitaties gevonden\n` +
                              `├─ Gem. completeness: ${avgCompleteness}%\n` +
                              `└─ Per fase: ${Object.entries(byStage || {}).map(([stage, count]) => `${stage}: ${count}`).join(', ')}`;
                            
                            result = {
                              success: true,
                              message: `${summary}\n\n${appList}`,
                              applications: applications
                            };
                          }
                          break;

                        case "query_professional_matches":
                          console.log("🔍 Querying professional matches...", args);
                          
                          let matchQuery = supabaseClient
                            .from('professional_client_matches')
                            .select(`
                              *,
                              professional:professionals(id, full_name, functie_niveau, regio, skills),
                              client:clients(id, name, company)
                            `);
                          
                          // Apply filters
                          if (args.filter) {
                            if (args.filter.professional_id) {
                              matchQuery = matchQuery.eq('professional_id', args.filter.professional_id);
                            }
                            if (args.filter.client_id) {
                              matchQuery = matchQuery.eq('client_id', args.filter.client_id);
                            }
                            if (args.filter.status) {
                              matchQuery = matchQuery.eq('status', args.filter.status);
                            }
                            if (args.filter.min_score !== undefined) {
                              matchQuery = matchQuery.gte('match_score', args.filter.min_score);
                            }
                          }
                          
                          matchQuery = matchQuery
                            .order('match_score', { ascending: false })
                            .limit(args.limit || 20);
                          
                          const { data: matches, error: matchError } = await matchQuery;
                          
                          if (matchError) {
                            console.error("Matches query error:", matchError);
                            result = {
                              success: false,
                              message: `❌ Fout bij ophalen matches: ${matchError.message}`
                            };
                          } else {
                            const matchList = matches
                              ?.map((match: any, i: number) => {
                                const score = match.match_score ? `${Math.round(match.match_score)}%` : 'n/a';
                                const profName = match.professional?.full_name || 'Onbekend';
                                const clientName = match.client?.name || 'Onbekend';
                                return `${i + 1}. ${profName} ↔️ ${clientName} - Score: ${score} (${match.status})`;
                              })
                              .join('\n') || 'Geen matches gevonden';
                            
                            const avgScore = matches?.length
                              ? (matches.reduce((sum: number, m: any) => sum + (m.match_score || 0), 0) / matches.length).toFixed(1)
                              : 0;
                            
                            const byStatus = matches?.reduce((acc: any, m: any) => {
                              acc[m.status] = (acc[m.status] || 0) + 1;
                              return acc;
                            }, {});
                            
                            const summary = `📊 **Samenvatting**: ${matches?.length || 0} matches gevonden\n` +
                              `├─ Gem. score: ${avgScore}%\n` +
                              `└─ Per status: ${Object.entries(byStatus || {}).map(([status, count]) => `${status}: ${count}`).join(', ')}`;
                            
                            result = {
                              success: true,
                              message: `${summary}\n\n${matchList}`,
                              matches: matches
                            };
                          }
                          break;

                        case "suggest_placements":
                          console.log("🤖 Generating AI placement suggestions...", args);
                          
                          // Query available professionals
                          const profFilter: any = { status: 'actief' };
                          if (args.professional_id) {
                            profFilter.id = args.professional_id;
                          }
                          if (args.criteria?.functie_niveau) {
                            profFilter.functie_niveau = args.criteria.functie_niveau;
                          }
                          
                          const { data: availableProfs, error: profError } = await supabaseClient
                            .from('professionals')
                            .select('*')
                            .match(profFilter)
                            .limit(50);
                          
                          if (profError || !availableProfs?.length) {
                            result = {
                              success: false,
                              message: `❌ Geen beschikbare professionals gevonden${profError ? `: ${profError.message}` : ''}`
                            };
                            break;
                          }
                          
                          // Query active sublocations (werklocaties) from hierarchy
                          let sublocationQuery = supabaseClient
                            .from('client_sublocations')
                            .select(`
                              id, naam, sector, doelgroep, gezochte_functies, plaats, is_active,
                              location:client_locations!inner(
                                id, naam,
                                organization:client_organizations!inner(id, name, org_id)
                              )
                            `)
                            .eq('is_active', true);
                          
                          if (args.client_id) {
                            sublocationQuery = sublocationQuery.eq('id', args.client_id);
                          }
                          
                          const { data: sublocations, error: clientError } = await sublocationQuery.limit(50);
                          
                          if (clientError || !sublocations?.length) {
                            result = {
                              success: false,
                              message: `❌ Geen actieve werklocaties gevonden${clientError ? `: ${clientError.message}` : ''}`
                            };
                            break;
                          }
                          
                          // Map sublocations to client format for matching
                          const activeClients = sublocations.map((sub: any) => ({
                            id: sub.id,
                            name: sub.naam,
                            company: sub.location?.organization?.name || '',
                            sector: sub.sector,
                            doelgroep: sub.doelgroep,
                            gezochte_functies: sub.gezochte_functies,
                            plaats: sub.plaats,
                            org_id: sub.location?.organization?.org_id
                          }));
                          
                          // Calculate match scores (weighted criteria)
                          const WEIGHTS = {
                            functie_niveau: 0.25,
                            regio: 0.20,
                            skills: 0.25,
                            beschikbaarheid: 0.15,
                            tarief: 0.15
                          };
                          
                          const suggestions = [];
                          const minScore = args.criteria?.min_match_score || 70;
                          
                          for (const prof of availableProfs) {
                            for (const client of activeClients) {
                              let totalScore = 0;
                              const reasoning: any = {};
                              
                              // Functie niveau match (exact or higher)
                              const niveaus = ['Helpende 2', 'VIG', 'VP3', 'VP4', 'HBO-V'];
                              const profNiveau = niveaus.indexOf(prof.functie_niveau);
                              // Assume client needs same or lower niveau
                              const functieScore = profNiveau >= 0 ? 100 : 0;
                              totalScore += functieScore * WEIGHTS.functie_niveau;
                              reasoning.functie_niveau = { score: functieScore, weight: WEIGHTS.functie_niveau };
                              
                              // Regio match
                              const regioScore = prof.regio && client.name?.toLowerCase().includes(prof.regio.toLowerCase()) ? 100 : 50;
                              totalScore += regioScore * WEIGHTS.regio;
                              reasoning.regio = { score: regioScore, weight: WEIGHTS.regio };
                              
                              // Skills match (placeholder - would need client skill requirements)
                              const skillsScore = prof.skills?.length ? 80 : 60;
                              totalScore += skillsScore * WEIGHTS.skills;
                              reasoning.skills = { score: skillsScore, weight: WEIGHTS.skills };
                              
                              // Beschikbaarheid (placeholder)
                              const beschikScore = 80;
                              totalScore += beschikScore * WEIGHTS.beschikbaarheid;
                              reasoning.beschikbaarheid = { score: beschikScore, weight: WEIGHTS.beschikbaarheid };
                              
                              // Tarief compatibiliteit (vaste score zonder revenue_per_hour in sublocations)
                              const tariefScore = prof.gewenst_uurloon ? 80 : 70;
                              totalScore += tariefScore * WEIGHTS.tarief;
                              reasoning.tarief = { score: tariefScore, weight: WEIGHTS.tarief };
                              
                              if (totalScore >= minScore) {
                                suggestions.push({
                                  professional_id: prof.id,
                                  client_id: client.id,
                                  match_score: Math.round(totalScore),
                                  match_reasoning: reasoning,
                                  professional_name: prof.full_name,
                                  client_name: client.name,
                                  org_id: userOrgId,
                                  status: 'suggested'
                                });
                              }
                            }
                          }
                          
                          // Sort by score
                          suggestions.sort((a, b) => b.match_score - a.match_score);
                          
                          // Save suggestions if requested
                          if (args.save_suggestions !== false && suggestions.length > 0) {
                            const { error: saveError } = await supabaseClient
                              .from('professional_client_matches')
                              .insert(suggestions.map(s => ({
                                professional_id: s.professional_id,
                                client_id: s.client_id,
                                match_score: s.match_score,
                                match_reasoning: s.match_reasoning,
                                org_id: s.org_id,
                                status: s.status
                              })));
                            
                            if (saveError) {
                              console.error("Error saving suggestions:", saveError);
                            } else {
                              console.log(`✅ Saved ${suggestions.length} match suggestions`);
                            }
                          }
                          
                          const suggestionList = suggestions
                            .slice(0, 10)
                            .map((s, i) => `${i + 1}. **${s.professional_name}** ↔️ **${s.client_name}** - Score: ${s.match_score}%`)
                            .join('\n');
                          
                          const moreText = suggestions.length > 10 ? `\n... en ${suggestions.length - 10} meer matches` : '';
                          
                          result = {
                            success: true,
                            message: `🤖 **AI Match Suggesties**: ${suggestions.length} matches gevonden (min. score: ${minScore}%)\n\n${suggestionList}${moreText}${args.save_suggestions !== false ? '\n\n✅ Suggesties opgeslagen in database' : ''}`,
                            suggestions: suggestions
                          };
                          break;

                        case "query_placements":
                          console.log("🔍 Querying placements...", args);
                          
                          let placementQuery = supabaseClient
                            .from('professional_client_matches')
                            .select(`
                              *,
                              professionals (id, full_name, functie_niveau, werkvorm, regio, skills, status),
                              clients (id, name, company, tier, weekly_hours, revenue_per_hour)
                            `);
                          
                          // Apply filters
                          if (args.filter) {
                            if (args.filter.status) {
                              placementQuery = placementQuery.eq('status', args.filter.status);
                            }
                            if (args.filter.professional_id) {
                              placementQuery = placementQuery.eq('professional_id', args.filter.professional_id);
                            }
                            if (args.filter.client_id) {
                              placementQuery = placementQuery.eq('client_id', args.filter.client_id);
                            }
                            if (args.filter.min_match_score) {
                              placementQuery = placementQuery.gte('match_score', args.filter.min_match_score);
                            }
                            if (args.filter.date_range) {
                              if (args.filter.date_range.start) {
                                placementQuery = placementQuery.gte('created_at', args.filter.date_range.start);
                              }
                              if (args.filter.date_range.end) {
                                placementQuery = placementQuery.lte('created_at', args.filter.date_range.end);
                              }
                            }
                          }
                          
                          placementQuery = placementQuery
                            .order('created_at', { ascending: false })
                            .limit(args.limit || 50);
                          
                          const { data: placements, error: placementError } = await placementQuery;
                          
                          if (placementError) {
                            console.error("Placements query error:", placementError);
                            result = {
                              success: false,
                              message: `❌ Fout bij ophalen plaatsingen: ${placementError.message}`
                            };
                          } else {
                            const placementList = placements
                              ?.map((pl: any, i: number) => {
                                const prof = pl.professionals || {};
                                const client = pl.clients || {};
                                const matchScore = pl.match_score ? `${Math.round(pl.match_score * 100)}%` : 'n/a';
                                const status = pl.status === 'active' ? '✅ Actief' : 
                                             pl.status === 'suggested' ? '💡 Voorgesteld' : 
                                             pl.status === 'completed' ? '✔️ Afgerond' : pl.status;
                                
                                return `${i + 1}. **${prof.full_name}** (${prof.functie_nivel || 'n/a'}) ↔️ **${client.name}** (${client.company})
   ├─ Status: ${status} | Match: ${matchScore}
   ├─ Werkvorm: ${prof.werkvorm || 'n/a'} | Regio: ${prof.regio || 'n/a'}
   └─ Client tier: ${client.tier || 'n/a'} | ${client.weekly_hours || 0}h/week`;
                              })
                              .join('\n\n') || 'Geen plaatsingen gevonden';
                            
                            // Calculate summary stats
                            const byStatus = placements?.reduce((acc: any, pl: any) => {
                              const status = pl.status || 'onbekend';
                              acc[status] = (acc[status] || 0) + 1;
                              return acc;
                            }, {});
                            
                            const avgMatchScore = placements?.filter((pl: any) => pl.match_score).length 
                              ? (placements.filter((pl: any) => pl.match_score).reduce((sum: number, pl: any) => sum + (pl.match_score * 100 || 0), 0) / placements.filter((pl: any) => pl.match_score).length).toFixed(0)
                              : 'n/a';
                            
                            const summary = `📊 **Samenvatting**: ${placements?.length || 0} plaatsingen gevonden\n` +
                              `├─ Gem. match score: ${avgMatchScore}%\n` +
                              `└─ Per status: ${Object.entries(byStatus || {}).map(([status, count]) => `${status}: ${count}`).join(', ')}`;
                            
                          result = {
                              success: true,
                              message: `${summary}\n\n${placementList}`,
                              placements: placements
                            };
                          }
                          break;

                        case "query_evaluation_insights":
                          console.log("🔍 Querying evaluation insights...", args);
                          
                          const insightType = args.insight_type || 'all';
                          const functieFilter = args.functie_niveau;
                          const timePeriod = args.time_period || 'all';
                          
                          // Calculate date filter based on time_period
                          let dateFilter = null;
                          const now = new Date();
                          switch (timePeriod) {
                            case 'week':
                              dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
                              break;
                            case 'month':
                              dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
                              break;
                            case 'quarter':
                              dateFilter = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
                              break;
                            case 'year':
                              dateFilter = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
                              break;
                          }
                          
                          // Query evaluations with assignment data
                          let evalQuery = supabaseClient
                            .from('assignment_evaluations')
                            .select(`
                              *,
                              assignments!inner(
                                ai_match_score,
                                professionals(full_name, functie_niveau)
                              )
                            `)
                            .order('created_at', { ascending: false });
                          
                          if (dateFilter) {
                            evalQuery = evalQuery.gte('created_at', dateFilter);
                          }
                          
                          const { data: evaluations, error: evalError } = await evalQuery;
                          
                          if (evalError) {
                            console.error("Evaluation insights query error:", evalError);
                            result = {
                              success: false,
                              message: `❌ Fout bij ophalen evaluatie inzichten: ${evalError.message}`
                            };
                            break;
                          }
                          
                          // Filter by functie_niveau if specified
                          let filteredEvals = evaluations || [];
                          if (functieFilter) {
                            filteredEvals = filteredEvals.filter((e: any) => 
                              e.assignments?.professionals?.functie_niveau === functieFilter
                            );
                          }
                          
                          if (filteredEvals.length === 0) {
                            result = {
                              success: true,
                              message: `📊 Geen evaluaties gevonden${functieFilter ? ` voor ${functieFilter}` : ''}${timePeriod !== 'all' ? ` in de afgelopen ${timePeriod}` : ''}. Zodra er meer plaatsingen worden geëvalueerd, kan AI hiervan leren.`
                            };
                            break;
                          }
                          
                          // Calculate insights
                          const avgRating = (filteredEvals.reduce((s: number, e: any) => s + e.rating, 0) / filteredEvals.length).toFixed(1);
                          const wouldRehireCount = filteredEvals.filter((e: any) => e.would_rehire === true).length;
                          const wouldRehirePercent = ((wouldRehireCount / filteredEvals.length) * 100).toFixed(0);
                          
                          // Calculate match accuracy (AI predictions vs outcomes)
                          const evalsWithScore = filteredEvals.filter((e: any) => e.assignments?.ai_match_score != null);
                          let matchAccuracy = 'n/a';
                          if (evalsWithScore.length > 0) {
                            const accurate = evalsWithScore.filter((e: any) => {
                              const aiScore = e.assignments.ai_match_score;
                              const positiveOutcome = e.rating >= 4 && e.would_rehire !== false;
                              return (aiScore >= 70 && positiveOutcome) || (aiScore < 70 && !positiveOutcome);
                            });
                            matchAccuracy = ((accurate.length / evalsWithScore.length) * 100).toFixed(0);
                          }
                          
                          // Query knowledge base for learned patterns
                          const { data: patterns } = await supabaseClient
                            .from('ai_knowledge_base')
                            .select('key, value, occurrence_count, confidence_score')
                            .in('category', ['recruitment', 'placement_success', 'evaluation_learning', 'match_patterns'])
                            .is('deleted_at', null)
                            .gte('confidence_score', 0.6)
                            .order('occurrence_count', { ascending: false })
                            .limit(10);
                          
                          // Build success patterns from knowledge
                          const successPatterns = patterns
                            ?.filter((p: any) => p.key?.toLowerCase().includes('success') || p.value?.type === 'success')
                            .slice(0, 3)
                            .map((p: any) => `• ${p.value?.insight || p.key} (${p.occurrence_count || 1}x waargenomen)`)
                            .join('\n') || 'Nog geen patronen geleerd';
                          
                          // Build improvement areas from knowledge
                          const improvementAreas = patterns
                            ?.filter((p: any) => p.key?.toLowerCase().includes('improvement') || p.value?.type === 'improvement')
                            .slice(0, 3)
                            .map((p: any) => `• ${p.value?.insight || p.key}`)
                            .join('\n') || 'Nog geen verbeterpunten geïdentificeerd';
                          
                          // Build result based on insight_type
                          let insightMessage = `📊 **AI Evaluatie Inzichten**${functieFilter ? ` voor ${functieFilter}` : ''}\n`;
                          insightMessage += `Gebaseerd op ${filteredEvals.length} evaluaties${timePeriod !== 'all' ? ` (laatste ${timePeriod})` : ''}\n\n`;
                          
                          if (insightType === 'all' || insightType === 'match_accuracy') {
                            insightMessage += `**🎯 AI Match Nauwkeurigheid**: ${matchAccuracy}%\n`;
                            insightMessage += `├─ Gemiddelde rating: ${avgRating}/5\n`;
                            insightMessage += `└─ Herplaatsbaar: ${wouldRehirePercent}%\n\n`;
                          }
                          
                          if (insightType === 'all' || insightType === 'success_patterns') {
                            insightMessage += `**✅ Geleerde Succesfactoren**:\n${successPatterns}\n\n`;
                          }
                          
                          if (insightType === 'all' || insightType === 'improvement_areas') {
                            insightMessage += `**📈 Verbeterpunten**:\n${improvementAreas}\n\n`;
                          }
                          
                          if (insightType === 'function_performance' || insightType === 'all') {
                            // Group by functie_niveau
                            const byFunctie = filteredEvals.reduce((acc: any, e: any) => {
                              const fn = e.assignments?.professionals?.functie_niveau || 'Onbekend';
                              if (!acc[fn]) acc[fn] = { count: 0, totalRating: 0, rehire: 0 };
                              acc[fn].count++;
                              acc[fn].totalRating += e.rating;
                              if (e.would_rehire) acc[fn].rehire++;
                              return acc;
                            }, {});
                            
                            const functieStats = Object.entries(byFunctie)
                              .map(([fn, stats]: [string, any]) => 
                                `• ${fn}: ${(stats.totalRating / stats.count).toFixed(1)}/5 rating, ${((stats.rehire / stats.count) * 100).toFixed(0)}% herplaatsbaar (${stats.count} evals)`)
                              .join('\n');
                            
                            insightMessage += `**👥 Prestatie per Functieniveau**:\n${functieStats || 'Geen data'}\n`;
                          }
                          
                          result = {
                            success: true,
                            message: insightMessage,
                            stats: {
                              total_evaluations: filteredEvals.length,
                              avg_rating: parseFloat(avgRating),
                              would_rehire_percent: parseFloat(wouldRehirePercent),
                              match_accuracy: matchAccuracy !== 'n/a' ? parseFloat(matchAccuracy) : null
                            }
                          };
                          break;

                        case "query_learning_stats":
                          console.log("🧠 Querying AI learning stats...", args);
                          
                          const statType = args.stat_type || 'overview';
                          
                          // Query knowledge base stats
                          const { count: totalKnowledge } = await supabaseClient
                            .from('ai_knowledge_base')
                            .select('id', { count: 'exact', head: true })
                            .is('deleted_at', null);
                          
                          const { data: successPatternsData, count: successPatternsCount } = await supabaseClient
                            .from('ai_knowledge_base')
                            .select('key, value, occurrence_count, confidence_score, created_at', { count: 'exact' })
                            .eq('category', 'success_patterns')
                            .is('deleted_at', null)
                            .order('occurrence_count', { ascending: false })
                            .limit(10);
                          
                          // Query category breakdown
                          const { data: categoryData } = await supabaseClient
                            .from('ai_knowledge_base')
                            .select('category')
                            .is('deleted_at', null);
                          
                          const categoryCounts: Record<string, number> = {};
                          categoryData?.forEach((c: any) => {
                            categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
                          });
                          
                          const topCategories = Object.entries(categoryCounts)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 8);
                          
                          // Query evaluation stats
                          const { data: evalStatsData } = await supabaseClient
                            .from('assignment_evaluations')
                            .select('rating, would_rehire');
                          
                          const evalCount = evalStatsData?.length || 0;
                          const avgEvalRating = evalCount > 0
                            ? (evalStatsData!.reduce((s: number, e: any) => s + (e.rating || 0), 0) / evalCount).toFixed(1)
                            : '0';
                          const rehireRate = evalCount > 0
                            ? ((evalStatsData!.filter((e: any) => e.would_rehire === true).length / evalCount) * 100).toFixed(0)
                            : '0';
                          
                          // Calculate growth (last 7 days)
                          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                          const { count: recentKnowledge } = await supabaseClient
                            .from('ai_knowledge_base')
                            .select('id', { count: 'exact', head: true })
                            .is('deleted_at', null)
                            .gte('created_at', weekAgo);
                          
                          // Build response based on stat_type
                          let learningMessage = `🧠 **AI Leervoortgang Rapport**\n\n`;
                          
                          if (statType === 'overview' || statType === 'all') {
                            learningMessage += `**📊 Overzicht**\n`;
                            learningMessage += `├─ Totale kennis items: ${totalKnowledge || 0}\n`;
                            learningMessage += `├─ Succes patronen geleerd: ${successPatternsCount || 0}\n`;
                            learningMessage += `├─ Evaluaties verwerkt: ${evalCount}\n`;
                            learningMessage += `├─ Gemiddelde rating: ${avgEvalRating}/5\n`;
                            learningMessage += `└─ Herplaatsingspercentage: ${rehireRate}%\n\n`;
                          }
                          
                          if (statType === 'patterns' || statType === 'all') {
                            const patternsList = successPatternsData?.slice(0, 5)
                              .map((p: any, i: number) => `${i + 1}. ${p.key} (${p.occurrence_count || 1}x waargenomen)`)
                              .join('\n') || 'Nog geen patronen geleerd';
                            learningMessage += `**🎯 Top Geleerde Patronen**:\n${patternsList}\n\n`;
                          }
                          
                          if (statType === 'categories' || statType === 'all') {
                            const categoryList = topCategories
                              .map(([cat, count]) => `• ${cat}: ${count} items`)
                              .join('\n') || 'Geen categorieën';
                            learningMessage += `**📁 Kennis per Categorie**:\n${categoryList}\n\n`;
                          }
                          
                          if (statType === 'growth' || statType === 'all') {
                            learningMessage += `**📈 Groei**\n`;
                            learningMessage += `├─ Nieuwe items deze week: ${recentKnowledge || 0}\n`;
                            learningMessage += `└─ Leerniveau: ${(successPatternsCount || 0) < 3 ? 'Beginner' : (successPatternsCount || 0) < 10 ? 'Gevorderd' : 'Expert'}\n`;
                          }
                          
                          result = {
                            success: true,
                            message: learningMessage,
                            stats: {
                              total_knowledge: totalKnowledge || 0,
                              success_patterns: successPatternsCount || 0,
                              evaluations_processed: evalCount,
                              avg_rating: parseFloat(avgEvalRating),
                              rehire_rate: parseFloat(rehireRate),
                              recent_growth: recentKnowledge || 0,
                              top_categories: topCategories
                            }
                          };
                          break;

                        case "query_candidate_skills":
                          console.log("🔍 Querying candidate skills...", args);
                          
                          // Build search patterns for sectors and doelgroepen
                          const sectorPatterns = (args.sector || []).map((s: string) => `ervaring_${s}`);
                          const doelgroepPatterns = (args.doelgroep || []).map((d: string) => `doelgroep_${d}`);
                          const allPatterns = [...sectorPatterns, ...doelgroepPatterns];
                          
                          if (allPatterns.length === 0) {
                            result = {
                              success: false,
                              message: `❌ Geef minimaal 1 sector of doelgroep filter op (bijv. sector: ["GHZ"] of doelgroep: ["LVB"])`
                            };
                            break;
                          }
                          
                          // Query knowledge base for candidate_skills and candidate_experience
                          // 🔓 CROSS-BUREAU: ABCzorg en CitoZorg werken samen, personeel werkt voor beide bureaus
                          // Verwijder org_id filter zodat ALLE kandidaten worden gevonden
                          const { data: skillsKnowledge, error: skillsQueryError } = await supabaseClient
                            .from('ai_knowledge_base')
                            .select('*')
                            .in('category', ['candidate_skills', 'candidate_experience'])
                            .is('deleted_at', null)
                            // REMOVED: .eq('org_id', userOrgId) - Cross-bureau visibility required
                            .order('created_at', { ascending: false })
                            .limit(500);
                          
                          if (skillsQueryError) {
                            console.error("Skills query error:", skillsQueryError);
                            result = {
                              success: false,
                              message: `❌ Fout bij ophalen kandidaat skills: ${skillsQueryError.message}`
                            };
                            break;
                          }
                          
                          // Filter knowledge items that match requested patterns
                          const matchingKnowledge = skillsKnowledge?.filter((kb: any) => {
                            const skills = kb.value?.skills || [];
                            const sectorExp = kb.value?.ervaring_sector || kb.value?.sector_ervaring || [];
                            const doelgroepExp = kb.value?.doelgroep_ervaring || [];
                            
                            // Check if any requested sector matches
                            const hasMatchingSector = sectorPatterns.length === 0 || 
                              sectorPatterns.some((pattern: string) => 
                                skills.includes(pattern) || 
                                sectorExp.some((s: string) => `ervaring_${s}` === pattern || pattern.toLowerCase().includes(s.toLowerCase()))
                              );
                            
                            // Check if any requested doelgroep matches
                            const hasMatchingDoelgroep = doelgroepPatterns.length === 0 ||
                              doelgroepPatterns.some((pattern: string) => 
                                skills.includes(pattern) ||
                                doelgroepExp.some((d: string) => `doelgroep_${d}` === pattern || pattern.toLowerCase().includes(d.toLowerCase()))
                              );
                            
                            return hasMatchingSector && hasMatchingDoelgroep;
                          }) || [];
                          
                          // Group by application_id to get unique candidates (application_id is in value field)
                          const candidateMap = new Map<string, any>();
                          
                          // Helper function for bureau name
                          const getBureauName = (orgId: string) => {
                            if (orgId === '550e8400-e29b-41d4-a716-446655440000') return 'ABCzorg';
                            if (orgId === '650e8400-e29b-41d4-a716-446655440001') return 'CitoZorg';
                            return 'Onbekend';
                          };
                          
                          for (const kb of matchingKnowledge) {
                            const appId = kb.value?.application_id || kb.assignment_id;
                            if (!appId) continue;
                            
                            if (!candidateMap.has(appId)) {
                              candidateMap.set(appId, {
                                application_id: appId,
                                naam: kb.value?.naam || 'Onbekend',
                                functie_niveau: kb.value?.functie_niveau || 'n/a',
                                werkvorm: kb.value?.werkvorm || 'n/a',
                                regio: kb.value?.regio || 'n/a',
                                bureau: getBureauName(kb.org_id), // 🏢 Bureau indicator
                                matched_skills: [],
                                sector_ervaring: [],
                                doelgroep_ervaring: []
                              });
                            }
                            
                            const candidate = candidateMap.get(appId)!;
                            
                            // Merge skills (handle both field names)
                            if (kb.value?.skills) {
                              candidate.matched_skills = [...new Set([...candidate.matched_skills, ...kb.value.skills])];
                            }
                            const sectorData = kb.value?.ervaring_sector || kb.value?.sector_ervaring || [];
                            if (sectorData.length > 0) {
                              candidate.sector_ervaring = [...new Set([...candidate.sector_ervaring, ...sectorData])];
                            }
                            if (kb.value?.doelgroep_ervaring) {
                              candidate.doelgroep_ervaring = [...new Set([...candidate.doelgroep_ervaring, ...kb.value.doelgroep_ervaring])];
                            }
                          }
                          
                          // Filter by functie_niveau if specified
                          let candidates = Array.from(candidateMap.values());
                          if (args.functie_niveau) {
                            candidates = candidates.filter(c => c.functie_niveau === args.functie_niveau);
                          }
                          
                          // Limit results
                          candidates = candidates.slice(0, args.limit || 20);
                          
                          if (candidates.length === 0) {
                            result = {
                              success: true,
                              message: `🔍 **0 kandidaten gevonden** met criteria:\n` +
                                `├─ Sector: ${args.sector?.join(', ') || 'alle'}\n` +
                                `├─ Doelgroep: ${args.doelgroep?.join(', ') || 'alle'}\n` +
                                `└─ Functieniveau: ${args.functie_niveau || 'alle'}\n\n` +
                                `💡 Tip: Probeer met ruimere filters of andere sector/doelgroep combinaties.`,
                              candidates: []
                            };
                            break;
                          }
                          
                          // Format output with bureau indicator
                          const candidateList = candidates.map((c, i) => {
                            const skills = [
                              ...c.sector_ervaring.map((s: string) => `📋 ${s}`),
                              ...c.doelgroep_ervaring.map((d: string) => `👥 ${d}`)
                            ].join(', ') || 'geen skills';
                            
                            return `${i + 1}. **${c.naam}** [${c.bureau}] - ${c.functie_niveau}\n` +
                              `   ├─ Werkvorm: ${c.werkvorm} | Regio: ${c.regio}\n` +
                              `   └─ Ervaring: ${skills}`;
                          }).join('\n\n');
                          
                          const skillsSummary = `🎯 **${candidates.length} kandidaten gevonden** met criteria:\n` +
                            `├─ Sector: ${args.sector?.join(', ') || 'alle'}\n` +
                            `├─ Doelgroep: ${args.doelgroep?.join(', ') || 'alle'}\n` +
                            `└─ Functieniveau: ${args.functie_niveau || 'alle'}`;
                          
                          result = {
                            success: true,
                            message: `${skillsSummary}\n\n${candidateList}`,
                            candidates: candidates
                          };
                          break;

                        case "create_multiple_tasks":
                          console.log(`📦 Bulk creating ${args.tasks.length} tasks`);
                          
                          const bulkResults = {
                            successful: [] as any[],
                            failed: [] as any[]
                          };

                          // Prepare all tasks for bulk insert
                          const tasksToInsert = args.tasks.map((task: any) => {
                            // Normalize priority
                            let normalizedPriority = (task.priority || "MEDIUM").toUpperCase();
                            if (normalizedPriority === "NORMAL") normalizedPriority = "MEDIUM";
                            if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(normalizedPriority)) {
                              normalizedPriority = "MEDIUM";
                            }

                            // Smart date defaults
                            let startAt = task.start_at || null;
                            const dueAt = task.due_at || null;
                            
                            if (dueAt && !startAt) {
                              startAt = new Date().toISOString();
                            } else if (!dueAt && !startAt) {
                              startAt = new Date().toISOString();
                            }

                            return {
                              title: task.title,
                              description: task.description || null,
                              priority: normalizedPriority,
                              due_at: dueAt,
                              start_at: startAt,
                              project_id: task.project_id || null,
                              client_id: task.client_id || null,
                              assignee_id: task.assignee_id || null,
                              org_id: userOrgId,
                              reporter_id: user.id
                            };
                          });

                          // Bulk insert
                          const { data: createdTasks, error: bulkError } = await supabaseClient
                            .from("tasks")
                            .insert(tasksToInsert)
                            .select();

                          if (bulkError) {
                            console.error("Bulk insert error:", bulkError);
                            result = {
                              success: false,
                              message: `❌ Fout bij bulk aanmaken: ${bulkError.message}`
                            };
                          } else {
                            const successCount = createdTasks?.length || 0;
                            const tasksList = createdTasks
                              ?.slice(0, 5)
                              .map((t: any, i: number) => `${i + 1}. ${t.title} (ID: ${t.sequence_number || t.id})`)
                              .join('\n') || '';
                            
                            const moreText = successCount > 5 ? `\n... en ${successCount - 5} meer taken` : '';
                            
                            result = {
                              success: true,
                              message: `✅ ${successCount} taken succesvol aangemaakt!\n\n${tasksList}${moreText}\n\n🎯 Alle taken zijn nu zichtbaar in Kanban, Lijst en Kalender views.`
                            };
                          }
                          break;

                        case "declare_knowledge_usage":
                          // Store declared knowledge IDs for accurate tracking
                          declaredKnowledgeIds.push(...args.knowledge_ids);
                          console.log(`📊 AI declared usage of ${args.knowledge_ids.length} knowledge items${args.usage_context ? `: ${args.usage_context}` : ''}`);
                          
                          result = {
                            success: true,
                            message: `📊 Tracking: ${args.knowledge_ids.length} knowledge items geregistreerd`,
                            tracked_ids: args.knowledge_ids
                          };
                          break;

                        // =====================================================
                        // AI AGENT ACTION TOOLS - Execute via orchestrator
                        // =====================================================
                        case "send_email":
                          console.log("📧 AI Agent: send_email tool called", args);
                          
                          // Create AI Agent goal for email sending
                          const emailGoalResult = await supabaseServiceClient
                            .from('agent_goals')
                            .insert({
                              org_id: userOrgId,
                              goal_type: args.email_type === 'followup' ? 'application_intake_completion' :
                                        args.email_type === 'interview_confirmation' ? 'send_interview_email' :
                                        args.email_type === 'document_request' ? 'request_documents' : 'send_general_email',
                              goal_description: `Email naar ${args.recipient_name}: ${args.subject}`,
                              status: 'pending',
                              priority: args.email_type === 'interview_confirmation' ? 8 : 5,
                              input_data: {
                                recipient_email: args.recipient_email,
                                recipient_name: args.recipient_name,
                                subject: args.subject,
                                email_type: args.email_type,
                                ...args.context
                              }
                            })
                            .select()
                            .single();
                          
                          if (emailGoalResult.error) {
                            console.error("Email goal creation error:", emailGoalResult.error);
                            result = {
                              success: false,
                              message: `❌ Fout bij aanmaken email taak: ${emailGoalResult.error.message}`
                            };
                          } else {
                            // Trigger orchestrator to process immediately
                            await supabaseServiceClient.functions.invoke('ai-agent-orchestrator', {
                              body: { action: 'plan_goal', goal_id: emailGoalResult.data.id }
                            });
                            
                            result = {
                              success: true,
                              message: `📧 Email taak aangemaakt!\n├─ Naar: ${args.recipient_email}\n├─ Onderwerp: ${args.subject}\n└─ Status: In afwachting van verzending via n8n/Outlook`,
                              goal_id: emailGoalResult.data.id
                            };
                          }
                          break;

                        case "schedule_interview":
                          console.log("📅 AI Agent: schedule_interview tool called", args);
                          
                          // Parse scheduled_at to create proper date
                          const interviewDate = new Date(args.scheduled_at);
                          const endTime = new Date(interviewDate.getTime() + (args.duration_minutes || 30) * 60 * 1000);
                          
                          // Create task for interview
                          const { data: interviewTask, error: taskError } = await supabaseClient
                            .from('tasks')
                            .insert({
                              org_id: userOrgId,
                              application_id: args.application_id,
                              recruitment_action_type: 'interview',
                              title: `Interview met ${args.candidate_name}`,
                              description: `Interview afspraak op ${interviewDate.toLocaleDateString('nl-NL')} om ${interviewDate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`,
                              priority: 'HIGH',
                              category: 'recruitment',
                              status: 'todo',
                              reporter_id: user.id,
                              due_at: interviewDate.toISOString(),
                              interview_details: {
                                scheduled_at: args.scheduled_at,
                                duration_minutes: args.duration_minutes || 30,
                                location_type: args.location_type,
                                location_details: args.location_details
                              }
                            })
                            .select()
                            .single();
                          
                          if (taskError) {
                            console.error("Interview task creation error:", taskError);
                            result = {
                              success: false,
                              message: `❌ Fout bij aanmaken interview taak: ${taskError.message}`
                            };
                            break;
                          }
                          
                          // Create AI Agent goal for email and calendar if requested
                          if (args.send_confirmation !== false) {
                            await supabaseServiceClient
                              .from('agent_goals')
                              .insert({
                                org_id: userOrgId,
                                goal_type: 'send_interview_email',
                                goal_description: `Stuur interview bevestigingsmail naar ${args.candidate_name}`,
                                status: 'pending',
                                priority: 8,
                                input_data: {
                                  applicationId: args.application_id,
                                  taskId: interviewTask.id,
                                  candidateEmail: args.candidate_email,
                                  candidateName: args.candidate_name,
                                  scheduledAt: args.scheduled_at,
                                  duration: args.duration_minutes || 30,
                                  locationType: args.location_type,
                                  locationDetails: args.location_details,
                                  createCalendarEvent: args.create_calendar_event
                                }
                              });
                          }
                          
                          // Trigger orchestrator
                          await supabaseServiceClient.functions.invoke('ai-agent-orchestrator', {
                            body: { action: 'process_pending_goals' }
                          });
                          
                          result = {
                            success: true,
                            message: `📅 Interview ingepland!\n├─ Kandidaat: ${args.candidate_name}\n├─ Datum: ${interviewDate.toLocaleDateString('nl-NL')}\n├─ Tijd: ${interviewDate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}\n├─ Locatie: ${args.location_type === 'video' ? 'Microsoft Teams' : args.location_type === 'kantoor' ? args.location_details || 'Kantoor' : 'Telefonisch'}\n└─ ${args.send_confirmation !== false ? '✅ Bevestigingsmail wordt verstuurd' : '⚠️ Geen bevestigingsmail'}`
                          };
                          break;

                        case "request_documents":
                          console.log("📄 AI Agent: request_documents tool called", args);
                          
                          const documentsToRequest = args.documents || [];
                          const deadline = new Date();
                          deadline.setDate(deadline.getDate() + (args.deadline_days || 7));
                          
                          // Create AI Agent goal for document request
                          const docGoalResult = await supabaseServiceClient
                            .from('agent_goals')
                            .insert({
                              org_id: userOrgId,
                              goal_type: 'request_documents',
                              goal_description: `Vraag documenten op bij ${args.candidate_name}: ${documentsToRequest.join(', ')}`,
                              status: 'pending',
                              priority: args.urgent ? 9 : 6,
                              input_data: {
                                application_id: args.application_id,
                                candidate_email: args.candidate_email,
                                candidate_name: args.candidate_name,
                                documents: documentsToRequest,
                                deadline: deadline.toISOString(),
                                urgent: args.urgent || false
                              }
                            })
                            .select()
                            .single();
                          
                          if (docGoalResult.error) {
                            result = {
                              success: false,
                              message: `❌ Fout bij aanmaken documentverzoek: ${docGoalResult.error.message}`
                            };
                          } else {
                            // Trigger orchestrator
                            await supabaseServiceClient.functions.invoke('ai-agent-orchestrator', {
                              body: { action: 'plan_goal', goal_id: docGoalResult.data.id }
                            });
                            
                            result = {
                              success: true,
                              message: `📄 Documentverzoek aangemaakt!\n├─ Kandidaat: ${args.candidate_name}\n├─ Documenten: ${documentsToRequest.join(', ')}\n├─ Deadline: ${deadline.toLocaleDateString('nl-NL')}\n└─ Status: Email wordt verstuurd via n8n/Outlook`
                            };
                          }
                          break;

                        case "create_calendar_event":
                          console.log("📆 AI Agent: create_calendar_event tool called", args);
                          
                          // Create AI Agent goal for calendar event
                          const calendarGoalResult = await supabaseServiceClient
                            .from('agent_goals')
                            .insert({
                              org_id: userOrgId,
                              goal_type: 'create_calendar_event',
                              goal_description: `Maak kalenderafspraak: ${args.title}`,
                              status: 'pending',
                              priority: 7,
                              input_data: {
                                title: args.title,
                                start_time: args.start_time,
                                end_time: args.end_time,
                                attendees: args.attendees,
                                location: args.location,
                                description: args.description,
                                is_online_meeting: args.is_online_meeting || false
                              }
                            })
                            .select()
                            .single();
                          
                          if (calendarGoalResult.error) {
                            result = {
                              success: false,
                              message: `❌ Fout bij aanmaken kalenderafspraak: ${calendarGoalResult.error.message}`
                            };
                          } else {
                            // Trigger orchestrator
                            await supabaseServiceClient.functions.invoke('ai-agent-orchestrator', {
                              body: { action: 'plan_goal', goal_id: calendarGoalResult.data.id }
                            });
                            
                            const eventDate = new Date(args.start_time);
                            result = {
                              success: true,
                              message: `📆 Kalenderafspraak aangemaakt!\n├─ Titel: ${args.title}\n├─ Datum: ${eventDate.toLocaleDateString('nl-NL')}\n├─ Tijd: ${eventDate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}\n├─ Deelnemers: ${args.attendees?.join(', ') || 'Geen'}\n└─ ${args.is_online_meeting ? '🎥 Teams meeting link wordt aangemaakt' : '📍 Locatie: ' + (args.location || 'Nader te bepalen')}`
                            };
                          }
                          break;

                        // =====================================================
                        // CANDIDATE LOOKUP & SMART FOLLOW-UP (Chat ↔ Agent Integration)
                        // =====================================================
                        case "lookup_candidate":
                          console.log("🔍 Lookup candidate:", args.search_query);
                          
                          const searchQuery = args.search_query?.toLowerCase().trim() || '';
                          const includeMissingInfo = args.include_missing_info !== false;
                          
                          // Search by name, email, or UUID
                          let candidateQuery = supabaseClient
                            .from('professional_applications')
                            .select(`
                              id, 
                              email_from, 
                              extracted_data, 
                              missing_info, 
                              completeness_score, 
                              pipeline_stage, 
                              status,
                              professional_id,
                              created_at,
                              updated_at
                            `)
                            .is('deleted_at', null)
                            .limit(10);
                          
                          // Search by email (exact or partial)
                          if (searchQuery.includes('@')) {
                            candidateQuery = candidateQuery.ilike('email_from', `%${searchQuery}%`);
                          } 
                          // Search by UUID
                          else if (searchQuery.match(/^[0-9a-f]{8}-/i)) {
                            candidateQuery = candidateQuery.ilike('id', `${searchQuery}%`);
                          }
                          // Search by name in extracted_data
                          else {
                            // Use textSearch or filter on extracted_data->naam
                            candidateQuery = candidateQuery.or(`email_from.ilike.%${searchQuery}%`);
                          }
                          
                          const { data: lookupCandidates, error: lookupCandidateError } = await candidateQuery;
                          
                          if (lookupCandidateError) {
                            result = {
                              success: false,
                              message: `❌ Fout bij zoeken kandidaat: ${lookupCandidateError.message}`
                            };
                            break;
                          }
                          
                          // Also filter by name in extracted_data (client-side)
                          let filteredLookupCandidates = lookupCandidates || [];
                          if (!searchQuery.includes('@') && !searchQuery.match(/^[0-9a-f]{8}-/i)) {
                            filteredLookupCandidates = filteredLookupCandidates.filter(c => {
                              const naam = (c.extracted_data as any)?.naam?.toLowerCase() || '';
                              return naam.includes(searchQuery) || c.email_from?.toLowerCase().includes(searchQuery);
                            });
                          }
                          
                          if (filteredLookupCandidates.length === 0) {
                            result = {
                              success: false,
                              message: `🔍 Geen kandidaat gevonden voor "${args.search_query}". Probeer te zoeken op volledige email of deel van de naam.`
                            };
                            break;
                          }
                          
                          // Format results
                          const lookupCandidateResults = filteredLookupCandidates.map(c => {
                            const data = c.extracted_data as any || {};
                            const missingFields = (c.missing_info as string[]) || [];
                            
                            return {
                              id: c.id,
                              name: data.naam || 'Onbekend',
                              email: c.email_from,
                              functie_niveau: data.functie_niveau || 'Niet opgegeven',
                              werkvorm: data.werkvorm || 'Niet opgegeven',
                              regio: data.regio || 'Niet opgegeven',
                              pipeline_stage: c.pipeline_stage,
                              completeness: c.completeness_score || 0,
                              missing_fields: includeMissingInfo ? missingFields : [],
                              missing_count: missingFields.length,
                              professional_id: c.professional_id,
                              last_updated: c.updated_at
                            };
                          });
                          
                          const lookupCandidateList = lookupCandidateResults.map((c, i) => 
                            `${i + 1}. **${c.name}** (${c.email})\n` +
                            `   ├─ ID: \`${c.id.substring(0, 8)}...\`\n` +
                            `   ├─ Functie: ${c.functie_niveau} | Werkvorm: ${c.werkvorm}\n` +
                            `   ├─ Pipeline: ${c.pipeline_stage} | Compleetheid: ${c.completeness}%\n` +
                            (c.missing_count > 0 ? `   └─ ⚠️ Ontbreekt: ${c.missing_fields.slice(0, 3).join(', ')}${c.missing_count > 3 ? ` (+${c.missing_count - 3})` : ''}` : `   └─ ✅ Profiel compleet`)
                          ).join('\n\n');
                          
                          result = {
                            success: true,
                            candidates: lookupCandidateResults,
                            message: `🔍 **${filteredLookupCandidates.length} kandidaat(en) gevonden:**\n\n${lookupCandidateList}\n\n💡 *Wil je een follow-up sturen? Gebruik het application ID.*`
                          };
                          break;

                        case "send_smart_followup":
                          console.log("📧 Smart follow-up:", args);
                          
                          if (!args.application_id) {
                            result = {
                              success: false,
                              message: `❌ Geen application_id opgegeven. Gebruik eerst lookup_candidate om de kandidaat te vinden.`
                            };
                            break;
                          }
                          
                          // ANTI-SPAM CHECK: Max 1 follow-up per 24 hours per candidate
                          const { data: recentFollowups } = await supabaseClient
                            .from('agent_goals')
                            .select('created_at')
                            .eq('goal_type', 'chat_triggered_followup')
                            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
                            .filter('input_data->>application_id', 'eq', args.application_id)
                            .order('created_at', { ascending: false })
                            .limit(1);
                          
                          if (recentFollowups && recentFollowups.length > 0) {
                            const lastSent = new Date(recentFollowups[0].created_at);
                            const hoursAgo = Math.round((Date.now() - lastSent.getTime()) / (1000 * 60 * 60));
                            result = {
                              success: false,
                              message: `⚠️ Er is ${hoursAgo} uur geleden al een follow-up verstuurd naar deze kandidaat. Wacht minimaal 24 uur voordat je opnieuw een follow-up stuurt om spam te voorkomen.`,
                              too_recent: true,
                              last_sent_at: lastSent.toISOString()
                            };
                            break;
                          }
                          
                          // Get application details
                          const { data: followupAppData, error: followupAppError } = await supabaseClient
                            .from('professional_applications')
                            .select('id, email_from, extracted_data, missing_info, completeness_score, pipeline_stage')
                            .eq('id', args.application_id)
                            .single();
                          
                          if (followupAppError || !followupAppData) {
                            result = {
                              success: false,
                              message: `❌ Sollicitatie niet gevonden: ${followupAppError?.message || 'ID onbekend'}`
                            };
                            break;
                          }
                          
                          // Determine fields to ask
                          const followupMissingInfo = (followupAppData.missing_info as string[]) || [];
                          const priorityFieldsToAsk = args.priority_fields?.length > 0 
                            ? args.priority_fields 
                            : followupMissingInfo.slice(0, 10);
                          
                          // Field label mapping for preview
                          const followupFieldLabels: Record<string, string> = {
                            functie_niveau: 'Functieniveau (VIG/HBO-V/etc)',
                            werkvorm: 'Werkvorm (ZZP of Uitzend)',
                            regio: 'Voorkeursregio',
                            beschikbaarheid: 'Beschikbaarheid',
                            telefoonnummer: 'Telefoonnummer',
                            ervaring_sector: 'Sector ervaring',
                            doelgroep_ervaring: 'Doelgroep ervaring',
                            diploma: 'Diploma/opleiding'
                          };
                          
                          // Generate preview
                          const followupEmailPreview = `Beste ${args.candidate_name || 'kandidaat'},\n\n` +
                            `Bedankt voor je interesse om via ABCzorg te werken. Om je sollicitatie compleet te maken, willen we je vragen om de volgende informatie aan te vullen:\n\n` +
                            priorityFieldsToAsk.map((f: string) => `• ${followupFieldLabels[f] || f}`).join('\n') +
                            (args.custom_message ? `\n\n${args.custom_message}` : '') +
                            `\n\nJe kunt eenvoudig reageren op deze email.\n\nMet vriendelijke groet,\nHet ABCzorg team`;
                          
                          // Return confirmation card data (frontend will show AgentActionCard)
                          result = {
                            success: true,
                            requires_confirmation: true,
                            action_data: {
                              type: 'agent_action_pending',
                              action_type: 'send_followup',
                              candidate_name: args.candidate_name || (followupAppData.extracted_data as any)?.naam || 'Kandidaat',
                              candidate_email: args.candidate_email || followupAppData.email_from,
                              application_id: args.application_id,
                              action_description: `Follow-up email voor ${priorityFieldsToAsk.length} ontbrekende velden`,
                              action_preview: followupEmailPreview,
                              missing_fields: priorityFieldsToAsk,
                              custom_message: args.custom_message
                            },
                            message: `📧 **Follow-up voorbereid voor ${args.candidate_name || 'kandidaat'}**\n\n` +
                              `📋 Te vragen: ${priorityFieldsToAsk.slice(0, 5).map((f: string) => followupFieldLabels[f] || f).join(', ')}${priorityFieldsToAsk.length > 5 ? ` (+${priorityFieldsToAsk.length - 5})` : ''}\n\n` +
                              `⏳ *Bevestig in de chat om de email te versturen.*\n\n` +
                              `[AGENT_ACTION_CARD]${JSON.stringify({
                                type: 'agent_action_pending',
                                action_type: 'send_followup',
                                candidate_name: args.candidate_name || (followupAppData.extracted_data as any)?.naam || 'Kandidaat',
                                candidate_email: args.candidate_email || followupAppData.email_from,
                                application_id: args.application_id,
                                action_description: `Follow-up email voor ${priorityFieldsToAsk.length} ontbrekende velden`,
                                action_preview: followupEmailPreview,
                                missing_fields: priorityFieldsToAsk,
                                custom_message: args.custom_message
                              })}[/AGENT_ACTION_CARD]`
                          };
                          break;

                        default:
                          result = { success: false, message: `Onbekende tool: ${toolCall.function.name}` };
                          break;
                      }

                      // Send tool result back to user as content
                      const toolResultContent = `\n\n✅ ${result.message}`;
                      fullResponse += toolResultContent; // Track tool output for empty response check
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        choices: [{
                          delta: { content: toolResultContent },
                          index: 0
                        }]
                      })}\n\n`));
                    } catch (toolError) {
                      console.error(`Error executing tool ${toolCall.function.name}:`, toolError);
                      const errorMessage = toolError instanceof Error ? toolError.message : String(toolError);
                      const errorContent = `\n\n❌ Fout bij uitvoeren actie: ${errorMessage}`;
                      fullResponse += errorContent; // Track tool errors for empty response check
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        choices: [{
                          delta: { content: errorContent },
                          index: 0
                        }]
                      })}\n\n`));
                    }
                  }

                  // 🔄 CONDITIONAL [DONE]: Only send if we're NOT retrying with new knowledge
                  if (!needsRetryWithNewKnowledge) {
                    // Check if we just executed auto_harvest_knowledge with 0 results after waiting
                    if (noResultsAfterHarvest) {
                      // Send explicit closing message for failed harvester
                      console.log(`⚠️ Sending closing message: No results found after wait`);
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        choices: [{
                          delta: { 
                            content: `\n\n⚠️ Ik heb binnen de wachttijd niets gevonden dat ik met hoge zekerheid kan bevestigen. Geef me meer context (bijv. regio/jaar of opdrachtgeverstype), of ik probeer het later opnieuw.` 
                          },
                          index: 0
                        }]
                      })}\n\n`));
                      noResultsAfterHarvest = false; // Reset flag
                    }
                    controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                    break;
                  }

                  // 🔄 RETRY LOOP: Trigger second AI completion with new knowledge
                  if (needsRetryWithNewKnowledge && retryCount < MAX_RETRIES) {
                    retryCount++;
                    console.log(`🔄 Starting retry ${retryCount}/${MAX_RETRIES} with new knowledge...`);

                    // Send retry status to client
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                      choices: [{
                        delta: { content: newKnowledgeMessage },
                        index: 0
                      }]
                    })}\n\n`));

                    // Re-fetch updated knowledge base (harvester has added new items)
                    const { data: updatedKnowledgeData } = await supabaseClient
                      .from("ai_knowledge_base")
                      .select("*")
                      .is("deleted_at", null)
                      .order("confidence_score", { ascending: false });

                    const updatedFullKnowledgeBase = (updatedKnowledgeData || []).map((kb: any) => ({
                      id: kb.id,
                      category: kb.category,
                      key: kb.key,
                      value: kb.value,
                      confidence_score: kb.confidence_score,
                      source: kb.source,
                      client: kb.client,
                      usage_count: kb.usage_count,
                      last_used_at: kb.last_used_at,
                    }));

                    console.log(`📚 Updated knowledge base: ${updatedFullKnowledgeBase.length} items (was ${fullKnowledgeBase.length})`);

                    // Get last user message for retry context
                    const lastUserMessage = messages
                      .filter((m: any) => m.role === "user")
                      .pop()?.content || "de vraag";

                    // Rebuild system prompt with updated knowledge
                    const retrySystemPrompt = `Je bent een efficiënte AI-assistent voor TaskFlow. Focus: kort, effectief, direct.

🕐 HUIDIGE NEDERLANDSE TIJD:
Vandaag is: ${dutchDateTime}
Je werkt in Nederlandse tijd (Europe/Amsterdam, CET/CEST tijdzone).

⚡ SLIMME ANTWOORDLENGTE:
- STANDAARD: 2-3 korte zinnen (efficiënt & direct)
- UITGEBREID: Bij trigger woorden zoals "uitgebreid", "volledig", "gedetailleerd", "leg uit", "vertel meer" → geef complete, gestructureerde uitleg
- KORT: Bij "samenvatting", "kort", "overzicht" → extra beknopt

🎯 TOOLS: Je hebt zojuist auto_harvest_knowledge uitgevoerd en nieuwe data verzameld.

🔄 RETRY INSTRUCTIE - DIT IS BELANGRIJK:
Je krijgt een TWEEDE KANS om de vraag te beantwoorden met VERSE KENNISBANK DATA.

1. Gebruik verify_answer_confidence OPNIEUW - de kennisbank bevat nu ${updatedFullKnowledgeBase.length} items (was ${fullKnowledgeBase.length})
2. Geef een VOLLEDIG NIEUW, ZELFSTANDIG LEESBAAR antwoord met:
   - Nieuwe confidence badge (bijv. [🟢 96% Zeker] ipv [🟠 50%])
   - Concrete info uit de nieuwe kennisitems
   - Expliciete vermelding: "✅ Op basis van nieuw verzamelde data:" of "✅ Na herberekening:"
3. Als nog steeds <98%: wees transparant over wat je WEL weet en wat nog ontbreekt

⚠️ RETRY ANTWOORD REGELS:
- MOET zelfstandig leesbaar zijn (geen "zie hierboven" of verwijzingen naar eerste antwoord)
- TOON duidelijk verschil tussen eerste poging en retry (nieuwe confidence + nieuwe data)
- GEEN herhaling van "ik ga zoeken" - je hebt al gezocht, geef nu het RESULTAAT

📚 UPDATED KENNISBANK (${updatedFullKnowledgeBase.length} items):
${updatedFullKnowledgeBase.slice(0, 50).map(kb => `- ${kb.category}: ${kb.key} = ${JSON.stringify(kb.value).substring(0, 100)}`).join('\n')}
`;

                    const retryMessages = [
                      { role: "system", content: retrySystemPrompt },
                      ...messages,
                      { 
                        role: "assistant", 
                        content: fullResponse.trim()
                      },
                      {
                        role: "user",
                        content: `Je hebt zojuist nieuwe kennisitems verzameld via auto_harvest_knowledge. Beantwoord mijn originele vraag ("${lastUserMessage}") nu opnieuw met:

1. verify_answer_confidence om je NIEUWE confidence te berekenen
2. Een volledig, geüpdatet, ZELFSTANDIG LEESBAAR antwoord
3. Nieuwe confidence badge
4. Expliciete vermelding van nieuwe data

BELANGRIJK: Dit moet een compleet nieuw antwoord zijn, geen verwijzing naar je vorige antwoord.`
                      }
                    ];

                    // 🔄 RECURSIVE AI CALL: Make new fetch with updated context
                    console.log("🤖 Making retry AI call with updated knowledge...");
                    const retryResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                      method: "POST",
                      headers: {
                        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        model: "google/gemini-2.5-flash",
                        messages: retryMessages,
                        tools: tools,
                        stream: true,
                      }),
                    });

                    if (!retryResponse.ok) {
                      const errorText = await retryResponse.text();
                      console.error(`❌ Retry AI call failed: ${retryResponse.status} - ${errorText}`);
                      
                      // Stuur user-friendly error naar client
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        choices: [{
                          delta: { content: "\n\n⚠️ Fout bij het verwerken van nieuwe data. Probeer het opnieuw." },
                          index: 0
                        }]
                      })}\n\n`));
                      
                      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                      break;
                    }

                    // Reset tracking variables for retry stream
                    needsRetryWithNewKnowledge = false;
                    fullResponse = "";
                    buffer = "";
                    toolCalls = [];
                    
                    // Get new reader for retry stream
                    const retryReader = retryResponse.body?.getReader();
                    if (!retryReader) {
                      console.error("❌ No retry reader available");
                      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                      break;
                    }

                    console.log("✅ Retry stream started, processing retry response...");
                    
                    // Process retry stream (same logic as main stream)
                    let retryStreamComplete = false;
                    while (true && !retryStreamComplete) {
                      const { done: retryDone, value: retryValue } = await retryReader.read();
                      if (retryDone) {
                        retryStreamComplete = true;
                        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                        break;
                      }

                      buffer += decoder.decode(retryValue, { stream: true });
                      const lines = buffer.split("\n");
                      buffer = lines.pop() || "";

                      for (const line of lines) {
                        if (!line.trim() || line.startsWith(":")) continue;
                        if (!line.startsWith("data: ")) continue;

                        const data = line.slice(6);
                        if (data === "[DONE]") continue;

                        try {
                          const parsed = JSON.parse(data);
                          const delta = parsed.choices?.[0]?.delta;

                          // Stream retry content
                          if (delta?.content) {
                            fullResponse += delta.content;
                            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                          }

                          // If retry stream finishes, exit both loops
                          if (parsed.choices?.[0]?.finish_reason === "stop") {
                            console.log("✅ Retry stream completed");
                            retryStreamComplete = true;
                            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                            break;
                          }
                        } catch (e) {
                          console.error("Error parsing retry SSE data:", e);
                        }
                      }

                      // Exit outer loop if retry stream complete
                      if (retryStreamComplete) break;
                    }
                    
                    break; // Exit main tool execution loop
                  }

                  // Max retries reached or no retry needed
                  if (retryCount >= MAX_RETRIES) {
                    console.log(`⚠️ Max retries (${MAX_RETRIES}) reached, stopping`);
                  }
                  controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                  break;
                }
              } catch (e) {
                console.error("Error parsing SSE data:", e);
              }
            }
          }

          // Flush remaining buffer
          if (buffer.trim()) {
            const data = buffer.trim();
            if (data.startsWith("data: ") && data.slice(6) !== "[DONE]") {
              controller.enqueue(encoder.encode(`${data}\n\n`));
            }
          }
          
          // 🚫 EMPTY RESPONSE CHECK (before saving)
          if (!fullResponse || fullResponse.trim().length === 0) {
            console.error('🚫 EMPTY RESPONSE DETECTED - Stream ended without content');
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              choices: [{
                delta: { content: '\n\n⚠️ **Fout**: Geen antwoord ontvangen van de AI. Probeer het opnieuw of herformuleer je vraag.\n\n' },
                index: 0
              }]
            })}\n\n`));
            fullResponse = '⚠️ Lege response - niet gecached'; // Mark as invalid
          }

          // Track knowledge usage BEFORE closing stream (blocking)
          // 🎯 Use declared IDs if available, otherwise fallback to keyword matching
          let usedKnowledgeIds: string[] = [];
          if (declaredKnowledgeIds.length > 0) {
            console.log(`✅ Using DECLARED knowledge IDs for tracking: ${declaredKnowledgeIds.length} items`);
            
            // Direct tracking using declared IDs with unified reinforceKnowledge
            for (const knowledgeId of declaredKnowledgeIds) {
              try {
                // Use atomic reinforceKnowledge for concurrent-safe usage tracking
                await reinforceKnowledge(supabaseClient as any, knowledgeId, userOrgId, {
                  usageIncrement: 1,
                  stabilityBoost: 0.01 // Small boost for validated usage
                });
                usedKnowledgeIds.push(knowledgeId);
              } catch (reinforceError) {
                console.error(`Failed to track knowledge ${knowledgeId}:`, reinforceError);
              }
            }
            
            console.log(`📊 Knowledge tracking complete: ${usedKnowledgeIds.length} items updated`);
          } else {
            console.log(`⚠️ No declared knowledge IDs, falling back to keyword matching`);
            usedKnowledgeIds = await trackKnowledgeUsage(fullResponse, fullKnowledgeBase, supabaseClient, user.id, messages);
          }
          
          // ============================================
          // FASE 2 & 3: MULTI-ITERATION + CONFIDENCE TRACKING
          // ============================================
          let iterations = 1;
          let initialConfidence = 0.75;
          let finalConfidence = 0.75;
          let harvesterTriggered = false;
          
          try {
            // Extract confidence from response
            const confidenceMatch = fullResponse.match(/\[(?:🟢|🟡|🟠|🔴)\s+(\d+)%/);
            initialConfidence = confidenceMatch ? parseInt(confidenceMatch[1]) / 100 : 0.75;
            finalConfidence = initialConfidence;
            
            // FASE 3: Multi-iteration logic - 2e poging bij lage confidence
            if (initialConfidence < 0.70 && iterations < 2) {
              console.log(`🔄 Low confidence (${(initialConfidence * 100).toFixed(0)}%), trying iteration 2...`);
              harvesterTriggered = true;
              
              // Simply try to get more knowledge from the existing base
              const { data: moreKnowledge } = await supabaseClient
                .from('ai_knowledge_base')
                .select('id, category, key, value, confidence_score')
                .eq('org_id', userOrgId)
                .is('deleted_at', null)
                .order('confidence_score', { ascending: false })
                .limit(20);
              
              if (moreKnowledge && moreKnowledge.length > 0) {
                // Re-generate with expanded knowledge
                const improvedKnowledgeBase = [...fullKnowledgeBase, ...moreKnowledge];
                
                // Format expanded knowledge
                const expandedKnowledgeText = improvedKnowledgeBase
                  .map(kb => `[ID: ${kb.knowledge_id || kb.id}] ${kb.key}: ${typeof kb.value === 'string' ? kb.value : JSON.stringify(kb.value)}`)
                  .join('\n');
                
                // Make second AI call with expanded knowledge
                const secondResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    model: 'google/gemini-2.5-flash', // Cheaper model for 2nd iteration
                    messages: [
                      { role: 'system', content: `Je bent een AI-assistent. Gebruik deze uitgebreide kennis:\n\n${expandedKnowledgeText}` },
                      { role: 'user', content: lastUserMessage }
                    ],
                    stream: false,
                  }),
                });
                
                if (secondResponse.ok) {
                  const secondData = await secondResponse.json();
                  const improvedResponse = secondData.choices?.[0]?.message?.content || fullResponse;
                  
                  // Check improved confidence
                  const improvedMatch = improvedResponse.match(/\[(?:🟢|🟡|🟠|🔴)\s+(\d+)%/);
                  const improvedConfidence = improvedMatch ? parseInt(improvedMatch[1]) / 100 : initialConfidence;
                  
                  if (improvedConfidence > initialConfidence) {
                    fullResponse = improvedResponse;
                    finalConfidence = improvedConfidence;
                    iterations = 2;
                    console.log(`✅ Iteration 2 complete: ${(initialConfidence * 100).toFixed(0)}% → ${(finalConfidence * 100).toFixed(0)}%`);
                  } else {
                    console.log(`⚠️ Iteration 2 did not improve confidence, keeping original`);
                  }
                }
              }
            }
            
            // Log REAL confidence tracking
            await supabaseClient.from('confidence_tracking').insert({
              user_id: user.id,
              org_id: userOrgId,
              question: lastUserMessage,
              initial_confidence: initialConfidence,
              final_confidence: finalConfidence,
              iterations_count: iterations,
              used_knowledge_ids: usedKnowledgeIds,
              harvester_triggered: harvesterTriggered
            });
            
            console.log(`📊 Confidence tracked: ${(initialConfidence * 100).toFixed(0)}% → ${(finalConfidence * 100).toFixed(0)}% (${iterations} iterations)`);
          } catch (confError) {
            console.error('❌ Confidence tracking failed (non-blocking):', confError);
          }
          
          // ============================================
          // FASE 8: ORG-PROFILE MISMATCH DETECTION
          // ============================================
          if (orgProfiles && orgProfiles.length > 0 && fullResponse) {
            try {
              const aiResponseLower = fullResponse.toLowerCase();
              
              for (const profile of orgProfiles) {
                const brandLower = profile.brand_name.toLowerCase();
                
                // Check if AI mentions this organization
                if (aiResponseLower.includes(brandLower)) {
                  // Check KvK mismatch
                  if (aiResponseLower.includes('kvk')) {
                    const mentionsWrongKvK = /kvk[:\s-]*(\d{8})/gi.exec(aiResponseLower);
                    if (mentionsWrongKvK && mentionsWrongKvK[1] !== profile.kvk_number) {
                      console.error('🚨 ORG-PROFILE MISMATCH: Wrong KvK!', {
                        org: profile.brand_name,
                        correct_kvk: profile.kvk_number,
                        mentioned_kvk: mentionsWrongKvK[1],
                        question: lastUserMessage
                      });
                      
                      // Log as negative learning event
                      await supabaseServiceClient.from('ai_learning_events').insert({
                        event_type: 'org_profile_mismatch',
                        user_id: user.id,
                        org_id: userOrgId,
                        context: {
                          question: lastUserMessage,
                          ai_answer: fullResponse.substring(0, 500),
                          ground_truth: {
                            org: profile.brand_name,
                            kvk: profile.kvk_number
                          },
                          mismatch_type: 'kvk',
                          mentioned_kvk: mentionsWrongKvK[1]
                        },
                        learning_score: -0.8,
                        outcome: 'harmful'
                      });
                      
                      // ⚠️ Note: Conflict detection logged in ai_learning_events
                      // Use detect-and-resolve-conflicts function for manual conflict resolution
                    }
                  }
                  
                  // Check business type mismatch
                  const wrongTypes = ['zorginstelling', 'thuiszorg', 'zorgverlener', 'verpleeghuis', 'ziekenhuis'];
                  const correctType = (profile.business_type || '').toLowerCase();
                  
                  for (const wrongType of wrongTypes) {
                    if (aiResponseLower.includes(wrongType) && !correctType.includes(wrongType)) {
                      console.error('🚨 ORG-PROFILE MISMATCH: Wrong business type!', {
                        org: profile.brand_name,
                        correct_type: profile.business_type,
                        mentioned_type: wrongType,
                        question: lastUserMessage
                      });
                      
                      await supabaseServiceClient.from('ai_learning_events').insert({
                        event_type: 'org_profile_mismatch',
                        user_id: user.id,
                        org_id: userOrgId,
                        context: {
                          question: lastUserMessage,
                          ai_answer: fullResponse.substring(0, 500),
                          ground_truth: {
                            org: profile.brand_name,
                            business_type: profile.business_type
                          },
                          mismatch_type: 'business_type',
                          mentioned_type: wrongType
                        },
                        learning_score: -0.6,
                        outcome: 'harmful'
                      });
                    }
                  }
                }
              }
              
              console.log('✅ Org-profile mismatch detection complete');
            } catch (mismatchError) {
              console.error('❌ Org-profile mismatch detection failed (non-blocking):', mismatchError);
            }
          }
          
          // ✅ Send knowledge metadata to client for feedback tracking
          if (usedKnowledgeIds.length > 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              choices: [{
                delta: { 
                  content: '',
                  metadata: { usedKnowledge: usedKnowledgeIds }
                },
                index: 0
              }]
            })}\n\n`));
            console.log('📤 Sent knowledge metadata to client:', usedKnowledgeIds.length, 'items');
          }
          
          // ============================================
          // PERSISTENCE AFTER STREAMING (IN BACKGROUND)
          // ============================================
          // ✅ conversation_id is already validated early - safe to use
          const conversationId = conversation_id;
          console.log(`💾 Starting background persistence for conversation: ${conversationId}`);
          
          // Start background persistence (non-blocking)
          (async () => {
            await new Promise(r => setTimeout(r, 500)); // Wait for stream to complete
            
            try {
              const userId = user.id;
              const userMessage = messages[messages.length - 1];

              // 1️⃣ CRITICAL: Persist user message with retry (using service role client)
              const userResult = await persistMessage(supabaseServiceClient, {
                user_id: userId,
                org_id: userOrgId,
                conversation_id: conversationId,
                role: 'user',
                content: userMessage.content
              });

              if (!userResult.success) {
                console.error('❌ CRITICAL: User message not persisted!');
              }

              console.log('✅ User message persisted in background');

              // ============================================
              // FASE 2D: AI OUTPUT VALIDATION (Sensitive Data Leakage Prevention)
              // ============================================
              const outputValidation = validateAIOutput(fullResponse, { maxLength: 50000 });

              if (!outputValidation.valid) {
                console.warn(`⚠️ AI output validation failed:`, outputValidation.violations);
                
                // Log security event for sensitive data leakage attempts
                const hasSensitiveViolation = outputValidation.violations.some((v: string) => 
                  v.includes('API key') || v.includes('token') || v.includes('password') || v.includes('secret')
                );
                
                if (hasSensitiveViolation) {
                  try {
                    await supabaseServiceClient.from('system_events').insert({
                      event_type: 'security_alert',
                      severity: 'high',
                      title: '🔴 Sensitive Data Leakage Prevented in AI Output',
                      details: {
                        conversation_id: conversationId,
                        user_id: userId,
                        violations: outputValidation.violations,
                        original_length: fullResponse.length,
                      },
                    });
                    console.error('🚨 SECURITY: Sensitive data leakage attempt logged');
                  } catch (logError) {
                    console.error('Failed to log security event:', logError);
                  }
                }
                
                // Use sanitized version if available
                if (outputValidation.sanitizedOutput) {
                  fullResponse = outputValidation.sanitizedOutput;
                  console.log('✅ AI output sanitized, removed sensitive data');
                }
              }

              // ============================================
              // FASE 1: CACHE STORAGE (after streaming complete)
              // 🚫 EMPTY RESPONSE PROTECTION
              // ============================================
              try {
                // ✅ CRITICAL: Don't cache empty responses
                if (!fullResponse || fullResponse.trim().length === 0) {
                  console.error('🚫 CACHE SKIP: Empty response detected, NOT caching');
                } else if (fullResponse.length < 10) {
                  console.warn('🚫 CACHE SKIP: Response too short (<10 chars), NOT caching');
                } else {
                  await supabaseServiceClient.from('ai_response_cache').insert({
                    org_id: userOrgId,
                    question_hash: cacheKey,
                    question: lastUserMessageForCache,
                    response: fullResponse,
                    knowledge_ids: usedKnowledgeIds,
                    expires_at: new Date(Date.now() + CACHE_TTL_MINUTES * 60 * 1000).toISOString()
                  });
                  console.log(`✅ Response cached for ${CACHE_TTL_MINUTES}min (${fullResponse.length} chars, version: ${SYSTEM_PROMPT_VERSION})`);
                }
              } catch (cacheError) {
                console.warn('Cache insert failed (non-critical):', cacheError);
              }

              // 3️⃣ OPTIONAL: Conversation context (soft fail)
              if (usedKnowledgeIds.length > 0) {
                try {
                  await supabaseServiceClient.from('conversation_context').insert({
                    conversation_id: conversationId,
                    user_id: userId,
                    category: 'task_management_chat',
                    summary: userMessage.content.substring(0, 500),
                    key_points: {
                      used_knowledge_ids: usedKnowledgeIds,
                      response_length: fullResponse.length,
                      user_question: userMessage.content
                    }
                  });
                } catch (e) {
                  console.warn('Conversation context failed:', e);
                }
              }

              // 4️⃣ OPTIONAL: Learning event (soft fail)
              if (usedKnowledgeIds.length > 0) {
                try {
                  const responseConfidenceMatch = fullResponse.match(/\[(?:🟢|🟡|🟠|🔴)\s+(\d+)%/);
                  const responseConfidence = responseConfidenceMatch ? parseInt(responseConfidenceMatch[1]) / 100 : 0.75;
                  
                  await supabaseServiceClient.from('ai_learning_events').insert({
                    user_id: userId,
                    org_id: userOrgId || userId,
                    event_type: 'ai_response_generated',
                    context: {
                      question: userMessage.content,
                      usedKnowledge: usedKnowledgeIds.map(id => ({ id })),
                      conversation_id: conversationId,
                      confidence: responseConfidence
                    },
                    ai_response: { content: fullResponse.substring(0, 1000) },
                    outcome: 'success'
                  });
                } catch (e) {
                  console.warn('Learning event failed:', e);
                }
              }

              console.log(`✅ ALL PERSISTENCE COMPLETE for conversation ${conversationId}`);
            } catch (error) {
              console.error('❌ Background persistence error:', error);
            }
          })();
          
          // ✅ IMMEDIATELY persist assistant message to get messageId
          const userId = user.id;
          let assistantMessageId: string | undefined;
          
          try {
            const assistantResult = await persistMessage(supabaseServiceClient, {
              user_id: userId,
              org_id: userOrgId,
              conversation_id: conversation_id,
              role: 'assistant',
              content: fullResponse,
              metadata: {
                feedback_enabled: true,
                knowledge_ids_for_feedback: usedKnowledgeIds
              }
            });
            
            if (assistantResult.success && assistantResult.messageId) {
              assistantMessageId = assistantResult.messageId;
              console.log('✅ Assistant message persisted immediately, id:', assistantMessageId);
            }
          } catch (e) {
            console.error('❌ Failed to persist assistant message immediately:', e);
          }
          
          // Send usedKnowledge + messageId metadata to client for feedback tracking
          if (usedKnowledgeIds.length > 0 || assistantMessageId) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              choices: [{
                delta: { 
                  metadata: { 
                    usedKnowledge: usedKnowledgeIds,
                    messageId: assistantMessageId
                  } 
                },
                index: 0
              }]
            })}\n\n`));
            console.log('📤 Sent metadata to client:', { knowledgeCount: usedKnowledgeIds.length, messageId: assistantMessageId });
          }
          
          // 🧠 CONTINUOUS LEARNER: Background analysis (fire-and-forget)
          try {
            console.log('🧠 [PRE-CLOSE] Triggering continuous-learner...');
            const lastUserMessage = messages[messages.length - 1];
            
            // Fire-and-forget: don't await, just let promise run
            supabaseServiceClient.functions.invoke('continuous-learner', {
              body: {
                user_question: lastUserMessage.content,
                ai_response: fullResponse,
                knowledge_used: usedKnowledgeIds,
                conversation_id: conversationId,
                auto_apply: true
              }
            }).then((res) => {
              if (res.error) {
                console.error('❌ Continuous learner error:', res.error);
              } else {
                console.log('✅ Continuous learner complete:', res.data);
              }
            }).catch(err => {
              console.error('❌ Continuous learner exception:', err);
            });
            
            console.log('🧠 Continuous learner call initiated (fire-and-forget)');
          } catch (error) {
            console.error('❌ Failed to initiate continuous-learner:', error);
          }
          
          // 🔄 IMPLICIT FEEDBACK: Detect rapid reformulations as negative feedback
          try {
            const lastUserMessage = messages[messages.length - 1];
            
            // Check for previous assistant messages in same conversation
            const { data: recentMessages } = await supabaseServiceClient
              .from('ai_chat_messages')
              .select('id, created_at, used_knowledge, content')
              .eq('conversation_id', conversationId)
              .eq('role', 'assistant')
              .order('created_at', { ascending: false })
              .limit(2);
            
            if (recentMessages && recentMessages.length >= 2) {
              const previousAssistant = recentMessages[1]; // Second most recent
              const timeDiff = Date.now() - new Date(previousAssistant.created_at).getTime();
              
              // If user sent another message within 30 seconds AND previous had knowledge
              if (timeDiff < 30000 && previousAssistant.used_knowledge?.length > 0) {
                console.log('🔄 [IMPLICIT FEEDBACK] Detected rapid reformulation, triggering harmful feedback...');
                
                // Fire-and-forget implicit negative feedback
                supabaseServiceClient.functions.invoke('unified-learner', {
                  body: {
                    action: 'process_feedback',
                    batch_mode: false,
                    knowledge_ids: previousAssistant.used_knowledge,
                    feedback_type: 'harmful',
                    message_context: `Implicit: user reformulated question within ${Math.round(timeDiff / 1000)}s`,
                    org_id: userOrgId,
                    user_id: user.id,
                    implicit: true
                  }
                }).then((res) => {
                  if (res.error) {
                    console.error('❌ Implicit feedback error:', res.error);
                  } else {
                    console.log('✅ Implicit negative feedback processed:', res.data);
                  }
                }).catch(err => {
                  console.warn('⚠️ Implicit feedback failed (non-blocking):', err);
                });
              }
            }
          } catch (implicitError) {
            console.warn('⚠️ Implicit feedback detection failed (non-blocking):', implicitError);
          }
          
          controller.close();
          
          // ⏱️ Calculate total execution time and component timings
          perfTimers.total = Date.now() - perfTimers.start;
          perfTimers.aiCall = perfTimers.total - perfTimers.embedding - perfTimers.semanticSearch;
          
          // ⚡ Fast Path performance logging
          if (useFastPath) {
            const fastPathDuration = Date.now() - fastPathStartTime;
            console.log(`⚡ FAST PATH COMPLETED in ${fastPathDuration}ms (${Math.round((fastPathDuration / perfTimers.total) * 100)}% of total time)`);
            console.log(`📊 Speed improvement: ${perfTimers.total < 1500 ? '✅ Target <1.5s achieved!' : `⚠️ ${perfTimers.total}ms (target: <1500ms)`}`);
          }
          
          console.log(`⏱️ Total request time: ${perfTimers.total}ms`, {
            embedding: perfTimers.embedding,
            semanticSearch: perfTimers.semanticSearch,
            aiCall: perfTimers.aiCall,
            knowledgeItemsUsed: usedKnowledgeIds.length,
            fastPath: useFastPath
          });
          
          // Log function call for analytics
          const executionTime = Date.now() - startTime;
          const inputTokens = Math.floor(JSON.stringify(messages).length / 4);
          const outputTokens = Math.floor(fullResponse.length / 4);
          const totalTokens = inputTokens + outputTokens;
          const estimatedCost = (inputTokens * 0.000001) + (outputTokens * 0.000002); // EUR for gemini-2.5-flash
          
          try {
            const { data: orgData } = await supabaseClient
              .from('user_organizations')
              .select('org_id')
              .eq('user_id', user.id)
              .single();
            
            if (orgData?.org_id) {
              await supabaseClient.from('function_call_logs').insert({
                org_id: orgData.org_id,
                user_id: user.id,
                function_name: 'ai-chat',
                success: true,
                execution_time_ms: perfTimers.total,
                model_used: 'google/gemini-2.5-flash',
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                total_tokens: totalTokens,
                estimated_cost_eur: estimatedCost,
                metadata: {
                  embedding_time_ms: perfTimers.embedding,
                  search_time_ms: perfTimers.semanticSearch,
                  ai_time_ms: perfTimers.aiCall,
                  knowledge_items: usedKnowledgeIds.length
                }
              });
            }
          } catch (logError) {
            console.error('Failed to log function call:', logError);
            // Don't fail the request if logging fails
          }
        } catch (error) {
          console.error("Stream processing error:", error);
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });

  } catch (error) {
    console.error('AI chat error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Note: Deno.serve() wraps around serve() - this file uses a complex streaming pattern
