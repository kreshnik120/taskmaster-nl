

# Twee Fixes

## Fix 1: openclaw-proxy/index.ts — Dubbele regels
Na inspectie: **dit bestand is al correct**. Er zijn geen dubbele regels en geen oude `corsHeaders` constante. Alle 15 matches zijn `getCorsHeaders()` (de nieuwe functie). De merge is schoon.

## Fix 2: orchestrator-control/index.ts — Zod import
Regel 2: vervang `https://deno.land/x/zod@v3.22.4/mod.ts` → `https://esm.sh/zod@3.22.4`

Eén regelwijziging, geen verdere impact.

