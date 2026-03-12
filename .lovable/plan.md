

# S41-B3: Document Toevoegen Dialog — Handmatig Uploaden

## Wijzigingen in `src/components/ProfessionalDetailModal.tsx`

### 1. Nieuwe state variabelen (na regel 193)
- `showAddDocDialog` (boolean)
- `addDocLoading` (boolean)
- `addDocForm` object: `{ name, category, type, expiryDate, file }`

### 2. `handleAddDocument` functie (na `handleDownloadDocument`)
- Als file geselecteerd: upload naar `professional-documents` bucket met pad `{org_id}/{professional.id}/manual_{timestamp}.{ext}`
- Insert in `professional_documents` met `is_manual: true`, `bendy_document_id: null`
- Haal `user` op via `supabase.auth.getUser()`
- Refresh documenten lijst, sluit dialog, reset form, toon groene toast

### 3. `handleUploadForManualDoc` functie
- Voor bestaande `is_manual` documenten zonder `file_path` (Scenario C knop)
- Opent file input, upload naar storage, update record met `file_path`/`file_name`/`content_type`
- Update lokale `documents` state

### 4. UI: "+ Document toevoegen" knop (naast "Alle documenten ophalen", regel ~1276)
- Plus icoon, variant outline, opent dialog

### 5. UI: Dialog component (onder de TabsContent of aan het eind)
- Velden: Documentnaam (verplicht), Categorie (select), Document type (optioneel), Verloopdatum (date input), Bestand (file input, max 10MB)
- Na file selectie: toon bestandsnaam + grootte
- Knoppen: Annuleren + Opslaan (disabled als naam leeg of loading)

### 6. Scenario C Upload knop activeren (regel ~1447)
- Verwijder `disabled` van de Upload knop
- onClick: trigger hidden file input → `handleUploadForManualDoc`

### Bestanden die NIET worden aangepast
- Edge functions, storage config, andere tabs, bendy-sync

