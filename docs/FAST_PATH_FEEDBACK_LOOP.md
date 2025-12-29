# Fast Path Feedback Loop - Technische Documentatie

## Overzicht

De Fast Path is een optimalisatie in de AI Chat die simpele count-queries direct beantwoordt zonder het volledige AI model te raadplegen. Dit resulteert in responstijden van <100ms in plaats van 2-5 seconden.

## Architectuur

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   ChatWidget    │────▶│    ai-chat       │────▶│   Database      │
│  (Frontend)     │     │  (Edge Function) │     │   COUNT(*)      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                        │
        │                        ▼
        │               ┌──────────────────┐
        │               │ fast_path_usage  │
        │               │     _log         │
        │               └──────────────────┘
        │
        ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ MessageFeedback │────▶│ process-feedback │────▶│ fast_path_      │
│  (Frontend)     │     │  (Edge Function) │     │   patterns      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Pattern Types

### 1. Hardcoded Patterns (Code)
Ingebouwde patterns in `ai-chat/index.ts` voor bekende query-structuren:

```typescript
const FAST_PATH_PATTERNS = [
  { pattern: /hoeveel\s+(ggz\s+)?werklocaties/i, table: 'client_sublocations', filter: { sector: 'GGZ' } },
  { pattern: /hoeveel\s+professionals/i, table: 'professionals', filter: null },
  // etc.
];
```

**Kenmerken:**
- Altijd actief (fallback)
- Worden opgezocht in database voor `patternId` matching
- Als database entry gevonden → feedback wordt verwerkt

### 2. Hardcoded Patterns (Migrated to Database)
Alle hardcoded patterns zijn gemigreerd naar de `fast_path_patterns` tabel met `source = 'hardcoded_backup'`.

**Voordelen:**
- ✅ Profiteren nu van de feedback loop (confidence updates)
- ✅ Popularity tracking via `usage_count`, `helpful_count`, `harmful_count`
- ✅ Kunnen gedeactiveerd worden via database zonder code deploy
- ✅ Unified analytics over alle Fast Path patterns

**Matching logica:**
1. Hardcoded pattern matcht in code
2. Database lookup voor corresponderende `hardcoded_backup` entry
3. Als gevonden → `patternId` wordt meegestuurd in metadata
4. Feedback verwerkt confidence scores in database

### 3. Learned Patterns (Dynamic)
Automatisch geleerd via `learn-fast-path-patterns` edge function:

**Database tabel:** `fast_path_patterns`

| Kolom | Type | Beschrijving |
|-------|------|--------------|
| id | uuid | Pattern ID |
| keywords | text[] | Geëxtraheerde keywords |
| table_name | text | Target database tabel |
| filters | jsonb | Query filters |
| response_template | text | Antwoord template |
| confidence_score | numeric | 0.0 - 1.0 |
| is_active | boolean | Actief voor gebruik |
| helpful_count | int | Positieve feedback teller |
| harmful_count | int | Negatieve feedback teller |

**Activatie regels:**
- Start met `confidence_score = 0.70` en `is_active = false`
- Elke "helpful" feedback: `confidence_score += 0.05`
- Elke "harmful" feedback: `confidence_score -= 0.10`
- Pattern wordt `is_active = true` wanneer `confidence_score >= 0.85`
- Pattern wordt gedeactiveerd wanneer `confidence_score < 0.50`

## Feedback Flow

### Stap 1: Query Executie
Wanneer een Fast Path query wordt uitgevoerd, wordt dit gelogd:

```sql
INSERT INTO fast_path_usage_log (
  org_id, user_id, query_text, table_name, 
  filters, result_count, response_time_ms, is_hardcoded
) VALUES (...);
```

### Stap 2: SSE Response met Metadata
De response bevat Fast Path metadata:

```typescript
{
  type: 'done',
  content: '⚡ Er zijn 47 GGZ werklocaties.',
  fastPath: {
    used: true,
    table: 'client_sublocations',
    count: 47,
    responseTimeMs: 45,
    logId: 'uuid-here',
    patternId: 'uuid-or-null'
  }
}
```

### Stap 3: Frontend Feedback
`MessageFeedback.tsx` vangt feedback op en stuurt naar `process-feedback`:

```typescript
const response = await supabase.functions.invoke('process-feedback', {
  body: {
    messageId,
    feedback: 'helpful' | 'harmful',
    context: {
      isFastPath: true,
      fastPathLogId: 'uuid',
      patternId: 'uuid-or-null'
    }
  }
});
```

### Stap 4: Feedback Processing
`process-feedback/index.ts` verwerkt de feedback:

1. Update `fast_path_usage_log.feedback_type`
2. Als `patternId` aanwezig:
   - Verhoog/verlaag `helpful_count`/`harmful_count`
   - Herbereken `confidence_score`
   - Activeer/deactiveer pattern indien drempel bereikt
3. Sla op in `message_feedback` met Fast Path metadata

### Stap 5: Pattern Learning
`learn-fast-path-patterns` (scheduled of on-demand):

1. Analyseer succesvolle queries in `fast_path_usage_log`
2. Groepeer vergelijkbare queries
3. Extraheer keywords, filters, response templates
4. Creëer nieuwe patterns of versterk bestaande

## Database Schema

### fast_path_usage_log
```sql
CREATE TABLE fast_path_usage_log (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  user_id uuid,
  query_text text NOT NULL,
  table_name text NOT NULL,
  filters jsonb,
  result_count integer,
  response_time_ms integer,
  is_hardcoded boolean DEFAULT true,
  pattern_id uuid REFERENCES fast_path_patterns(id),
  feedback_type text, -- 'helpful' | 'harmful' | null
  feedback_at timestamptz,
  created_at timestamptz DEFAULT now()
);
```

### fast_path_patterns
```sql
CREATE TABLE fast_path_patterns (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  keywords text[] NOT NULL,
  table_name text NOT NULL,
  filters jsonb,
  response_template text NOT NULL,
  confidence_score numeric DEFAULT 0.70,
  is_active boolean DEFAULT false,
  helpful_count integer DEFAULT 0,
  harmful_count integer DEFAULT 0,
  usage_count integer DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### message_feedback (Fast Path columns)
```sql
ALTER TABLE message_feedback ADD COLUMN
  is_fast_path boolean DEFAULT false,
  fast_path_log_id uuid REFERENCES fast_path_usage_log(id),
  pattern_id uuid REFERENCES fast_path_patterns(id);
```

## Confidence Score Formule

```typescript
const CONFIDENCE_RULES = {
  initial_confidence: 0.70,
  helpful_boost: 0.05,
  harmful_penalty: 0.10,
  activation_threshold: 0.85,
  deactivation_threshold: 0.50,
  prune_threshold: 0.30
};

function updateConfidence(pattern, feedbackType) {
  let newScore = pattern.confidence_score;
  
  if (feedbackType === 'helpful') {
    newScore += CONFIDENCE_RULES.helpful_boost;
    pattern.helpful_count++;
  } else if (feedbackType === 'harmful') {
    newScore -= CONFIDENCE_RULES.harmful_penalty;
    pattern.harmful_count++;
  }
  
  // Clamp between 0 and 1
  newScore = Math.max(0, Math.min(1, newScore));
  
  // Update active status
  if (newScore >= CONFIDENCE_RULES.activation_threshold) {
    pattern.is_active = true;
  } else if (newScore < CONFIDENCE_RULES.deactivation_threshold) {
    pattern.is_active = false;
  }
  
  return newScore;
}
```

## Testing Checklist

- [ ] Hardcoded pattern detectie werkt
- [ ] Fast Path indicator (⚡) zichtbaar in chat
- [ ] Feedback knoppen verschijnen voor Fast Path responses
- [ ] `fast_path_usage_log.feedback_type` wordt bijgewerkt
- [ ] `message_feedback.is_fast_path = true` voor Fast Path feedback
- [ ] Learned pattern `helpful_count` verhoogt bij positieve feedback
- [ ] Learned pattern `confidence_score` update correct
- [ ] Pattern activeert bij `confidence_score >= 0.85`
- [ ] Pattern deactiveert bij `confidence_score < 0.50`

## Monitoring Queries

### Fast Path Success Rate
```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_queries,
  COUNT(*) FILTER (WHERE feedback_type = 'helpful') as helpful,
  COUNT(*) FILTER (WHERE feedback_type = 'harmful') as harmful,
  ROUND(
    COUNT(*) FILTER (WHERE feedback_type = 'helpful')::numeric / 
    NULLIF(COUNT(*) FILTER (WHERE feedback_type IS NOT NULL), 0) * 100, 
    1
  ) as success_rate
FROM fast_path_usage_log
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### Pattern Performance
```sql
SELECT 
  id,
  keywords,
  table_name,
  confidence_score,
  is_active,
  helpful_count,
  harmful_count,
  usage_count,
  ROUND(
    helpful_count::numeric / NULLIF(helpful_count + harmful_count, 0) * 100, 
    1
  ) as approval_rate
FROM fast_path_patterns
ORDER BY usage_count DESC;
```

## Troubleshooting

### Fast Path wordt niet gedetecteerd
1. Check of query matcht met hardcoded patterns in `ai-chat/index.ts`
2. Verifieer dat learned patterns `is_active = true` hebben
3. Check `confidence_score >= 0.85` voor activatie

### Feedback wordt niet opgeslagen
1. Verifieer dat `process-feedback` edge function deployed is
2. Check dat `fastPathLogId` correct wordt doorgegeven
3. Bekijk edge function logs voor errors

### Pattern activeert niet
1. Check `helpful_count` - minimaal 3 nodig voor activatie
2. Verifieer `confidence_score` berekening
3. Check voor negatieve feedback die score verlaagt

## Versie Geschiedenis

| Versie | Datum | Wijzigingen |
|--------|-------|-------------|
| 1.0.0 | 2025-12-29 | Initiële implementatie met hardcoded patterns |
| 1.1.0 | 2025-12-29 | Learned patterns en feedback loop toegevoegd |
| 1.2.0 | 2025-12-29 | Fast Path metadata in message_feedback |
| 1.3.0 | 2025-12-29 | Hardcoded patterns gemigreerd naar database (source=hardcoded_backup), nu met patternId matching |
