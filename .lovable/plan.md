

# Deploy Edge Functions

## Wat er gebeurt
Twee edge functions hebben code-wijzigingen die nog niet live staan:
- **openclaw-proxy** — CORS hardening (origin whitelist i.p.v. wildcard `*`)
- **orchestrator-control** — Zod import fix (`esm.sh` i.p.v. `deno.land`)

## Plan
Deploy beide functies via de deploy tool. Geen codewijzigingen nodig — de code is al correct in het project.

## Verificatie na deploy
- `openclaw-proxy`: response header moet `Access-Control-Allow-Origin: https://abcito.io` bevatten (niet `*`)
- `orchestrator-control`: moet starten zonder 500 import error

