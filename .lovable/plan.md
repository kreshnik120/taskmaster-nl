

# Plan: S41-A (Kosten Optimalisatie) + S41-B1 (Database Migratie)

Twee onafhankelijke wijzigingen die parallel uitgevoerd worden.

---

## Deel 1: Kosten Optimalisatie (S41-A)

### Bestand: `src/pages/BendySync.tsx`
- Regel 163: polling interval 30s → 120s
- Regel 213: sync polling 3s → 10s
- Nieuw useEffect voor visibility change (refresh bij tab-terugkeer)

### Bestand: `supabase/config.toml`
16 schedule-wijzigingen (alle naar lagere frequentie):
- 3× elke 5min → elke 2 uur (process-system-events, ai-agent-orchestrator, ai-chat-health-monitor)
- 1× elke 10min → elke 2 uur (system-health-monitor)
- 3× elke 15min → elke 4 uur (bendy-sync, cleanup-stale-jobs, cleanup-stuck-test-runs)
- 1× elke 30min → elke 4 uur (auto-resolve-alerts)
- 3× elk uur → elke 6 uur (auto-restart-backfill, master-scheduler, auto-validate-trusted-knowledge)
- 1× elke 2 uur → dagelijks (cache-warmer)
- 3× elke 6 uur → dagelijks (data-quality-auditor, detect-and-resolve-conflicts, apply-meta-patterns)
- 1× elke 12 uur → dagelijks (ai-task-scorer)

---

## Deel 2: Database Migratie (S41-B1)

Eén SQL-migratie (via migration tool):
- **1A**: 6 kolommen toevoegen (file_path, file_name, content_type, category, uploaded_by, is_manual)
- **1B**: bendy_document_id nullable maken
- **1C**: UNIQUE constraint → partial unique index
- **1D**: Index op category
- **1E**: Storage bucket `professional-documents` (private, 10MB, PDF/JPG/PNG/DOCX)
- **1F**: Storage RLS (org-leden upload + read, pad-gebaseerd)
- **1G**: Tabel RLS (INSERT + UPDATE voor org-leden)

Na migratie, via insert tool (data-update):
- **1H**: Categorie-mapping voor ~6.210 bestaande documenten (basis/zzp/certificaat/overig)

### Verificatie
- `SELECT category, count(*) FROM professional_documents GROUP BY category ORDER BY count DESC;`
- Storage bucket moet bestaan
- Nieuwe kolommen moeten zichtbaar zijn

