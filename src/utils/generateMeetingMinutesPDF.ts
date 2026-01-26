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
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(minute.tasks?.title || 'Naamloos', margin, yPos);
  yPos += 8;

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

  yPos += 8;

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
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [66, 66, 66] },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // ===== AGENDA =====
  if (minute.agenda_items.length > 0) {
    // Check page break
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

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
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [66, 66, 66] },
      columnStyles: {
        0: { cellWidth: 15 },
        2: { cellWidth: 25 },
        3: { cellWidth: 25 },
      },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // ===== BESLISSINGEN =====
  if (minute.decisions.length > 0) {
    // Check page break
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('BESLISSINGEN', margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    for (const decision of minute.decisions) {
      // Check page break
      if (yPos > 260) {
        doc.addPage();
        yPos = 20;
      }

      // Wrap long text
      const textLines = doc.splitTextToSize(`• ${decision.text}`, pageWidth - margin * 2 - 5);
      doc.text(textLines, margin + 2, yPos);
      yPos += textLines.length * 5;

      const decidedDate = decision.decided_at
        ? format(new Date(decision.decided_at), 'd MMM yyyy', { locale: nl })
        : '';
      const decidedBy = decision.decided_by || '-';
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(`  Besloten door: ${decidedBy} op ${decidedDate}`, margin + 4, yPos);
      doc.setTextColor(0);
      doc.setFontSize(10);
      yPos += 7;
    }

    yPos += 3;
  }

  // ===== NOTITIES =====
  if (minute.content) {
    // Check page break
    if (yPos > 220) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('NOTITIES', margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const textLines = doc.splitTextToSize(minute.content, pageWidth - margin * 2);
    
    // Handle multi-page notes
    for (const line of textLines) {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      doc.text(line, margin, yPos);
      yPos += 5;
    }
    
    yPos += 5;
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
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128);
    const footerText = `Gegenereerd op ${format(new Date(), 'd MMMM yyyy', { locale: nl })} | ${organizationName}`;
    doc.text(footerText, margin, 285);
    doc.text(`Pagina ${i} van ${pageCount}`, pageWidth - margin - 25, 285);
  }

  // ===== DOWNLOAD =====
  const safeTitle = minute.tasks?.title?.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase() || 'export';
  const fileName = `notulen-${safeTitle}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  doc.save(fileName);
}
