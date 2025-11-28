import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Mail, Download, Trash2, CheckCircle, Pause, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

interface ProfessionalBulkActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkChangeStatus: (status: string) => void;
  onBulkEmail: () => void;
  onBulkExport: () => void;
  onBulkDelete: () => void;
}

export function ProfessionalBulkActionBar({
  selectedCount,
  onClearSelection,
  onBulkChangeStatus,
  onBulkEmail,
  onBulkExport,
  onBulkDelete,
}: ProfessionalBulkActionBarProps) {
  const [statusToChange, setStatusToChange] = useState<string>("");

  if (selectedCount === 0) return null;

  const handleStatusChange = (status: string) => {
    setStatusToChange(status);
    onBulkChangeStatus(status);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-background border border-border rounded-lg shadow-2xl p-4 min-w-[600px]"
    >
      <div className="flex items-center gap-4">
        {/* Selection Count */}
        <div className="flex items-center gap-2">
          <div className="bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center text-sm font-semibold">
            {selectedCount}
          </div>
          <span className="text-sm font-medium">geselecteerd</span>
        </div>

        <div className="h-6 w-px bg-border" />

        {/* Status Change Dropdown */}
        <Select value={statusToChange} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status wijzigen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="actief">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span>Actief</span>
              </div>
            </SelectItem>
            <SelectItem value="inactief">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-600" />
                <span>Inactief</span>
              </div>
            </SelectItem>
            <SelectItem value="op_pauze">
              <div className="flex items-center gap-2">
                <Pause className="w-4 h-4 text-orange-600" />
                <span>Op pauze</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>

        <div className="h-6 w-px bg-border" />

        {/* Action Buttons */}
        <Button
          variant="outline"
          size="sm"
          onClick={onBulkEmail}
          className="gap-2"
        >
          <Mail className="w-4 h-4" />
          Email verzenden
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onBulkExport}
          className="gap-2"
        >
          <Download className="w-4 h-4" />
          Exporteer CSV
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onBulkDelete}
          className="gap-2 text-destructive hover:text-destructive"
        >
          <Trash2 className="w-4 h-4" />
          Verwijderen
        </Button>

        <div className="h-6 w-px bg-border" />

        {/* Clear Selection */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          className="gap-2"
        >
          <X className="w-4 h-4" />
          Annuleren
        </Button>
      </div>
    </motion.div>
  );
}
