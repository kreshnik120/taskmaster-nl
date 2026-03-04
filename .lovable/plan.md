

# Verificatie S41-A + S41-B1 — Alle 12 Checks

## DEEL 1: S41-A — KOSTEN OPTIMALISATIE

### CHECK A1a — Status polling 120s ✅ PASS
```
const interval = setInterval(fetchStatus, 120000);  // regel 163
```

### CHECK A1b — Sync polling 10s ✅ PASS
```
}, 10000);  // regel 224
```

### CHECK A1c — Visibility useEffect ✅ PASS
```typescript
useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchStatus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
}, []);  // regels 168-176
```

### CHECK A2 — 16/16 Cron Schedules ✅ ALL PASS

| # | Function | Verwacht | Actueel | Status |
|---|----------|----------|---------|--------|
| 1 | process-system-events | `0 */2 * * *` | `0 */2 * * *` | ✅ |
| 2 | ai-agent-orchestrator | `15 */2 * * *` | `15 */2 * * *` | ✅ |
| 3 | ai-chat-health-monitor | `30 */2 * * *` | `30 */2 * * *` | ✅ |
| 4 | system-health-monitor | `45 */2 * * *` | `45 */2 * * *` | ✅ |
| 5 | bendy-sync | `0 */4 * * *` | `0 */4 * * *` | ✅ |
| 6 | cleanup-stale-jobs | `15 */4 * * *` | `15 */4 * * *` | ✅ |
| 7 | cleanup-stuck-test-runs | `30 */4 * * *` | `30 */4 * * *` | ✅ |
| 8 | auto-resolve-alerts | `45 */4 * * *` | `45 */4 * * *` | ✅ |
| 9 | auto-restart-backfill | `0 */6 * * *` | `0 */6 * * *` | ✅ |
| 10 | master-scheduler | `30 */6 * * *` | `30 */6 * * *` | ✅ |
| 11 | auto-validate-trusted-knowledge | `45 */6 * * *` | `45 */6 * * *` | ✅ |
| 12 | cache-warmer | `0 1 * * *` | `0 1 * * *` | ✅ |
| 13 | data-quality-auditor | `0 8 * * *` | `0 8 * * *` | ✅ |
| 14 | detect-and-resolve-conflicts | `0 9 * * *` | `0 9 * * *` | ✅ |
| 15 | apply-meta-patterns | `0 10 * * *` | `0 10 * * *` | ✅ |
| 16 | ai-task-scorer | `0 11 * * *` | `0 11 * * *` | ✅ |

---

## DEEL 2: S41-B1 — DATABASE MIGRATIE

### CHECK B1 — 6 kolommen aanwezig ✅ PASS
| Kolom | Type | Nullable | Default |
|-------|------|----------|---------|
| category | text | YES | `'overig'` |
| content_type | text | YES | — |
| file_name | text | YES | — |
| file_path | text | YES | — |
| is_manual | boolean | YES | `false` |
| uploaded_by | uuid | YES | — |

### CHECK B2 — bendy_document_id nullable ✅ PASS
`is_nullable = YES`

### CHECK B3 — Partial unique index ✅ PASS
```
idx_prof_docs_bendy_id_unique ON professional_documents (professional_id, bendy_document_id) WHERE (bendy_document_id IS NOT NULL)
```

### CHECK B4 — Category index ✅ PASS
```
idx_prof_docs_category ON professional_documents USING btree (category)
```

### CHECK B5 — Storage bucket ✅ PASS
Bucket `professional-documents` bestaat, `public = false`

### CHECK B6 — Categorie-mapping ✅ PASS
| Categorie | Aantal | Verwacht |
|-----------|--------|----------|
| basis | 2.349 | 2.349 ✅ |
| zzp | 1.699 | 1.699 ✅ |
| certificaat | 1.634 | 1.634 ✅ |
| overig | 528 | 528 ✅ |
| **Totaal** | **6.210** | **6.210** ✅ |

### CHECK B7 — Tabel RLS policies ✅ PASS
| Policy | Command |
|--------|---------|
| org_members_insert_documents | INSERT |
| org_members_read_documents | SELECT |
| org_members_update_documents | UPDATE |
| service_role_documents_all | ALL |

### CHECK B8 — Storage RLS policies ✅ PASS
| Policy | Command |
|--------|---------|
| org_members_read_professional_docs | SELECT |
| org_members_upload_professional_docs | INSERT |

---

## SAMENVATTING

| Check | Onderdeel | Status |
|-------|-----------|--------|
| A1a | Status polling 120s | ✅ PASS |
| A1b | Sync polling 10s | ✅ PASS |
| A1c | Visibility useEffect | ✅ PASS |
| A2 | 16/16 cron schedules correct | ✅ PASS |
| B1 | 6 kolommen aanwezig | ✅ PASS |
| B2 | bendy_document_id nullable | ✅ PASS |
| B3 | Partial unique index | ✅ PASS |
| B4 | Category index | ✅ PASS |
| B5 | Storage bucket | ✅ PASS |
| B6 | Categorie-mapping 6.210 docs | ✅ PASS |
| B7 | Tabel RLS policies | ✅ PASS |
| B8 | Storage RLS policies | ✅ PASS |

**12/12 checks PASS — Verificatie GESLAAGD. Klaar voor S41-B2.**

