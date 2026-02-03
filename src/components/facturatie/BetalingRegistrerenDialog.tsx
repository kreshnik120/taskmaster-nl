import { useState } from "react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Loader2 } from "lucide-react";

import { useCreateBetaling } from "@/hooks/facturatie";
import { BETALING_METHODE_LABELS, type BetalingMethode } from "@/types/facturatie";

interface BetalingRegistrerenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factuurId: string;
  openstaandBedrag: number;
}

export function BetalingRegistrerenDialog({
  open,
  onOpenChange,
  factuurId,
  openstaandBedrag,
}: BetalingRegistrerenDialogProps) {
  const { createBetaling, isCreating } = useCreateBetaling();

  const [bedrag, setBedrag] = useState(openstaandBedrag.toFixed(2));
  const [datum, setDatum] = useState(format(new Date(), "yyyy-MM-dd"));
  const [methode, setMethode] = useState<BetalingMethode>("BANK");
  const [referentie, setReferentie] = useState("");
  const [opmerking, setOpmerking] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createBetaling({
        factuur_id: factuurId,
        bedrag: parseFloat(bedrag),
        datum,
        methode,
        referentie: referentie || null,
        opmerking: opmerking || null,
      });
      onOpenChange(false);
      // Reset form
      setBedrag(openstaandBedrag.toFixed(2));
      setReferentie("");
      setOpmerking("");
    } catch (error) {
      // Error handled by hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Betaling registreren</DialogTitle>
          <DialogDescription>
            Openstaand bedrag: €{openstaandBedrag.toFixed(2)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bedrag">Bedrag *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                  <Input
                    id="bedrag"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={openstaandBedrag}
                    value={bedrag}
                    onChange={(e) => setBedrag(e.target.value)}
                    className="pl-8"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="datum">Datum *</Label>
                <Input
                  id="datum"
                  type="date"
                  value={datum}
                  onChange={(e) => setDatum(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="methode">Betaalmethode</Label>
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

            <div className="space-y-2">
              <Label htmlFor="referentie">Referentie</Label>
              <Input
                id="referentie"
                placeholder="Bankreferentie of transactienummer"
                value={referentie}
                onChange={(e) => setReferentie(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="opmerking">Opmerking</Label>
              <Textarea
                id="opmerking"
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
            <Button type="submit" disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Bezig...
                </>
              ) : (
                "Betaling registreren"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
