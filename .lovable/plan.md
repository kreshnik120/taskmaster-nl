

# Fix: Document viewer geblokkeerd door browser

## Probleem
`handleViewDocument` opent de signed URL via `window.open(signedUrl, '_blank')`. Microsoft Edge (en andere browsers met ad-blockers/security) blokkeren directe navigatie naar het Supabase storage domein (`oelmsmcgryeoryhonexw.supabase.co`).

## Oplossing
In plaats van `window.open` naar een extern domein, **fetch de signed URL en open het bestand als een blob URL** in de browser. Dit omzeilt domeinblokkering omdat de blob URL lokaal is (`blob:https://taskmaster-nl.lovable.app/...`).

## Wijzigingen

**Bestand**: `src/components/ProfessionalDetailModal.tsx`

### handleViewDocument (regel 500-504)
Vervang `window.open(signedUrl)` door: fetch de signed URL → maak blob → `URL.createObjectURL` → `window.open(blobUrl)`.

```typescript
const handleViewDocument = useCallback(async (filePath: string) => {
  const { data } = await supabase.storage.from('professional-documents').createSignedUrl(filePath, 60);
  if (!data?.signedUrl) { toast.error('Kan bestand niet openen'); return; }
  try {
    const res = await fetch(data.signedUrl);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
  } catch { toast.error('Kan bestand niet openen'); }
}, []);
```

### handleDownloadDocument (regel 506-516)
Zelfde aanpak voor download — fetch als blob, maak object URL, trigger download link.

```typescript
const handleDownloadDocument = useCallback(async (filePath: string, fileName: string) => {
  const { data } = await supabase.storage.from('professional-documents').createSignedUrl(filePath, 60);
  if (!data?.signedUrl) { toast.error('Kan bestand niet downloaden'); return; }
  try {
    const res = await fetch(data.signedUrl);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName || 'document';
    a.click();
    URL.revokeObjectURL(blobUrl);
  } catch { toast.error('Kan bestand niet downloaden'); }
}, []);
```

Twee functies wijzigen, geen andere bestanden.

