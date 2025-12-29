// Learn Fast Path Patterns - Analyzes successful queries and learns new patterns
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

interface PatternCandidate {
  keywords: string[];
  table_name: string;
  filters: Array<{
    column: string;
    operator: 'eq' | 'ilike' | 'contains';
    value_index: number;
  }>;
  response_template: string;
  learned_from_query: string;
  occurrence_count: number;
  success_rate: number;
}

// Normalize query for comparison
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/[?!.,;:'"]/g, '')
    .replace(/\s+/g, ' ');
}

// Generate hash for query deduplication
function hashQuery(query: string): string {
  const normalized = normalizeQuery(query);
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// Extract keywords from query
function extractKeywords(query: string): string[] {
  const normalized = normalizeQuery(query);
  const words = normalized.split(' ').filter(w => w.length > 2);
  
  // Remove common stop words
  const stopWords = ['het', 'een', 'van', 'de', 'en', 'in', 'op', 'met', 'voor', 'zijn', 'er', 'die', 'dat', 'aan', 'bij', 'uit', 'als', 'naar', 'ook', 'nog', 'maar', 'wel', 'niet', 'wat', 'wie', 'hoe', 'waar', 'wanneer', 'waarom'];
  
  return words.filter(w => !stopWords.includes(w));
}

// Detect if query is a count pattern
function isCountQuery(query: string): boolean {
  const countPatterns = [
    /^(hoeveel|tel|aantal|count)/i,
    /\b(totaal|som)\b.*\b(aantal|hoeveel)\b/i
  ];
  return countPatterns.some(p => p.test(query));
}

// Detect table from query keywords
function detectTable(query: string): string | null {
  const tableKeywords: Record<string, string[]> = {
    'client_sublocations': ['werklocatie', 'werklocaties', 'locatie', 'locaties', 'vestiging', 'vestigingen', 'afdeling', 'afdelingen'],
    'professionals': ['professional', 'professionals', 'zzp', 'zzper', 'zzpers', 'uitzendkracht', 'uitzendkrachten', 'medewerker', 'medewerkers'],
    'professional_applications': ['sollicitatie', 'sollicitaties', 'aanmelding', 'aanmeldingen', 'applicatie', 'applicaties'],
    'assignments': ['plaatsing', 'plaatsingen', 'opdracht', 'opdrachten', 'toewijzing', 'toewijzingen'],
    'vacancies': ['vacature', 'vacatures', 'functie', 'functies', 'openstaand', 'openstaande'],
    'client_organizations': ['organisatie', 'organisaties', 'klant', 'klanten', 'opdrachtgever', 'opdrachtgevers']
  };
  
  const normalized = normalizeQuery(query);
  
  for (const [table, keywords] of Object.entries(tableKeywords)) {
    if (keywords.some(kw => normalized.includes(kw))) {
      return table;
    }
  }
  
  return null;
}

// Detect filter columns from query
function detectFilters(query: string, table: string): PatternCandidate['filters'] {
  const filters: PatternCandidate['filters'] = [];
  const normalized = normalizeQuery(query);
  const words = normalized.split(' ');
  
  // Sector detection (GGZ, VVT, GHZ, etc.)
  const sectors = ['ggz', 'vvt', 'ghz', 'jeugdzorg', 'ouderenzorg'];
  for (let i = 0; i < words.length; i++) {
    if (sectors.includes(words[i])) {
      filters.push({ column: 'sector', operator: 'contains', value_index: i });
      break;
    }
  }
  
  // Doelgroep detection (LVB, Autisme, NAH, etc.)
  const doelgroepen = ['lvb', 'autisme', 'psychiatrie', 'nah', 'emb', 'verslaving', 'dementie'];
  for (let i = 0; i < words.length; i++) {
    if (doelgroepen.includes(words[i])) {
      filters.push({ column: 'doelgroep', operator: 'contains', value_index: i });
      break;
    }
  }
  
  // Location detection (in <plaats>)
  const inIndex = words.findIndex(w => w === 'in');
  if (inIndex !== -1 && inIndex < words.length - 1) {
    const nextWord = words[inIndex + 1];
    // Check if it's a known province
    const provinces = ['gelderland', 'noord-holland', 'zuid-holland', 'utrecht', 'brabant', 'noord-brabant', 'limburg', 'overijssel', 'flevoland', 'friesland', 'groningen', 'drenthe', 'zeeland'];
    if (provinces.includes(nextWord)) {
      filters.push({ column: 'provincie', operator: 'ilike', value_index: inIndex + 1 });
    } else {
      // Assume it's a city
      filters.push({ column: 'plaats', operator: 'ilike', value_index: inIndex + 1 });
    }
  }
  
  return filters;
}

// Generate response template
function generateResponseTemplate(table: string, filters: PatternCandidate['filters']): string {
  const tableEmojis: Record<string, string> = {
    'client_sublocations': '📍',
    'professionals': '👥',
    'professional_applications': '📋',
    'assignments': '✅',
    'vacancies': '💼',
    'client_organizations': '🏢'
  };
  
  const tableNames: Record<string, string> = {
    'client_sublocations': 'werklocaties',
    'professionals': 'professionals',
    'professional_applications': 'sollicitaties',
    'assignments': 'plaatsingen',
    'vacancies': 'vacatures',
    'client_organizations': 'organisaties'
  };
  
  const emoji = tableEmojis[table] || '📊';
  const name = tableNames[table] || 'items';
  
  let template = `${emoji} Er zijn **{{count}}** ${name}`;
  
  if (filters.length > 0) {
    template += ' met de opgegeven filters';
  }
  
  template += '.';
  
  return template;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();
  
  try {
    const body = await req.json().catch(() => ({}));
    const daysBack = body.days_back ?? 7;
    const minOccurrences = body.min_occurrences ?? 3;
    const minSuccessRate = body.min_success_rate ?? 0.8;
    const orgId = body.org_id ?? '550e8400-e29b-41d4-a716-446655440000';
    
    console.log(`🧠 [LEARN FAST PATH] Starting analysis for last ${daysBack} days...`);
    
    const supabase = createAdminClient();
    
    // 1. Analyze successful Fast Path queries from usage log
    const { data: usageLogs, error: usageError } = await supabase
      .from('fast_path_usage_log')
      .select('*')
      .eq('org_id', orgId)
      .eq('success', true)
      .is('pattern_id', null) // Not yet associated with a dynamic pattern
      .gte('created_at', new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(500);
    
    if (usageError) {
      console.error('❌ Failed to fetch usage logs:', usageError);
      throw usageError;
    }
    
    console.log(`📊 Found ${usageLogs?.length || 0} successful unassociated queries`);
    
    // 2. Group by normalized query and count occurrences
    const queryGroups = new Map<string, { 
      queries: typeof usageLogs; 
      count: number;
      successCount: number;
      errorCount: number;
    }>();
    
    for (const log of usageLogs || []) {
      const hash = hashQuery(log.user_query);
      const existing = queryGroups.get(hash) || { queries: [], count: 0, successCount: 0, errorCount: 0 };
      existing.queries.push(log);
      existing.count++;
      if (log.success) existing.successCount++;
      else existing.errorCount++;
      queryGroups.set(hash, existing);
    }
    
    // 3. Filter groups with enough occurrences
    const candidates: PatternCandidate[] = [];
    
    for (const [hash, group] of queryGroups) {
      if (group.count < minOccurrences) continue;
      
      const successRate = group.successCount / group.count;
      if (successRate < minSuccessRate) continue;
      
      const sampleQuery = group.queries[0].user_query;
      
      // Only process count queries
      if (!isCountQuery(sampleQuery)) continue;
      
      const table = detectTable(sampleQuery);
      if (!table) continue;
      
      const keywords = extractKeywords(sampleQuery);
      if (keywords.length < 2) continue;
      
      const filters = detectFilters(sampleQuery, table);
      const responseTemplate = generateResponseTemplate(table, filters);
      
      candidates.push({
        keywords,
        table_name: table,
        filters,
        response_template: responseTemplate,
        learned_from_query: sampleQuery,
        occurrence_count: group.count,
        success_rate: successRate
      });
    }
    
    console.log(`🎯 Found ${candidates.length} pattern candidates`);
    
    // 4. Check for existing patterns and create/update
    let created = 0;
    let updated = 0;
    let skipped = 0;
    
    for (const candidate of candidates) {
      // Check if similar pattern exists
      const { data: existing } = await supabase
        .from('fast_path_patterns')
        .select('id, confidence_score, usage_count')
        .eq('org_id', orgId)
        .eq('table_name', candidate.table_name)
        .contains('keywords', candidate.keywords.slice(0, 3))
        .is('deleted_at', null)
        .limit(1)
        .single();
      
      if (existing) {
        // Reinforce existing pattern
        const newConfidence = Math.min(1, existing.confidence_score + 0.05);
        
        await supabase
          .from('fast_path_patterns')
          .update({
            confidence_score: newConfidence,
            usage_count: existing.usage_count + candidate.occurrence_count,
            updated_at: new Date().toISOString(),
            // Activate if confidence reaches threshold
            is_active: newConfidence >= 0.85
          })
          .eq('id', existing.id);
        
        updated++;
        console.log(`🔄 Reinforced pattern ${existing.id} (confidence: ${newConfidence.toFixed(2)})`);
      } else {
        // Create new pattern candidate with higher initial confidence (0.70)
        const { data: newPattern, error: createError } = await supabase
          .from('fast_path_patterns')
          .insert({
            org_id: orgId,
            pattern_type: 'count',
            table_name: candidate.table_name,
            count_column: 'id',
            keywords: candidate.keywords,
            filters: candidate.filters,
            active_filter: ['client_sublocations', 'professionals'].includes(candidate.table_name),
            response_template: candidate.response_template,
            confidence_score: 0.70, // 🆕 Verhoogd naar 0.70 (was 0.60) - 2-3 positieve feedbacks kunnen activeren
            usage_count: candidate.occurrence_count,
            success_count: candidate.occurrence_count,
            helpful_count: 0,
            harmful_count: 0,
            is_active: false, // Not active until confidence >= 0.85
            source: 'auto_learned',
            learned_from_query: candidate.learned_from_query
          })
          .select('id')
          .single();
        
        if (createError) {
          console.error(`❌ Failed to create pattern:`, createError);
          skipped++;
        } else {
          created++;
          console.log(`✨ Created new pattern candidate: ${newPattern.id}`);
        }
      }
    }
    
    // 5. Also check for patterns to promote (from chat analysis)
    const { data: lowConfidencePatterns } = await supabase
      .from('fast_path_patterns')
      .select('id, confidence_score, usage_count, success_count, error_count')
      .eq('org_id', orgId)
      .eq('is_active', false)
      .gte('confidence_score', 0.85)
      .is('deleted_at', null);
    
    let promoted = 0;
    for (const pattern of lowConfidencePatterns || []) {
      if (pattern.success_count >= 5 && pattern.error_count === 0) {
        await supabase
          .from('fast_path_patterns')
          .update({ is_active: true, updated_at: new Date().toISOString() })
          .eq('id', pattern.id);
        promoted++;
        console.log(`🚀 Promoted pattern ${pattern.id} to active`);
      }
    }
    
    const duration = Date.now() - startTime;
    
    // Log the run
    await supabase
      .from('function_call_logs')
      .insert({
        function_name: 'learn-fast-path-patterns',
        duration_ms: duration,
        success: true,
        metadata: {
          days_back: daysBack,
          usage_logs_analyzed: usageLogs?.length || 0,
          candidates_found: candidates.length,
          created,
          updated,
          skipped,
          promoted
        }
      });
    
    console.log(`✅ Learning complete in ${duration}ms: ${created} created, ${updated} updated, ${promoted} promoted, ${skipped} skipped`);
    
    return jsonResponse({
      success: true,
      duration_ms: duration,
      usage_logs_analyzed: usageLogs?.length || 0,
      candidates_found: candidates.length,
      patterns: {
        created,
        updated,
        promoted,
        skipped
      }
    });
    
  } catch (error) {
    console.error('❌ Learn Fast Path error:', error);
    return errorResponse(error instanceof Error ? error.message : String(error));
  }
});
