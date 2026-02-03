import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Info,
} from "lucide-react";

import { useFactuurExport } from "@/hooks/facturatie";
import type { FactuurFilters, ExportFormat } from "@/types/facturatie";

interface FactuurExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters?: FactuurFilters;
  selectedIds?: string[];
  totalCount?: number;
}

export function FactuurExportDialog({
  open,
  onOpenChange,
  filters,
  selectedIds,
  totalCount = 0,
}: FactuurExportDialogProps) {
  const { exportFacturen, isExporting } = useFactuurExport();
  const [format, setFormat] = useState<ExportFormat>('xlsx');

  const hasSelection = selectedIds && selectedIds.length > 0;
  const exportCount = hasSelection ? selectedIds.length : totalCount;

  const handleExport = async () => {
    try {
      await exportFacturen(format, filters, selectedIds);
      onOpenChange(false);
    } catch (error) {
      // Error handled by hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Facturen exporteren
          </DialogTitle>
          <DialogDescription>
            {hasSelection
              ? `${selectedIds.length} geselecteerde facturen exporteren`
              : `${totalCount} facturen exporteren (huidige filters)`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Format selection */}
          <div className="space-y-3">
            <Label>Export formaat</Label>
            <RadioGroup
              value={format}
              onValueChange={(v) => setFormat(v as ExportFormat)}
              className="grid grid-cols-2 gap-4"
            >
              <div className="relative">
                <RadioGroupItem
                  value="xlsx"
                  id="xlsx"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="xlsx"
                  className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer"
                >
                  <FileSpreadsheet className="h-8 w-8" />
                  <span className="font-medium">Excel (.xlsx)</span>
                  <span className="text-xs text-muted-foreground">
                    Aanbevolen
                  </span>
                </Label>
              </div>

              <div className="relative">
                <RadioGroupItem
                  value="csv"
                  id="csv"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="csv"
                  className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer"
                >
                  <FileText className="h-8 w-8" />
                  <span className="font-medium">CSV</span>
                  <span className="text-xs text-muted-foreground">
                    Compatibel
                  </span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Info */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              De export bevat: factuurnummer, type, status, datum, vervaldatum,
              opdrachtgever, subtotaal, BTW, totaal, betaald en openstaand bedrag.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button onClick={handleExport} disabled={isExporting || exportCount === 0}>
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Exporteren...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                {exportCount} facturen exporteren
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
