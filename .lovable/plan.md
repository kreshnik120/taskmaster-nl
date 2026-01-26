
# Fase 5: PDF Export, In-App Notificaties & UI Polish - Implementatieplan

## 1. Overzicht

| Aspect | Details |
|--------|---------|
| **Scope** | PDF Export, Pending Count Badge, Toast Notificaties, Loading Skeletons, Keyboard Shortcuts, Delete Functionaliteit |
| **Risico niveau** | LAAG-MEDIUM (nieuwe dependency voor PDF, rest is hergebruik patronen) |
| **Nieuwe dependency** | `jspdf` + `jspdf-autotable` (lightweight, geen React component rendering nodig) |
| **Nieuwe bestanden** | 4 nieuwe files (3 hooks + 1 utility) |
| **Bestaande wijzigingen** | MeetingMinuteDetail.tsx, AppSidebar.tsx, useUpdateMeetingMinute.ts |

---

## 2. Bestandsstructuur

```text
src/
├── hooks/notulen/
│   ├── useDeleteMeetingMinute.ts      (NIEUW - delete met cascade)
│   └── usePendingMinutesCount.ts      (NIEUW - realtime badge count)
├── utils/
│   └── generateMeetingMinutesPDF.ts   (NIEUW - PDF generatie utility)
├── components/
│   └── notulen/
│       └── MeetingMinuteDetail.tsx    (UPDATE - PDF, delete, skeletons, shortcuts)
│   └── AppSidebar.tsx                 (UPDATE - badge count)
└── hooks/notulen/
    └── useUpdateMeetingMinute.ts      (UPDATE - verbeterde toasts)
```

---

## 3. Dependency Keuze: jspdf + jspdf-autotable

### Waarom NIET @react-pdf/renderer:
- Vereist complete component tree rendering in een apart React process
- Zwaardere bundle size (~300KB vs ~80KB)
- Complexer voor eenvoudige tabellen

### Waarom WEL jspdf + jspdf-autotable:
- Lightweight, directe PDF generatie
- Uitstekende tabel support via autotable plugin
- Simpele API: `doc.text()`, `doc.autoTable()`
- Breed gebruikt in de industry
- Geen React rendering pipeline nodig

---

## 4. Hook: `useDeleteMeetingMinute.ts`

### Verantwoordelijkheid
Delete meeting_minute record (meeting_attendees cascaden automatisch via FK)

### Interface

```typescript
interface UseDeleteMeetingMinuteReturn {
  deleteMeetingMinute: (minuteId: string) => Promise<void>;
  isDeleting: boolean;
}
```

### Implementatie

```typescript
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MEETING_MINUTES_QUERY_KEY } from "@/hooks/useMeetingMinutes";
import { toast } from "sonner";

export function useDeleteMeetingMinute() {
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteMeetingMinute = async (minuteId: string): Promise<void> => {
    setIsDeleting(true);
    try {
      // 1. Haal task_id op voordat we deleten
      const { data: minute } = await supabase
        .from('meeting_minutes')
        .select('task_id')
        .eq('id', minuteId)
        .single();

      // 2. Delete meeting_minutes (attendees cascade automatisch)
      const { error: minuteError } = await supabase
        .from('meeting_minutes')
        .delete()
        .eq('id', minuteId);

      if (minuteError) throw minuteError;

      // 3. Delete gekoppelde task (optioneel - meeting task heeft geen andere purpose)
      if (minute?.task_id) {
        await supabase
          .from('tasks')
          .delete()
          .eq('id', minute.task_id)
          .eq('category', 'meeting'); // Safety check
      }

      await queryClient.invalidateQueries({ queryKey: MEETING_MINUTES_QUERY_KEY });
      toast.success("Notulen verwijderd");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      toast.error("Kon notulen niet verwijderen", { description: message });
      throw error;
    } finally {
      setIsDeleting(false);
    }
  };

  return { deleteMeetingMinute, isDeleting };
}
```

---

## 5. Hook: `usePendingMinutesCount.ts`

### Verantwoordelijkheid
Realtime count van meeting_minutes met status='pending_approval' voor sidebar badge

### Interface

```typescript
interface UsePendingMinutesCountReturn {
  pendingCount: number;
  isLoading: boolean;
}
```

### Implementatie

```typescript
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const PENDING_MINUTES_COUNT_KEY = ['pending-minutes-count'] as const;

export function usePendingMinutesCount() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: PENDING_MINUTES_COUNT_KEY,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('meeting_minutes')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending_approval');

      if (error) throw error;
      return count || 0;
    },
    staleTime: 1000 * 30, // 30 sec cache
    refetchInterval: 1000 * 60, // Refetch every minute
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('pending-minutes-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meeting_minutes',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: PENDING_MINUTES_COUNT_KEY });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return {
    pendingCount: query.data || 0,
    isLoading: query.isLoading,
  };
}
```

---

## 6. Utility: `generateMeetingMinutesPDF.ts`

### Verantwoordelijkheid
Genereer en download A4 PDF met alle notulen secties

### Interface

```typescript
interface GeneratePDFOptions {
  minute: MeetingMinute;
  organizationName?: string;
}

export async function generateMeetingMinutesPDF(options: GeneratePDFOptions): Promise<void>
```

### PDF Layout (A4)

```text
┌────────────────────────────────────────────────────────────┐
│ NOTULEN                                                    │
│ ═══════════════════════════════════════════════════════════│
│ Titel: Teamoverleg Q1 2026                                 │
│ Datum: zondag 26 januari 2026 om 14:00                    │
│ Type: Team  |  Status: Goedgekeurd                        │
│ Locatie: Kantoor Amsterdam                                │
│ Meeting link: https://meet.google.com/abc-def-ghi         │
├────────────────────────────────────────────────────────────┤
│ DEELNEMERS                                                 │
│ ┌──────────────────┬────────────┬─────────────┐           │
│ │ Naam             │ Rol        │ Aanwezig    │           │
│ ├──────────────────┼────────────┼─────────────┤           │
│ │ Jan Jansen       │ Voorzitter │ ✓           │           │
│ │ Marie de Vries   │ Notulist   │ ✓           │           │
│ │ Piet Bakker      │ Deelnemer  │ ✗           │           │
│ └──────────────────┴────────────┴─────────────┘           │
├────────────────────────────────────────────────────────────┤
│ AGENDA                                                     │
│ ┌─────┬───────────────────────────────┬───────┬──────────┐│
│ │ Nr  │ Onderwerp                     │ Duur  │ Besproken││
│ ├─────┼───────────────────────────────┼───────┼──────────┤│
│ │ 1   │ Opening en welkom             │ 5 min │ ✓        ││
│ │ 2   │ Voortgang project X           │ 15 min│ ✓        ││
│ │ 3   │ Rondvraag en sluiting         │ 10 min│ ✗        ││
│ └─────┴───────────────────────────────┴───────┴──────────┘│
├────────────────────────────────────────────────────────────┤
│ BESLISSINGEN                                               │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ • Deadline wordt verschoven naar 15 februari           ││
│ │   Besloten door: Jan Jansen op 26 jan 2026            ││
│ │ • Extra budget van €5000 goedgekeurd                   ││
│ │   Besloten door: - op 26 jan 2026                     ││
│ └─────────────────────────────────────────────────────────┘│
├────────────────────────────────────────────────────────────┤
│ NOTITIES                                                   │
│ Lorem ipsum dolor sit amet, consectetur adipiscing elit.   │
│ Sed do eiusmod tempor incididunt ut labore et dolore...   │
├────────────────────────────────────────────────────────────┤
│ VOLGENDE VERGADERING                                       │
│ 2 februari 2026                                           │
└────────────────────────────────────────────────────────────┘
│ Gegenereerd op 26 januari 2026 | TaskFlow                  │
└────────────────────────────────────────────────────────────┘
```

### Implementatie

```typescript
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { MeetingMinute } from '@/hooks/useMeetingMinutes';

const TYPE_LABELS: Record<string, string> = {
  team: 'Team',
  board: 'Bestuur',
  project: 'Project',
  klant: 'Klant',
  overig: 'Overig',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Concept',
  pending_approval: 'Wacht op goedkeuring',
  approved: 'Goedgekeurd',
  archived: 'Gearchiveerd',
};

const ROLE_LABELS: Record<string, string> = {
  voorzitter: 'Voorzitter',
  notulist: 'Notulist',
  deelnemer: 'Deelnemer',
  afwezig: 'Afgemeld',
};

export async function generateMeetingMinutesPDF({
  minute,
  organizationName = 'TaskFlow',
}: {
  minute: MeetingMinute;
  organizationName?: string;
}): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let yPos = 20;

  // ===== HEADER =====
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('NOTULEN', margin, yPos);
  yPos += 10;

  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 10;

  // ===== META INFO =====
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(minute.tasks?.title || 'Naamloos', margin, yPos);
  yPos += 7;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  if (minute.tasks?.start_at) {
    const dateStr = format(
      new Date(minute.tasks.start_at),
      "EEEE d MMMM yyyy 'om' HH:mm",
      { locale: nl }
    );
    doc.text(`Datum: ${dateStr}`, margin, yPos);
    yPos += 5;
  }

  const typeLabel = TYPE_LABELS[minute.meeting_type || 'overig'];
  const statusLabel = STATUS_LABELS[minute.status || 'draft'];
  doc.text(`Type: ${typeLabel}  |  Status: ${statusLabel}`, margin, yPos);
  yPos += 5;

  if (minute.location) {
    doc.text(`Locatie: ${minute.location}`, margin, yPos);
    yPos += 5;
  }

  if (minute.meeting_link) {
    doc.text(`Meeting link: ${minute.meeting_link}`, margin, yPos);
    yPos += 5;
  }

  yPos += 5;

  // ===== DEELNEMERS =====
  if (minute.meeting_attendees.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('DEELNEMERS', margin, yPos);
    yPos += 2;

    autoTable(doc, {
      startY: yPos,
      head: [['Naam', 'Rol', 'Aanwezig']],
      body: minute.meeting_attendees.map((att) => [
        att.profiles?.name || att.external_name || 'Onbekend',
        ROLE_LABELS[att.role || 'deelnemer'] || att.role || '-',
        att.attended ? '✓' : '✗',
      ]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 },
      headStyles: { fillColor: [66, 66, 66] },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // ===== AGENDA =====
  if (minute.agenda_items.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('AGENDA', margin, yPos);
    yPos += 2;

    autoTable(doc, {
      startY: yPos,
      head: [['Nr', 'Onderwerp', 'Duur', 'Besproken']],
      body: minute.agenda_items
        .sort((a, b) => a.order - b.order)
        .map((item) => [
          item.order.toString(),
          item.title,
          `${item.duration_min} min`,
          item.discussed ? '✓' : '✗',
        ]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 },
      headStyles: { fillColor: [66, 66, 66] },
      columnStyles: {
        0: { cellWidth: 15 },
        2: { cellWidth: 20 },
        3: { cellWidth: 20 },
      },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // ===== BESLISSINGEN =====
  if (minute.decisions.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('BESLISSINGEN', margin, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    for (const decision of minute.decisions) {
      // Check page break
      if (yPos > 260) {
        doc.addPage();
        yPos = 20;
      }

      doc.text(`• ${decision.text}`, margin + 2, yPos);
      yPos += 5;

      const decidedDate = decision.decided_at
        ? format(new Date(decision.decided_at), 'd MMM yyyy', { locale: nl })
        : '';
      const decidedBy = decision.decided_by || '-';
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(`  Besloten door: ${decidedBy} op ${decidedDate}`, margin + 4, yPos);
      doc.setTextColor(0);
      doc.setFontSize(10);
      yPos += 6;
    }

    yPos += 5;
  }

  // ===== NOTITIES =====
  if (minute.content) {
    // Check page break
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('NOTITIES', margin, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const textLines = doc.splitTextToSize(
      minute.content,
      pageWidth - margin * 2
    );
    doc.text(textLines, margin, yPos);
    yPos += textLines.length * 5 + 5;
  }

  // ===== VOLGENDE VERGADERING =====
  if (minute.next_meeting_date) {
    if (yPos > 260) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('VOLGENDE VERGADERING', margin, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const nextDate = format(
      new Date(minute.next_meeting_date),
      'd MMMM yyyy',
      { locale: nl }
    );
    doc.text(nextDate, margin, yPos);
  }

  // ===== FOOTER =====
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128);
    const footerText = `Gegenereerd op ${format(new Date(), 'd MMMM yyyy', { locale: nl })} | ${organizationName}`;
    doc.text(footerText, margin, 285);
    doc.text(`Pagina ${i} van ${pageCount}`, pageWidth - margin - 25, 285);
  }

  // ===== DOWNLOAD =====
  const fileName = `notulen-${minute.tasks?.title?.replace(/\s+/g, '-').toLowerCase() || 'export'}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  doc.save(fileName);
}
```

---

## 7. Update: `MeetingMinuteDetail.tsx`

### Nieuwe Features

1. **PDF Export Button** (naast Bewerken knop)
2. **Delete Button** (in edit mode, met AlertDialog)
3. **Loading Skeleton** (wanneer minute nog niet geladen is, optioneel)
4. **Cmd+S Keyboard Shortcut** (in edit mode)

### Nieuwe Imports

```typescript
import { FileDown, Trash2 } from "lucide-react";
import { useDeleteMeetingMinute } from "@/hooks/notulen/useDeleteMeetingMinute";
import { generateMeetingMinutesPDF } from "@/utils/generateMeetingMinutesPDF";
```

### PDF Export Handler

```typescript
const [isExporting, setIsExporting] = useState(false);

const handleExportPDF = async () => {
  if (!minute) return;
  
  setIsExporting(true);
  try {
    await generateMeetingMinutesPDF({ minute });
    toast.success("PDF gedownload");
  } catch (error) {
    toast.error("Kon PDF niet genereren");
  } finally {
    setIsExporting(false);
  }
};
```

### Delete Handler + Dialog

```typescript
const { deleteMeetingMinute, isDeleting } = useDeleteMeetingMinute();
const [showDeleteDialog, setShowDeleteDialog] = useState(false);

const handleDelete = async () => {
  if (!minute) return;
  
  await deleteMeetingMinute(minute.id);
  setShowDeleteDialog(false);
  onOpenChange(false); // Sluit sheet
};
```

### Keyboard Shortcut (Cmd+S)

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Escape handling (bestaand)
    if (e.key === "Escape" && isEditMode && open) {
      e.preventDefault();
      handleCancelEdit();
    }
    
    // NEW: Cmd/Ctrl + S = Save
    if ((e.metaKey || e.ctrlKey) && e.key === "s" && isEditMode && open) {
      e.preventDefault();
      if (hasChanges && !isUpdating) {
        handleSave();
      }
    }
  };

  document.addEventListener("keydown", handleKeyDown);
  return () => document.removeEventListener("keydown", handleKeyDown);
}, [isEditMode, open, hasChanges, isUpdating]);
```

### Updated Footer (View Mode)

```typescript
{!isEditMode && (
  <div className="flex gap-2 w-full sm:w-auto">
    <Button 
      variant="outline" 
      onClick={handleExportPDF}
      disabled={isExporting}
    >
      {isExporting ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <FileDown className="h-4 w-4 mr-2" />
      )}
      Exporteer PDF
    </Button>
    <Button variant="outline" onClick={handleEnterEditMode}>
      <Edit2 className="h-4 w-4 mr-2" />
      Bewerken
    </Button>
  </div>
)}
```

### Updated Footer (Edit Mode)

```typescript
{isEditMode && (
  <>
    {/* Delete button - left side */}
    <Button 
      variant="ghost" 
      className="text-destructive hover:text-destructive mr-auto"
      onClick={() => setShowDeleteDialog(true)}
      disabled={isDeleting || isUpdating}
    >
      <Trash2 className="h-4 w-4 mr-2" />
      Verwijderen
    </Button>
    
    <Button 
      variant="outline" 
      onClick={handleCancelEdit}
      disabled={isUpdating}
    >
      <X className="h-4 w-4 mr-2" />
      Annuleren
    </Button>
    <Button 
      onClick={handleSave} 
      disabled={isUpdating || !hasChanges}
    >
      {isUpdating ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Save className="h-4 w-4 mr-2" />
      )}
      Opslaan
    </Button>
  </>
)}
```

### Delete Confirmation Dialog

```typescript
<AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Notulen verwijderen?</AlertDialogTitle>
      <AlertDialogDescription>
        "{minute.tasks?.title}" wordt permanent verwijderd inclusief alle agenda items, 
        beslissingen en deelnemers. Deze actie kan niet ongedaan worden gemaakt.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={isDeleting}>Annuleren</AlertDialogCancel>
      <AlertDialogAction
        onClick={handleDelete}
        disabled={isDeleting}
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
      >
        {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Verwijderen
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## 8. Update: `AppSidebar.tsx`

### Nieuwe Badge voor Notulen

```typescript
// Nieuwe import
import { usePendingMinutesCount } from "@/hooks/notulen/usePendingMinutesCount";

// In AppSidebar component
const { pendingCount } = usePendingMinutesCount();
```

### Update MenuItem Interface & menuGroups

```typescript
// Extend badge type
badge?: 'taskCount' | 'validationCount' | 'pendingMinutesCount';

// Update Notulen item in menuGroups
{
  title: "Notulen",
  url: "/notulen",
  icon: FileText,
  badge: 'pendingMinutesCount', // NIEUW
}
```

### Update getBadgeCount functie

```typescript
const getBadgeCount = (badgeType?: string) => {
  if (badgeType === 'taskCount') return activeTaskCount;
  if (badgeType === 'validationCount') return validationCount;
  if (badgeType === 'pendingMinutesCount') return pendingCount; // NIEUW
  return undefined;
};
```

### Pass pendingCount naar CollapsibleGroup

```typescript
<CollapsibleGroup 
  group={group} 
  activeTaskCount={activeTaskCount} 
  validationCount={validationCount} 
  pendingMinutesCount={pendingCount}  // NIEUW
  canEdit={canEdit()} 
  isAdmin={isAdmin()}
  isOpen={openGroups[group.label] ?? false}
  onToggle={() => toggleGroup(group.label)}
/>
```

---

## 9. Update: `useUpdateMeetingMinute.ts` (Verbeterde Toasts)

### Enhanced Status Change Toasts

```typescript
if (updates.status) {
  const statusLabels: Record<string, string> = {
    draft: 'Concept',
    pending_approval: 'Wacht op goedkeuring',
    approved: 'Goedgekeurd',
    archived: 'Gearchiveerd',
  };
  
  // Specifiekere berichten per status transition
  if (updates.status === 'pending_approval') {
    toast.success("Notulen ingediend ter goedkeuring", {
      description: "Reviewers worden op de hoogte gesteld",
    });
  } else if (updates.status === 'approved') {
    toast.success("Notulen goedgekeurd", {
      description: "De notulen zijn nu definitief",
    });
  } else if (updates.status === 'archived') {
    toast.success("Notulen gearchiveerd");
  } else {
    toast.success(`Status gewijzigd naar "${statusLabels[updates.status]}"`);
  }
} else {
  toast.success("Wijzigingen opgeslagen");
}
```

---

## 10. Implementatie Volgorde

| Stap | Bestand | Prioriteit |
|------|---------|------------|
| 1 | Install `jspdf` + `jspdf-autotable` | HIGH |
| 2 | `src/utils/generateMeetingMinutesPDF.ts` | HIGH |
| 3 | `src/hooks/notulen/useDeleteMeetingMinute.ts` | HIGH |
| 4 | `src/hooks/notulen/usePendingMinutesCount.ts` | MEDIUM |
| 5 | Update `MeetingMinuteDetail.tsx` (PDF + Delete + Shortcuts) | HIGH |
| 6 | Update `AppSidebar.tsx` (badge count) | MEDIUM |
| 7 | Update `useUpdateMeetingMinute.ts` (toasts) | LOW |

---

## 11. Acceptatie Criteria Checklist

| Criterium | Implementatie |
|-----------|---------------|
| PDF export genereert A4 document | jspdf + autoTable |
| PDF bevat alle secties | Header, deelnemers, agenda, beslissingen, notities, footer |
| Nederlandse teksten in PDF | TYPE_LABELS, STATUS_LABELS, date-fns nl locale |
| Toast notificaties bij status | Enhanced messages in useUpdateMeetingMinute |
| Badge count op sidebar | usePendingMinutesCount + realtime subscription |
| Cmd+S shortcut werkt | Keyboard event listener |
| Delete met confirmation | AlertDialog + useDeleteMeetingMinute |
| Cascade delete werkt | task + meeting_minutes verwijderd |
| Geen console errors | Proper error handling |
| TypeScript compileert | Typed interfaces |

---

## 12. Wat NIET wordt gebouwd

| Item | Reden |
|------|-------|
| Email notificaties | Externe provider nodig |
| Notificatie center/inbox | Te complex voor deze fase |
| Recurring meetings | Out of scope |
| Meeting templates | Out of scope |
| Loading skeletons in detail | Minute wordt altijd meegegeven, geen async fetch in detail |

---

## 13. Bestandsoverzicht

| Bestand | Actie | Regels (geschat) |
|---------|-------|------------------|
| `src/utils/generateMeetingMinutesPDF.ts` | NIEUW | ~180 |
| `src/hooks/notulen/useDeleteMeetingMinute.ts` | NIEUW | ~50 |
| `src/hooks/notulen/usePendingMinutesCount.ts` | NIEUW | ~45 |
| `src/components/notulen/MeetingMinuteDetail.tsx` | UPDATE | +80 |
| `src/components/AppSidebar.tsx` | UPDATE | +15 |
| `src/hooks/notulen/useUpdateMeetingMinute.ts` | UPDATE | +10 |

**Totaal: ~380 nieuwe/gewijzigde regels**

---

## 14. Technische Risico's en Mitigaties

| Risico | Mitigatie |
|--------|-----------|
| jspdf bundle size impact | ~80KB gzipped, acceptable voor PDF feature |
| PDF rendering op mobile | jspdf werkt browser-agnostic, download via blob URL |
| Pending count query performance | HEAD query met count, geen volledige data fetch |
| Keyboard shortcut conflicts | Check isEditMode + open before triggering |
| Delete cascade fails | Transaction-like pattern: minute first, then task |

---

## 15. Package Installation

```bash
npm install jspdf jspdf-autotable
npm install --save-dev @types/jspdf
```

Note: `jspdf-autotable` ships with its own types.
