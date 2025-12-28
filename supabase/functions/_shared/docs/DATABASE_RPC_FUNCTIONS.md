# Database RPC Functions Reference

This document provides comprehensive documentation for the Supabase RPC functions used in the AI knowledge base system.

## Table of Contents

- [match_knowledge()](#match_knowledge)
- [increment_usage_count()](#increment_usage_count)
- [Helper Functions](#helper-functions)

---

## match_knowledge()

Semantic search function for the AI knowledge base using vector embeddings. Three versions exist with increasing functionality.

### Function Signatures

#### Version 1: Simple Match (4 params)

Basic semantic search without advanced filtering.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query_embedding` | `vector(1536)` | *required* | 1536-dimensional embedding vector from OpenAI |
| `match_threshold` | `double precision` | `0.7` | Minimum cosine similarity score (0.0-1.0) |
| `match_count` | `integer` | `50` | Maximum number of results to return |
| `filter_org_id` | `uuid` | `NULL` | Limit results to specific organization |

**Returns:**

| Column | Type | Description |
|--------|------|-------------|
| `knowledge_id` | `uuid` | Unique identifier of the knowledge item |
| `category` | `text` | Knowledge category (e.g., 'wetgeving', 'cao') |
| `key` | `text` | Knowledge key/title |
| `value` | `jsonb` | Full knowledge content |
| `confidence_score` | `numeric` | Source confidence (0.0-1.0) |
| `similarity` | `double precision` | Cosine similarity to query (0.0-1.0) |

---

#### Version 2: Extended Match (7 params)

Adds role-based filtering and jurisdiction support.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query_embedding` | `vector(1536)` | *required* | 1536-dimensional embedding vector |
| `match_threshold` | `double precision` | `0.7` | Minimum similarity score |
| `match_count` | `integer` | `50` | Maximum results |
| `filter_org_id` | `uuid` | `NULL` | Organization filter |
| `filter_role_tags` | `text[]` | `NULL` | Filter by user roles (e.g., `ARRAY['planner', 'recruiter']`) |
| `filter_customer_id` | `uuid` | `NULL` | Limit to specific client |
| `filter_jurisdiction` | `text` | `'NL'` | Legal jurisdiction filter |

**Additional Returns:**

| Column | Type | Description |
|--------|------|-------------|
| `role_tags` | `text[]` | Applicable roles for this knowledge |
| `valid_from` | `date` | Start date of validity period |
| `valid_to` | `date` | End date of validity period (NULL = indefinite) |

---

#### Version 3: Production Match (9 params) ⭐ RECOMMENDED

Full-featured search with verification status and shared knowledge control.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query_embedding` | `vector(1536)` | *required* | 1536-dimensional embedding vector |
| `match_threshold` | `double precision` | `0.7` | Minimum similarity score |
| `match_count` | `integer` | `50` | Maximum results |
| `filter_org_id` | `uuid` | `NULL` | Organization filter |
| `filter_role_tags` | `text[]` | `NULL` | Role-based filter |
| `filter_customer_id` | `uuid` | `NULL` | Client filter |
| `filter_jurisdiction` | `text` | `'NL'` | Jurisdiction filter |
| `require_verified` | `boolean` | `true` | Only return verified knowledge items |
| `include_shared` | `boolean` | `true` | Include shared knowledge (wetgeving, CAO, compliance) |

**Additional Returns:**

| Column | Type | Description |
|--------|------|-------------|
| `validation_status` | `text` | Verification status ('verified', 'pending', 'rejected') |
| `is_shared` | `boolean` | Whether this is shared cross-organization knowledge |

---

### Important Behavior

#### 1. Shared Knowledge (`include_shared`)

When `include_shared = true`:
- Returns items where `is_shared = true` **regardless** of `filter_org_id`
- Ensures compliance-critical knowledge (wetgeving, CAO, BIG-register) is always available
- This is the **recommended default** for user-facing AI responses

When `include_shared = false`:
- Only returns organization-specific knowledge
- Use for health checks, analytics, or org-specific queries

#### 2. Cosine Similarity Calculation

```sql
similarity = 1 - (embedding <=> query_embedding)
```

- Uses pgvector's `<=>` operator for cosine distance
- Results are ordered by similarity DESC (highest first)

#### 3. Security & Access Control

- Uses `has_acl_access(auth.uid(), acl)` for row-level access control
- Respects the `acl` JSONB field on each knowledge item
- Empty ACL (`[]`) means accessible to all authenticated users

#### 4. Validity Period Filtering

- Uses `is_knowledge_valid(valid_from, valid_to)` helper
- Only returns knowledge where `valid_from <= CURRENT_DATE`
- Excludes expired knowledge where `valid_to < CURRENT_DATE`

#### 5. Soft Delete Handling

- Automatically excludes items where `deleted_at IS NOT NULL`

---

### Usage Examples

#### Production Query (Recommended)

```typescript
import { supabase } from "@/integrations/supabase/client";

const { data, error } = await supabase.rpc('match_knowledge', {
  query_embedding: embedding,      // 1536-dim vector from OpenAI
  match_threshold: 0.65,           // Lower = more results, less precise
  match_count: 20,                 // Limit for performance
  filter_org_id: orgId,            // User's organization UUID
  filter_role_tags: ['recruiter'], // Optional: filter by role
  require_verified: true,          // Only verified knowledge
  include_shared: true             // ⭐ Include wetgeving, CAO, etc.
});

// Process results
const matches = data?.map(item => ({
  id: item.knowledge_id,
  content: item.value,
  score: item.similarity,
  isShared: item.is_shared
}));
```

#### Health Check (Minimal)

```typescript
// Use for RPC connectivity testing - NOT for user queries
const { data, error } = await supabase.rpc('match_knowledge', {
  query_embedding: dummyEmbedding,
  match_threshold: 0.99,           // High threshold = expect no matches
  match_count: 1,
  filter_org_id: orgId,
  include_shared: false            // Skip shared for speed
});
```

#### Fallback Search (Lower Threshold)

```typescript
// When initial search returns sparse results
const fallbackResults = await supabase.rpc('match_knowledge', {
  query_embedding: embedding,
  match_threshold: 0.55,           // Lower threshold for broader matches
  match_count: 30,                 // More results to compensate
  filter_org_id: orgId,
  include_shared: true             // ⭐ Must remain consistent!
});
```

---

### Best Practices

| Practice | Reason |
|----------|--------|
| **Always use Version 3** | Full feature set with proper filtering |
| **Set `include_shared: true`** for AI responses | Ensures compliance knowledge is available |
| **Use `include_shared: false`** only for health checks | Faster, simpler RPC call |
| **Keep `include_shared` consistent** in fallback searches | Prevents missing shared results |
| **Lower threshold (0.55-0.65)** for fallbacks | Broadens search when initial results are sparse |
| **Track usage** with `increment_usage_count` | Improves knowledge ranking over time |

---

### Threshold Guidelines

| Threshold | Use Case | Expected Behavior |
|-----------|----------|-------------------|
| `0.85+` | Exact match required | Very few, highly precise results |
| `0.75` | High confidence | Good precision, may miss some relevant items |
| `0.65` | **Recommended default** | Balanced precision/recall |
| `0.55` | Fallback/broad search | More results, some noise possible |
| `< 0.50` | Not recommended | Too much noise, poor relevance |

---

## increment_usage_count()

Tracks usage of knowledge items for analytics and ranking improvements.

### Signature

```sql
increment_usage_count(knowledge_id uuid)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `knowledge_id` | `uuid` | The knowledge item that was used |

### Usage

```typescript
// After using knowledge in an AI response
await supabase.rpc('increment_usage_count', {
  knowledge_id: matchedKnowledge.id
});
```

---

## Helper Functions

### is_knowledge_valid()

Checks if knowledge is within its validity period.

```sql
is_knowledge_valid(valid_from date, valid_to date) RETURNS boolean
```

**Logic:**
- Returns `true` if `valid_from <= CURRENT_DATE` AND (`valid_to IS NULL` OR `valid_to >= CURRENT_DATE`)

### has_acl_access()

Checks if a user has access based on ACL roles.

```sql
has_acl_access(user_id uuid, acl jsonb) RETURNS boolean
```

**Logic:**
- Returns `true` if ACL is empty (`[]`) - accessible to all
- Returns `true` if user's role is in the ACL array
- Otherwise returns `false`

---

## See Also

- [`semantic-retrieval.ts`](../semantic-retrieval.ts) - TypeScript wrapper for semantic search
- [`ai-chat/index.ts`](../../ai-chat/index.ts) - Production usage examples
- [Knowledge Base Schema](../../../../src/integrations/supabase/types.ts) - Database types

---

*Last updated: December 2024*
