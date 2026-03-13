

# BENDY-REQ-5B-FIX-7: Batch toewijzingen insert

## Probleem
Toewijzingen worden 1-voor-1 geïnsert (regels 400-416). Met meer matches na FIX-6 duurt dit te lang → timeout.

## Wijziging (regels 364-417)

Vervang de directe insert in de loop door een collect-then-batch patroon:

1. **Collect fase**: De matching loop (regels 366-398) blijft exact hetzelfde, maar in plaats van direct inserting, push naar `toewijzingenToInsert[]` array.

2. **Batch insert fase**: Na de loop, insert in chunks van 50. Bij batch-fout: fallback naar 1-voor-1 voor dat chunk (overlap trigger).

3. **Progress logging**: Log voortgang per 500 created toewijzingen.

```text
WAS:  for record → match → insert 1-voor-1 → track stats
WORDT: for record → match → push to array
        → for chunk of 50 → batch insert
          → on error: fallback 1-voor-1 per chunk item
```

### Concrete code (regels 364-417 vervangen)

```typescript
// 5D: Verzamel toewijzingen
const toewijzingenToInsert: any[] = [];
let noMatchSamples = 0;
for (const req of allRecords) {
  const bendyId = String(req.id);
  const dienst = dienstMap.get(bendyId);
  if (!dienst?.id) continue;
  const fucId = req.relationships?.flex_user_company?.data?.id;
  if (!fucId) continue;
  const userBendyId = fucMap.get(String(fucId));
  if (!userBendyId) { twStats.noMatch++; /* sample logging */ continue; }
  const prof = profMap.get(userBendyId);
  if (!prof) { twStats.noMatch++; continue; }
  const key = `${dienst.id}|${prof.id}`;
  if (existingToewijzingen.has(key)) { twStats.skipped++; continue; }
  existingToewijzingen.add(key); // prevent duplicates within batch
  toewijzingenToInsert.push({
    dienst_id: dienst.id, professional_id: prof.id,
    status: 'bevestigd', positie_nr: 1,
    toewijzing_notities: `Bendy sync: flex_user_company ${fucId}`,
  });
}

// 5E: Batch insert in chunks van 50
const TW_INSERT_CHUNK = 50;
for (let i = 0; i < toewijzingenToInsert.length; i += TW_INSERT_CHUNK) {
  const chunk = toewijzingenToInsert.slice(i, i + TW_INSERT_CHUNK);
  const { error } = await adminClient.from('dienst_toewijzingen').insert(chunk);
  if (error) {
    for (const tw of chunk) {
      const { error: singleError } = await adminClient.from('dienst_toewijzingen').insert(tw);
      if (singleError) { twStats.overlapError++; } else { twStats.created++; }
    }
  } else {
    twStats.created += chunk.length;
  }
  if (twStats.created > 0 && twStats.created % 500 < TW_INSERT_CHUNK) {
    await logProgress('5-TW-PROGRESS', { created: twStats.created, total: toewijzingenToInsert.length });
  }
}
```

Geen andere wijzigingen. Deploy na implementatie.

