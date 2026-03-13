

# BENDY-REQ-6B: Toewijzingen fallback optimalisatie

## Wijziging

**Bestand:** `supabase/functions/_shared/bendy-sync-requisitions.ts`, regels 416-424

Vervang de sequentiële fallback loop door `Promise.allSettled` voor parallelle verwerking:

```typescript
// WAS (regels 416-424):
if (error) {
  for (const tw of chunk) {
    const { error: singleError } = await adminClient.from('dienst_toewijzingen').insert(tw);
    if (singleError) { twStats.overlapError++; } else { twStats.created++; }
  }
}

// WORDT:
if (error) {
  const results = await Promise.allSettled(
    chunk.map(tw => adminClient.from('dienst_toewijzingen').insert(tw))
  );
  for (const r of results) {
    if (r.status === 'fulfilled' && !r.value.error) { twStats.created++; }
    else { twStats.overlapError++; }
  }
}
```

Geen andere wijzigingen. Deploy edge function na implementatie.

