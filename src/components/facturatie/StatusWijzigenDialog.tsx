import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

import { useUpdateFactuur } from "@/hooks/facturatie";
import { type FactuurStatus, FACTUUR_STATUS_LABELS } from "@/types/facturatie";

interface StatusWijzigenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factuurId: string;
  huidigeStatus: FactuurStatus;
}

// KRITIEK: Exacte status transitions - NIET WIJZIGEN
const ALLOWED_TRANSITIONS: Record<FactuurStatus, FactuurStatus[]> = {
  CONCEPT: ["DEFINITIEF"],
  DEFINITIEF: ["CONCEPT", "VERZONDEN"],
  VERZONDEN: ["HERINNERING_1", "BETWIST", "BETAALD", "AFGEBOEKT"],
  HERINNERING_1: ["HERINNERING_2", "BETWIST", "BETAALD", "AFGEBOEKT"],
  HERINNERING_2: ["HERINNERING_3", "BETWIST", "BETAALD", "AFGEBOEKT"],
  HERINNERING_3: ["BETWIST", "BETAALD", "AFGEBOEKT"],
  BETWIST: ["VERZONDEN", "BETAALD", "AFGEBOEKT"],
  BETAALD: [],
  AFGEBOEKT: [],
};

export function StatusWijzigenDialog({
  open,
  onOpenChange,
  factuurId,
  huidigeStatus,
}: StatusWijzigenDialogProps) {
  const { updateStatus, isUpdating } = useUpdateFactuur();
  const [nieuweStatus, setNieuweStatus] = useState<FactuurStatus | "">("");

  const allowedStatuses = ALLOWED_TRANSITIONS[huidigeStatus] || [];

  const handleSubmit = async () => {
    if (!nieuweStatus) return;

    try {
      await updateStatus(factuurId, nieuweStatus);
      onOpenChange(false);
      setNieuweStatus("");
    } catch (error) {
      // Error handled by hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Status wijzigen</DialogTitle>
          <DialogDescription>
            Huidige status: {FACTUUR_STATUS_LABELS[huidigeStatus]}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="space-y-2">
            <Label>Nieuwe status</Label>
            {allowedStatuses.length > 0 ? (
              <Select value={nieuweStatus} onValueChange={(v) => setNieuweStatus(v as FactuurStatus)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecteer nieuwe status" />
                </SelectTrigger>
                <SelectContent>
                  {allowedStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {FACTUUR_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                Geen statuswijzigingen mogelijk vanuit {FACTUUR_STATUS_LABELS[huidigeStatus]}.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button onClick={handleSubmit} disabled={!nieuweStatus || isUpdating}>
            {isUpdating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Bezig...
              </>
            ) : (
              "Status wijzigen"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
