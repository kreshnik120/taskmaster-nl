import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { 
  FactuurFilters, 
  FactuurExportRow, 
  ExportFormat,
  FACTUUR_STATUS_LABELS,
  FACTUUR_TYPE_LABELS 
} from '@/types/facturatie';

// Import labels for mapping
const STATUS_LABELS: Record<string, string> = {
  CONCEPT: 'Concept',
  DEFINITIEF: 'Definitief',
  VERZONDEN: 'Verzonden',
  HERINNERING_1: 'Herinnering 1',
  HERINNERING_2: 'Herinnering 2',
  HERINNERING_3: 'Herinnering 3',
  BETWIST: 'Betwist',
  BETAALD: 'Betaald',
  AFGEBOEKT: 'Afgeboekt',
};

const TYPE_LABELS: Record<string, string> = {
  VERKOOP: 'Verkoopfactuur',
  SELFBILLING: 'Self-billing',
  INKOOP: 'Inkoopfactuur',
  CREDIT: 'Creditnota',
};

interface UseFactuurExportResult {
  exportFacturen: (
    format: ExportFormat,
    filters?: FactuurFilters,
    selectedIds?: string[]
  ) => Promise<void>;
  isExporting: boolean;
}

export function useFactuurExport(): UseFactuurExportResult {
  const [isExporting, setIsExporting] = useState(false);

  const fetchExportData = async (
    filters?: FactuurFilters,
    selectedIds?: string[]
  ): Promise<FactuurExportRow[]> => {
    let query = supabase
      .from('factuur')
      .select(`
        factuur_nummer,
        type,
        status,
        factuurdatum,
        vervaldatum,
        subtotaal,
        btw_percentage,
        btw_bedrag,
        totaal,
        betaald_bedrag,
        openstaand_bedrag,
        opdrachtgever_id,
        clients:opdrachtgever_id (name)
      `)
      .is('deleted_at', null);

    // Apply filters
    if (selectedIds && selectedIds.length > 0) {
      query = query.in('id', selectedIds);
    } else if (filters) {
      if (filters.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        query = query.in('status', statuses);
      }
      if (filters.type) {
        const types = Array.isArray(filters.type) ? filters.type : [filters.type];
        query = query.in('type', types);
      }
      if (filters.opdrachtgever_id) {
        query = query.eq('opdrachtgever_id', filters.opdrachtgever_id);
      }
      if (filters.factuurdatum_van) {
        query = query.gte('factuurdatum', filters.factuurdatum_van);
      }
      if (filters.factuurdatum_tot) {
        query = query.lte('factuurdatum', filters.factuurdatum_tot);
      }
      if (filters.alleen_openstaand) {
        query = query.gt('openstaand_bedrag', 0);
      }
    }

    query = query.order('factuurdatum', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((row: any) => ({
      factuurnummer: row.factuur_nummer,
      type: TYPE_LABELS[row.type] || row.type,
      status: STATUS_LABELS[row.status] || row.status,
      factuurdatum: row.factuurdatum,
      vervaldatum: row.vervaldatum,
      opdrachtgever: row.clients?.name || '-',
      subtotaal: row.subtotaal,
      btw_percentage: row.btw_percentage,
      btw_bedrag: row.btw_bedrag,
      totaal: row.totaal,
      betaald_bedrag: row.betaald_bedrag,
      openstaand_bedrag: row.openstaand_bedrag,
    }));
  };

  const formatNumber = (value: number): string => {
    // Dutch format: comma as decimal separator
    return value.toFixed(2).replace('.', ',');
  };

  const exportToCSV = (data: FactuurExportRow[]): void => {
    const headers = [
      'Factuurnummer',
      'Type',
      'Status',
      'Factuurdatum',
      'Vervaldatum',
      'Opdrachtgever',
      'Subtotaal',
      'BTW %',
      'BTW Bedrag',
      'Totaal',
      'Betaald',
      'Openstaand',
    ];

    const rows = data.map((row) => [
      row.factuurnummer,
      row.type,
      row.status,
      row.factuurdatum,
      row.vervaldatum,
      `"${row.opdrachtgever.replace(/"/g, '""')}"`,
      formatNumber(row.subtotaal),
      formatNumber(row.btw_percentage),
      formatNumber(row.btw_bedrag),
      formatNumber(row.totaal),
      formatNumber(row.betaald_bedrag),
      formatNumber(row.openstaand_bedrag),
    ]);

    // Use semicolon as separator (Dutch Excel default)
    const csvContent = [
      headers.join(';'),
      ...rows.map((row) => row.join(';')),
    ].join('\r\n');

    // Add BOM for UTF-8 encoding (Excel compatibility)
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `facturen-export-${new Date().toISOString().split('T')[0]}.csv`);
  };

  const exportToExcel = async (data: FactuurExportRow[]): Promise<void> => {
    // Dynamic import for xlsx
    const XLSX = await import('xlsx');

    const worksheetData = data.map((row) => ({
      'Factuurnummer': row.factuurnummer,
      'Type': row.type,
      'Status': row.status,
      'Factuurdatum': row.factuurdatum,
      'Vervaldatum': row.vervaldatum,
      'Opdrachtgever': row.opdrachtgever,
      'Subtotaal': row.subtotaal,
      'BTW %': row.btw_percentage,
      'BTW Bedrag': row.btw_bedrag,
      'Totaal': row.totaal,
      'Betaald': row.betaald_bedrag,
      'Openstaand': row.openstaand_bedrag,
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);

    // Set column widths
    worksheet['!cols'] = [
      { wch: 18 }, // Factuurnummer
      { wch: 15 }, // Type
      { wch: 14 }, // Status
      { wch: 12 }, // Factuurdatum
      { wch: 12 }, // Vervaldatum
      { wch: 30 }, // Opdrachtgever
      { wch: 12 }, // Subtotaal
      { wch: 8 },  // BTW %
      { wch: 12 }, // BTW Bedrag
      { wch: 12 }, // Totaal
      { wch: 12 }, // Betaald
      { wch: 12 }, // Openstaand
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Facturen');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    downloadBlob(blob, `facturen-export-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const downloadBlob = (blob: Blob, filename: string): void => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportFacturen = async (
    format: ExportFormat,
    filters?: FactuurFilters,
    selectedIds?: string[]
  ): Promise<void> => {
    setIsExporting(true);
    try {
      const data = await fetchExportData(filters, selectedIds);

      if (data.length === 0) {
        toast.warning('Geen facturen om te exporteren');
        return;
      }

      if (format === 'csv') {
        exportToCSV(data);
      } else {
        await exportToExcel(data);
      }

      toast.success(`${data.length} facturen geëxporteerd naar ${format.toUpperCase()}`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Fout bij exporteren facturen');
    } finally {
      setIsExporting(false);
    }
  };

  return {
    exportFacturen,
    isExporting,
  };
}
