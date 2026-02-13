

# Fix: agent-auto-facturatie .catch() Error

## Problem
`supabase.from('function_call_logs').insert({...}).catch(() => {})` fails because Supabase's `.insert()` returns a `PostgrestFilterBuilder`, not a native `Promise`. The `.catch()` method is not available on it.

## Solution
Replace `.catch(() => {})` with `.then(() => {})` (which IS available on PostgrestFilterBuilder and suppresses the result), or simply remove the chaining and ignore the result with a standalone await wrapped in try/catch.

The simplest fix: remove `.catch(() => {})` from both logging calls (lines ~148 and ~196) since the insert already returns `{ error }` without throwing. Just ignore the return value.

## Changes

**File: `supabase/functions/agent-auto-facturatie/index.ts`**

Two occurrences to fix:

1. **Line ~148** (preview logging): Change `}).catch(() => {});` to `});` (remove `.catch(() => {})`)
2. **Line ~196** (generate logging): Change `}).catch(() => {});` to `});` (remove `.catch(() => {})`)

## Technical Detail
Supabase JS client methods like `.insert()` return a thenable `PostgrestBuilder` but `.catch()` is not defined on it. Simply awaiting or ignoring the return handles errors gracefully since Supabase never throws -- it returns `{ data, error }`.
