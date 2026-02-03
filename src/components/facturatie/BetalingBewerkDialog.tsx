import { useState, useEffect } from "react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
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
import { Loader2, Edit } from "lucide-react";

import { useUpdateBetaling } from "@/hooks/facturatie";
import { BETALING_METHODE_LABELS, type Betaling, type BetalingMethode } from "@/types/facturatie";

interface BetalingBewerkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  betaling: Betaling;
  factuurId: string;
}

export function BetalingBewerkDialog({
  open,
  onOpenChange,
  betaling,
  factuurId,
}: BetalingBewerkDialogProps) {
  const { updateBetaling, isUpdating } = useUpdateBetaling();

  const [bedrag, setBedrag] = useState(betaling.bedrag.toFixed(2));
  const [datum, setDatum] = useState(betaling.datum);
  const [methode, setMethode] = useState<BetalingMethode>(betaling.methode as BetalingMethode);
  const [referentie, setReferentie] = useState(betaling.referentie || "");
  const [opmerking, setOpmerking] = useState(betaling.opmerking || "");

  // Reset form when dialog opens or betaling changes
  useEffect(() => {
    if (open) {
      setBedrag(betaling.bedrag.toFixed(2));
      setDatum(betaling.datum);
      setMethode(betaling.methode as BetalingMethode);
      setReferentie(betaling.referentie || "");
      setOpmerking(betaling.opmerking || "");
    }
  }, [open, betaling]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateBetaling(betaling.id, factuurId, {
        bedrag: parseFloat(bedrag),
        datum,
        methode,
        referentie: referentie || null,
        opmerking: opmerking || null,
      });
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
            <Edit className="h-5 w-5" />
            Betaling bewerken
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="edit-bedrag">Bedrag *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                <Input
                  id="edit-bedrag"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={bedrag}
                  onChange={(e) => setBedrag(e.target.value)}
                  className="pl-8"
                  required
                />
              </div>
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="edit-datum">Datum *</Label>
              <Input
                id="edit-datum"
                type="date"
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
                max={format(new Date(), "yyyy-MM-dd")}
                required
              />
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <Label htmlFor="edit-methode">Betaalmethode</Label>
              <Select value={methode} onValueChange={(v) => setMethode(v as BetalingMethode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(BETALING_METHODE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reference */}
            <div className="space-y-2">
              <Label htmlFor="edit-referentie">Referentie</Label>
              <Input
                id="edit-referentie"
                placeholder="Bankreferentie of transactienummer"
                value={referentie}
                onChange={(e) => setReferentie(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="edit-opmerking">Opmerking</Label>
              <Textarea
                id="edit-opmerking"
                placeholder="Optionele opmerking"
                value={opmerking}
                onChange={(e) => setOpmerking(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuleren
            </Button>
            <Button type="submit" disabled={isUpdating}>
              {isUpdating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Bezig...
                </>
              ) : (
                "Opslaan"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
