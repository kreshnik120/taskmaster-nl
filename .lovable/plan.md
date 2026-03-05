

# Fix: Alle `window.open(signedUrl)` calls vervangen door blob-proxy

## Probleem
Er zijn nog plekken in de code die `window.open(signedUrl, '_blank')` gebruiken in plaats van de blob-proxy methode. Microsoft Edge blokkeert directe navigatie naar het Supabase storage domein.

## Gevonden locaties

### 1. CV Bekijken knop (ProfessionalDetailModal.tsx, regel ~982-987)
De "Bekijken" knop bij het CV gebruikt nog `window.open(data.signedUrl, '_blank')`. Moet vervangen worden door: `supabase.storage.download()` → `URL.createObjectURL(blob)` → `window.open(blobUrl)`.

### 2. ZZPDocumentWizard.tsx (regel ~429-432)
Documenten bekijken in de ZZP wizard gebruikt ook `window.open(data.signedUrl, '_blank')`. Zelfde fix toepassen.

## Wijzigingen

### Bestand 1: `src/components/ProfessionalDetailModal.tsx`
- Regel ~980-992: CV Bekijken knop — vervang `createSignedUrl` + `window.open` door `download()` + `URL.createObjectURL` + `window.open(blobUrl)`.

### Bestand 2: `src/components/recruitment/ZZPDocumentWizard.tsx`  
- Regel ~429-433: Bekijk knop — zelfde blob-proxy aanpak.

Beide wijzigingen zijn identiek aan de eerder toegepaste fix in `handleViewDocument`.

