
The goal is to fix the 1000-row limit issue in four critical database queries within the `bendy-sync` edge function. This ensures that the sync engine and health checks can handle up to 5,000 professionals, preventing incomplete synchronization when the database contains more than 1,000 records.

### Technical Analysis
- **Supabase/PostgREST Default**: By default, Supabase's JavaScript client (and the underlying PostgREST) limits query results to 1,000 rows.
- **Affected Areas**:
    - `syncUsers`: Fetches existing professionals to match with Bendy records.
    - `syncDocuments`: Fetches professionals with a `bendy_id` to sync their documents.
    - `handleStatusCheck` (Health checks): Two queries that check for duplicate `bendy_id`s and duplicate emails across the entire professional database.

### Implementation Steps

#### 1. Modify `supabase/functions/bendy-sync/index.ts`
I will apply four line-based replacements to add `.limit(5000)` to the following query chains:

- **Fix 1 (Professional Sync Matching)**:
    - **Target**: `syncUsers` function.
    - **Location**: Around lines 964-968.
    - **Change**: Add `.limit(5000)` after the `.is('deleted_at', null)` filter.

- **Fix 2 (Document Sync Processing)**:
    - **Target**: `syncDocuments` function.
    - **Location**: Around lines 1381-1386.
    - **Change**: Add `.limit(5000)` after the `.not('bendy_id', 'is', null)` filter.

- **Fix 3 (Health Check - Duplicate Bendy IDs)**:
    - **Target**: `handleStatusCheck` function.
    - **Location**: Around lines 1812-1817.
    - **Change**: Add `.limit(5000)` after the `.not('bendy_id', 'is', null)` filter.

- **Fix 4 (Health Check - Duplicate Emails)**:
    - **Target**: `handleStatusCheck` function.
    - **Location**: Around lines 1830-1835.
    - **Change**: Add `.limit(5000)` after the `.not('email', 'is', null)` filter.

#### 2. Automatic Deployment
The edge function will be automatically redeployed once the changes are saved.

### Verification Plan
1.  **Manual Trigger**: Trigger a manual sync from the backend settings or via a curl request.
2.  **Log Inspection**: Check the function logs to verify that the professional sync count now correctly reflects the actual number of professionals (e.g., "1427") instead of being capped at "1000".
3.  **Status Check**: Run the health check/status dashboard to ensure duplicate detection is running over the full dataset.

