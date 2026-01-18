# Data Naming Conventions

This document defines the naming conventions used throughout the recruitment system to ensure consistency between database, API, and frontend layers.

## Candidate Name Convention

### Data Flow

```
Database (source)     →    Views/API (alias)    →    Frontend (display)
extracted_data->>'naam'    candidate_name            candidate_name
```

### Rationale

The internal Dutch field name `naam` (stored in `extracted_data` JSONB) is mapped to `candidate_name` at API boundaries for:

1. **Clarity in tool parameters** - English naming convention for AI agent tools
2. **Consistency** - Matches `candidate_email` field naming pattern
3. **Semantic clarity** - AI agents understand `candidate_name` better than `naam`

### Implementation Details

| Layer | Field Name | Example |
|-------|-----------|---------|
| Database Table | `extracted_data->>'naam'` | `professional_applications` |
| Database View | `candidate_name` | `pending_reviews_with_details` |
| Edge Functions | `extracted_data?.naam` (internal) / `params.candidate_name` (API) | `agent-screening/index.ts` |
| Frontend Types | `candidate_name` | `src/types/recruitment.ts` |
| Tool Registry | `candidate_name` | `_shared/tool-registry.ts` |

### Database Views

The `pending_reviews_with_details` view correctly maps the field:

```sql
SELECT 
  COALESCE(
    pa.extracted_data->>'naam',
    pa.email_from
  ) AS candidate_name
FROM professional_applications pa
```

### Edge Function Pattern

Edge functions query `extracted_data` from the database but expose `candidate_name` in their API responses:

```typescript
// Query internal field
const { data } = await supabase
  .from('professional_applications')
  .select('extracted_data')
  .eq('id', applicationId);

// Use internal field
const name = data?.extracted_data?.naam || 'Kandidaat';

// Expose as candidate_name in API response
return { candidate_name: name };
```

### Frontend Types

Central types are defined in `src/types/recruitment.ts`:

```typescript
export interface CandidateIdentifier {
  candidate_name: string;
  candidate_email: string;
  application_id: string;
}
```

## Other Conventions

### Candidate Email

| Source | Field |
|--------|-------|
| Database | `extracted_data->>'email'` OR `email_from` |
| API | `candidate_email` |

### Pipeline Stages

Dutch stage names are used throughout:
- `nieuw` - New application
- `intake_verstuurd` - Intake sent
- `docs_compleet` - Documents complete
- `gesprek_gepland` - Interview scheduled
- `screening` - Screening in progress
- `goedgekeurd` - Approved
- `geplaatst` - Placed

### Document Types

- `cv` - Curriculum Vitae
- `diploma` - Educational diploma
- `vog` - Verklaring Omtrent Gedrag
- `id` - Identification document
- `kvk` - KvK uittreksel (for ZZP)

## Related Files

- `src/types/recruitment.ts` - Central type definitions
- `supabase/functions/_shared/tool-registry.ts` - AI agent tool parameters
- Database migrations - View definitions
