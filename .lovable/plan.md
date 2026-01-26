
# Fase 6A: Bestand Uploads voor Notulen Module - Implementatieplan

## 1. Overzicht

| Aspect | Details |
|--------|---------|
| **Scope** | Storage bucket, database tabel, 3 hooks, 3 componenten, 2 updates |
| **Risico niveau** | MEDIUM (storage + RLS configuratie) |
| **Bestaande patronen** | `TaskAttachmentUpload.tsx`, `AttachmentPreviewModal.tsx`, `fileHelpers.ts` |
| **Nieuwe bestanden** | 6 nieuwe files + 1 migratie |
| **Geschatte omvang** | ~700 regels code |

---

## 2. Bestandsstructuur

```text
src/
├── hooks/notulen/
│   ├── useAttachments.ts              (NIEUW - query + realtime)
│   ├── useUploadAttachment.ts         (NIEUW - upload met progress)
│   └── useDeleteAttachment.ts         (NIEUW - delete storage + db)
├── components/notulen/
│   ├── AttachmentUploadZone.tsx       (NIEUW - drag & drop UI)
│   ├── AttachmentList.tsx             (NIEUW - lijst met acties)
│   ├── AttachmentPreviewModal.tsx     (NIEUW - preview modal)
│   ├── MeetingMinuteDetail.tsx        (UPDATE - bijlagen sectie)
│   └── CreateMeetingMinuteDialog.tsx  (UPDATE - pending uploads)
└── lib/
    └── fileHelpers.ts                 (BESTAAND - hergebruiken)

supabase/migrations/
└── [timestamp]_meeting_minute_attachments.sql (NIEUW)
```

---

## 3. Database Migratie

### Tabel: `meeting_minute_attachments`

```sql
-- Storage bucket voor meeting attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'meeting-attachments',
  'meeting-attachments',
  false,
  10485760,  -- 10MB
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Tabel voor attachment metadata
CREATE TABLE public.meeting_minute_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_minute_id UUID NOT NULL REFERENCES public.meeting_minutes(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_type TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes voor performance
CREATE INDEX idx_meeting_minute_attachments_meeting 
  ON public.meeting_minute_attachments(meeting_minute_id);
CREATE INDEX idx_meeting_minute_attachments_org 
  ON public.meeting_minute_attachments(org_id);

-- Enable RLS
ALTER TABLE public.meeting_minute_attachments ENABLE ROW LEVEL SECURITY;

-- RLS Policies (4 stuks)
CREATE POLICY "Org members can view attachments"
ON public.meeting_minute_attachments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = meeting_minute_attachments.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can insert attachments"
ON public.meeting_minute_attachments FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = meeting_minute_attachments.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can delete attachments"
ON public.meeting_minute_attachments FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = meeting_minute_attachments.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

-- Storage Policies
CREATE POLICY "Authenticated users can upload meeting attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'meeting-attachments');

CREATE POLICY "Org members can view meeting attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'meeting-attachments');

CREATE POLICY "Org members can delete meeting attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'meeting-attachments');
```

---

## 4. Hook: `useAttachments.ts`

### Verantwoordelijkheid
Fetch attachments voor een specifieke meeting minute met realtime updates

### Interface

```typescript
interface MeetingAttachment {
  id: string;
  meeting_minute_id: string;
  org_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  uploaded_by: string;
  uploaded_by_name: string; // via JOIN
  created_at: string;
}

interface UseAttachmentsReturn {
  attachments: MeetingAttachment[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useAttachments(meetingMinuteId: string | null): UseAttachmentsReturn
```

### Implementatie Strategie

```typescript
// Query met JOIN op profiles voor uploaded_by naam
const { data, error } = await supabase
  .from("meeting_minute_attachments")
  .select(`
    *,
    profiles:uploaded_by(name)
  `)
  .eq('meeting_minute_id', meetingMinuteId)
  .order("created_at", { ascending: false });

// Transform data
return data.map(item => ({
  ...item,
  uploaded_by_name: item.profiles?.name || 'Onbekend',
}));

// Realtime subscription voor updates
useEffect(() => {
  const channel = supabase
    .channel(`meeting-attachments-${meetingMinuteId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'meeting_minute_attachments',
      filter: `meeting_minute_id=eq.${meetingMinuteId}`,
    }, () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-attachments', meetingMinuteId] });
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [meetingMinuteId, queryClient]);
```

---

## 5. Hook: `useUploadAttachment.ts`

### Verantwoordelijkheid
Upload bestanden naar storage met progress tracking en database registratie

### Interface

```typescript
interface UploadAttachmentInput {
  meetingMinuteId: string;
  orgId: string;
  file: File;
}

interface UploadProgress {
  fileName: string;
  progress: number; // 0-100
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

interface UseUploadAttachmentReturn {
  uploadAttachment: (input: UploadAttachmentInput) => Promise<void>;
  uploadMultiple: (meetingMinuteId: string, orgId: string, files: File[]) => Promise<UploadResult>;
  isUploading: boolean;
  uploadProgress: UploadProgress[];
}
```

### Validatie & Upload Flow

```typescript
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
] as const;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES_PER_UPLOAD = 5;

// Validatie VOOR upload
function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: "Bestand te groot. Maximum is 10 MB." };
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type as any)) {
    return { valid: false, error: "Bestandstype niet toegestaan." };
  }
  return { valid: true };
}

// Upload flow
async function uploadAttachment({ meetingMinuteId, orgId, file }: UploadAttachmentInput) {
  const { data: { user } } = await supabase.auth.getUser();
  
  // 1. Sanitize filename
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filePath = `${orgId}/${meetingMinuteId}/${crypto.randomUUID()}_${sanitizedName}`;
  
  // 2. Upload to storage
  const { error: uploadError } = await supabase.storage
    .from('meeting-attachments')
    .upload(filePath, file);
  
  if (uploadError) throw uploadError;
  
  // 3. Insert database record
  const { error: dbError } = await supabase
    .from('meeting_minute_attachments')
    .insert({
      meeting_minute_id: meetingMinuteId,
      org_id: orgId,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      file_type: file.type,
      uploaded_by: user?.id,
    });
  
  if (dbError) {
    // Rollback: delete from storage
    await supabase.storage.from('meeting-attachments').remove([filePath]);
    throw dbError;
  }
  
  queryClient.invalidateQueries({ queryKey: ['meeting-attachments', meetingMinuteId] });
  toast.success(`${file.name} geüpload`);
}
```

---

## 6. Hook: `useDeleteAttachment.ts`

### Verantwoordelijkheid
Verwijder attachment uit storage en database

### Interface

```typescript
interface UseDeleteAttachmentReturn {
  deleteAttachment: (attachmentId: string, filePath: string) => Promise<void>;
  isDeleting: boolean;
}
```

### Implementatie

```typescript
async function deleteAttachment(attachmentId: string, filePath: string) {
  setIsDeleting(true);
  try {
    // 1. Delete from database
    const { data: attachment, error: fetchError } = await supabase
      .from('meeting_minute_attachments')
      .select('meeting_minute_id')
      .eq('id', attachmentId)
      .single();
    
    if (fetchError) throw fetchError;
    
    const { error: dbError } = await supabase
      .from('meeting_minute_attachments')
      .delete()
      .eq('id', attachmentId);
    
    if (dbError) throw dbError;
    
    // 2. Delete from storage
    const { error: storageError } = await supabase.storage
      .from('meeting-attachments')
      .remove([filePath]);
    
    if (storageError) console.error('Storage cleanup failed:', storageError);
    
    queryClient.invalidateQueries({ 
      queryKey: ['meeting-attachments', attachment?.meeting_minute_id] 
    });
    toast.success("Bijlage verwijderd");
  } catch (error) {
    toast.error("Kon bijlage niet verwijderen");
    throw error;
  } finally {
    setIsDeleting(false);
  }
}
```

---

## 7. Component: `AttachmentUploadZone.tsx`

### Props Interface

```typescript
interface AttachmentUploadZoneProps {
  meetingMinuteId: string;
  orgId: string;
  disabled?: boolean;
  compact?: boolean;
  onUploadComplete?: () => void;
}
```

### UI Specificaties

```text
┌────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────┐  │
│  │       📎 Sleep bestanden hier            │  │
│  │          of klik om te selecteren        │  │
│  │                                          │  │
│  │   PDF, Word, Excel, afbeeldingen        │  │
│  │           (max. 10MB per bestand)       │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  Uploaden:                                     │
│  ├─ document.pdf     ████████░░ 80%           │
│  └─ notes.docx       ██████████ ✓             │
└────────────────────────────────────────────────┘
```

### Features
- Drag & drop zone met visuele feedback (border color change)
- Click to upload fallback via hidden input
- Multi-file support (max 5 tegelijk) met validatie
- Progress bar per file tijdens upload
- File type icons via `getFileIcon()` helper
- "Bezig met uploaden..." state
- Error state met bestandsnaam
- Nederlandse labels

### Gebaseerd op
Hergebruik patroon van `TaskAttachmentUpload.tsx` (regels 191-220 voor drag/drop zone)

---

## 8. Component: `AttachmentList.tsx`

### Props Interface

```typescript
interface AttachmentListProps {
  attachments: MeetingAttachment[];
  isLoading: boolean;
  isEditMode: boolean;
  onDelete?: (id: string, filePath: string) => void;
}
```

### UI Specificaties

```text
┌─────────────────────────────────────────────────────┐
│ 📄 vergadernotities-jan.pdf         2.4 MB         │
│    Geüpload door Jan op 26 jan 2026    [👁] [⬇] [🗑]│
├─────────────────────────────────────────────────────┤
│ 📷 whiteboard-foto.jpg              856 KB         │
│    Geüpload door Anna op 26 jan 2026   [👁] [⬇] [🗑]│
├─────────────────────────────────────────────────────┤
│ 📊 budget-overzicht.xlsx            124 KB         │
│    Geüpload door Kees op 26 jan 2026   [👁] [⬇] [🗑]│
└─────────────────────────────────────────────────────┘
```

### Features
- File type icon via `getFileCategory()` + icon mapping
- Bestandsnaam (truncated met `title` tooltip)
- Bestandsgrootte via `formatFileSize()` helper
- Geüpload door (naam + datum in Nederlandse formatting)
- Download knop → `supabase.storage.download()` + blob URL
- Preview knop (alleen voor images + PDF) → opent `AttachmentPreviewModal`
- Delete knop (alleen in edit mode) met AlertDialog confirmation
- Empty state: "Nog geen bijlagen toegevoegd"
- Loading state met Skeleton components

---

## 9. Component: `AttachmentPreviewModal.tsx`

### Hergebruik
De bestaande `src/components/AttachmentPreviewModal.tsx` kan bijna 1-op-1 hergebruikt worden. 
Enige aanpassing: bucket naam wijzigen van `'task-attachments'` naar `'meeting-attachments'`.

**Optie A**: Maak bucket een prop
**Optie B**: Maak een aparte `MeetingAttachmentPreviewModal.tsx` (copy + paste + bucket change)

### Aanbeveling
Optie A is cleaner - voeg `bucket` prop toe aan bestaande component. Maar voor scope isolatie van Notulen module: Optie B (dedicated component).

### Features
- Modal/Dialog met max-width 5xl
- Image preview (native img tag, zoom controls)
- PDF preview (iframe met blob URL)
- Download fallback voor andere types
- Bestandsinfo in header (naam, type badge)
- Keyboard support (Escape to close)

---

## 10. Update: `MeetingMinuteDetail.tsx`

### Nieuwe Sectie: "Bijlagen"

Toevoegen na de "Deelnemers" sectie (na `EditableAttendeesSection`):

```typescript
// Nieuwe imports
import { Paperclip } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAttachments } from "@/hooks/notulen/useAttachments";
import { AttachmentUploadZone } from "./AttachmentUploadZone";
import { AttachmentList } from "./AttachmentList";

// In component
const { attachments, isLoading: attachmentsLoading } = useAttachments(minute?.id || null);

// Nieuwe sectie (collapsible)
<Collapsible defaultOpen={attachments.length > 0}>
  <CollapsibleTrigger className="flex items-center justify-between w-full">
    <div className="flex items-center gap-2">
      <Paperclip className="h-4 w-4" />
      <span className="font-medium">Bijlagen</span>
      {attachments.length > 0 && (
        <Badge variant="secondary" className="ml-1">
          {attachments.length}
        </Badge>
      )}
    </div>
    <ChevronDown className="h-4 w-4" />
  </CollapsibleTrigger>
  <CollapsibleContent className="pt-3">
    <Card className="p-4 space-y-4">
      {/* Upload zone alleen in edit mode */}
      {isEditMode && (
        <AttachmentUploadZone
          meetingMinuteId={minute.id}
          orgId={minute.org_id}
          compact
        />
      )}
      
      {/* Attachment list */}
      <AttachmentList
        attachments={attachments}
        isLoading={attachmentsLoading}
        isEditMode={isEditMode}
        onDelete={handleDeleteAttachment}
      />
    </Card>
  </CollapsibleContent>
</Collapsible>
```

---

## 11. Update: `CreateMeetingMinuteDialog.tsx`

### Nieuwe Features
- State voor pending files
- AttachmentUploadZone component (in simpele modus)
- Na notulen aanmaken → upload pending files

### Implementatie

```typescript
// Nieuwe state
const [pendingFiles, setPendingFiles] = useState<File[]>([]);

// In onSubmit, na createMeetingMinute:
if (pendingFiles.length > 0) {
  // Get org_id from user context
  const { data: userOrg } = await supabase
    .from('user_organizations')
    .select('org_id')
    .limit(1)
    .maybeSingle();
  
  if (userOrg?.org_id) {
    for (const file of pendingFiles) {
      await uploadAttachment({
        meetingMinuteId: minuteId,
        orgId: userOrg.org_id,
        file,
      });
    }
  }
}

// Reset pending files
setPendingFiles([]);

// In form, na meeting_link field:
<div className="space-y-2">
  <FormLabel>Bijlagen (optioneel)</FormLabel>
  <PendingAttachmentUpload
    files={pendingFiles}
    onFilesChange={setPendingFiles}
    disabled={isCreating}
  />
</div>
```

**Note**: Voor CreateMeetingMinuteDialog gebruiken we een vereenvoudigde "pending files" component 
(geen upload naar storage tot notulen is aangemaakt). Dit volgt het patroon van `TaskAttachmentUpload.tsx`.

---

## 12. Bestaande Helpers Hergebruiken

### `src/lib/fileHelpers.ts`
Volledig hergebruiken:
- `getFileCategory()` - Bepaal file type
- `formatFileSize()` - Human readable file size
- `canPreview()` - Check of preview mogelijk is
- `getFileCategoryLabel()` - Nederlandse labels
- `getFileCategoryColor()` - Badge kleuren

### File Icons (nieuw of uitbreiden)
```typescript
const getFileIcon = (filename: string) => {
  const category = getFileCategory(filename);
  switch (category) {
    case 'pdf': return <FileText className="h-4 w-4 text-red-500" />;
    case 'word': return <FileText className="h-4 w-4 text-blue-500" />;
    case 'excel': return <FileSpreadsheet className="h-4 w-4 text-green-500" />;
    case 'image': return <ImageIcon className="h-4 w-4 text-purple-500" />;
    default: return <File className="h-4 w-4 text-muted-foreground" />;
  }
};
```

---

## 13. Error Handling (Nederlandse Berichten)

### Validatie Errors
| Error | Bericht |
|-------|---------|
| File too large | "Bestand te groot. Maximum is 10 MB." |
| Invalid type | "Bestandstype niet toegestaan. Gebruik PDF, Word, Excel of afbeeldingen." |
| Too many files | "Maximaal 5 bestanden tegelijk uploaden." |

### Upload Errors
| Error | Bericht |
|-------|---------|
| Upload failed | "Upload mislukt. Probeer het opnieuw." |
| Network error | "Geen verbinding. Controleer je internet." |
| Storage limit | "Opslag limiet bereikt. Neem contact op met beheerder." |

### Delete Errors
| Error | Bericht |
|-------|---------|
| Delete failed | "Kon bijlage niet verwijderen. Probeer het opnieuw." |

---

## 14. Security Overwegingen

| Aspect | Implementatie |
|--------|---------------|
| File path | `{org_id}/{meeting_minute_id}/{uuid}_{sanitized_filename}` |
| Filename sanitization | `file.name.replace(/[^a-zA-Z0-9.-]/g, '_')` |
| Signed URLs | 1 uur expiry via `createSignedUrl()` |
| Direct access | Niet mogelijk (private bucket) |
| Content-Type | Server-side validatie door Supabase bucket config |
| RLS | Org membership check op alle operaties |
| Uploaded_by check | INSERT vereist `uploaded_by = auth.uid()` |

---

## 15. Implementatie Volgorde

| Stap | Bestand | Prioriteit |
|------|---------|------------|
| 1 | Database migratie (bucket + tabel + RLS) | HIGH |
| 2 | `src/hooks/notulen/useAttachments.ts` | HIGH |
| 3 | `src/hooks/notulen/useUploadAttachment.ts` | HIGH |
| 4 | `src/hooks/notulen/useDeleteAttachment.ts` | HIGH |
| 5 | `src/components/notulen/AttachmentUploadZone.tsx` | HIGH |
| 6 | `src/components/notulen/AttachmentList.tsx` | HIGH |
| 7 | `src/components/notulen/AttachmentPreviewModal.tsx` | MEDIUM |
| 8 | Update `MeetingMinuteDetail.tsx` | HIGH |
| 9 | Update `CreateMeetingMinuteDialog.tsx` | MEDIUM |

---

## 16. Acceptatie Criteria Checklist

### Database & Storage
- [ ] Storage bucket `meeting-attachments` bestaat met juiste MIME types
- [ ] Bucket file_size_limit = 10MB
- [ ] Tabel `meeting_minute_attachments` met correcte schema
- [ ] RLS policies actief (SELECT, INSERT, DELETE)
- [ ] Storage policies actief
- [ ] Indexes aangemaakt

### Functionaliteit
- [ ] Drag & drop upload werkt
- [ ] Click to upload werkt
- [ ] Multi-file upload werkt (max 5)
- [ ] Progress indicator tijdens upload
- [ ] File type validatie werkt (VOOR upload)
- [ ] File size validatie werkt (10MB)
- [ ] Download via blob URL werkt
- [ ] Preview werkt (images + PDF)
- [ ] Delete met confirmation werkt
- [ ] Attachments tonen in MeetingMinuteDetail
- [ ] Attachments tonen in CreateDialog (pending)

### UX
- [ ] Nederlandse labels overal
- [ ] Loading states correct
- [ ] Error states met duidelijke berichten
- [ ] Empty states
- [ ] File type icons correct

### Technisch
- [ ] TypeScript compileert zonder errors
- [ ] Geen console errors
- [ ] Query invalidation correct
- [ ] Realtime updates werken

---

## 17. Wat NIET wordt gebouwd

| Item | Reden |
|------|-------|
| OCR/tekst extractie | Fase 6B |
| Thumbnail generatie | Server-side processing nodig |
| Virus scanning | Extern systeem nodig |
| Version history | Out of scope |
| File renaming | Out of scope |

---

## 18. Bestandsoverzicht

| Bestand | Actie | Regels (geschat) |
|---------|-------|------------------|
| Migration file | NIEUW | ~80 |
| `src/hooks/notulen/useAttachments.ts` | NIEUW | ~80 |
| `src/hooks/notulen/useUploadAttachment.ts` | NIEUW | ~120 |
| `src/hooks/notulen/useDeleteAttachment.ts` | NIEUW | ~50 |
| `src/components/notulen/AttachmentUploadZone.tsx` | NIEUW | ~180 |
| `src/components/notulen/AttachmentList.tsx` | NIEUW | ~150 |
| `src/components/notulen/AttachmentPreviewModal.tsx` | NIEUW | ~80 |
| `src/components/notulen/MeetingMinuteDetail.tsx` | UPDATE | +50 |
| `src/components/notulen/CreateMeetingMinuteDialog.tsx` | UPDATE | +40 |

**Totaal: ~830 regels nieuwe/gewijzigde code**

---

## 19. Technische Risico's en Mitigaties

| Risico | Mitigatie |
|--------|-----------|
| Storage bucket setup failure | Expliciete `ON CONFLICT DO NOTHING` in migratie |
| RLS policy recursion | Simpele EXISTS checks, geen geneste queries |
| Orphaned storage files | Database delete first, storage cleanup in finally block |
| Upload timeout | Client-side progress tracking, user feedback |
| Large file blocking UI | Async upload met progress state |
| Signed URL expired | 1 uur expiry, regenereren bij download |
