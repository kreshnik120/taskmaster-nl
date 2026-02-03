import { useState, useEffect } from "react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  AlertTriangle,
  Info,
  CreditCard,
  Euro,
  Calendar,
  CheckCircle2,
} from "lucide-react";

import { useCreateBetaling } from "@/hooks/facturatie";
import { BETALING_METHODE_LABELS, type BetalingMethode } from "@/types/facturatie";

interface BetalingRegistrerenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factuurId: string;
  factuurNummer?: string;
  openstaandBedrag: number;
  totaalBedrag?: number;
  reedsBetaald?: number;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

export function BetalingRegistrerenDialog({
  open,
  onOpenChange,
  factuurId,
  factuurNummer,
  openstaandBedrag,
  totaalBedrag = openstaandBedrag,
  reedsBetaald = 0,
}: BetalingRegistrerenDialogProps) {
  const { createBetaling, isCreating } = useCreateBetaling();

  const [bedrag, setBedrag] = useState("");
  const [datum, setDatum] = useState(format(new Date(), "yyyy-MM-dd"));
  const [methode, setMethode] = useState<BetalingMethode>("BANK");
  const [referentie, setReferentie] = useState("");
  const [opmerking, setOpmerking] = useState("");

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setBedrag(openstaandBedrag.toFixed(2));
      setDatum(format(new Date(), "yyyy-MM-dd"));
      setMethode("BANK");
      setReferentie("");
      setOpmerking("");
    }
  }, [open, openstaandBedrag]);

  const bedragNum = parseFloat(bedrag) || 0;
  const isOverpayment = bedragNum > openstaandBedrag;
  const isPartialPayment = bedragNum < openstaandBedrag && bedragNum > 0;
  const nieuwOpenstaand = Math.max(0, openstaandBedrag - bedragNum);
  const isFullPayment = nieuwOpenstaand === 0 && bedragNum > 0;
  const canSubmit = bedragNum > 0 && !isCreating;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createBetaling({
        factuur_id: factuurId,
        bedrag: bedragNum,
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

  const handleQuickAmount = (amount: number) => {
    setBedrag(amount.toFixed(2));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Betaling registreren
          </DialogTitle>
          <DialogDescription>
            {factuurNummer && <span className="font-medium">{factuurNummer}</span>}
          </DialogDescription>
        </DialogHeader>

        {/* Invoice Summary */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Factuurbedrag</span>
            <span className="font-medium">{formatCurrency(totaalBedrag)}</span>
          </div>
          {reedsBetaald > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Reeds betaald</span>
              <span className="text-green-600">- {formatCurrency(reedsBetaald)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between text-sm font-medium">
            <span>Openstaand</span>
            <span className="text-primary">{formatCurrency(openstaandBedrag)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-2">
            {/* Amount Input */}
            <div className="space-y-2">
              <Label htmlFor="bedrag" className="flex items-center gap-1">
                <Euro className="h-3.5 w-3.5" />
                Bedrag *
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                <Input
                  id="bedrag"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={bedrag}
                  onChange={(e) => setBedrag(e.target.value)}
                  className="pl-8 text-lg font-medium"
                  required
                />
              </div>
              {/* Quick amount buttons */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickAmount(openstaandBedrag)}
                  className={bedragNum === openstaandBedrag ? "border-primary" : ""}
                >
                  Volledig ({formatCurrency(openstaandBedrag)})
                </Button>
                {openstaandBedrag > 100 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickAmount(Math.round(openstaandBedrag / 2 * 100) / 100)}
                  >
                    50% ({formatCurrency(openstaandBedrag / 2)})
                  </Button>
                )}
              </div>
            </div>

            {/* Warnings/Info */}
            {isOverpayment && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Het bedrag is hoger dan het openstaande bedrag. Dit resulteert in een tegoed van {formatCurrency(bedragNum - openstaandBedrag)}.
                </AlertDescription>
              </Alert>
            )}

            {isPartialPayment && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Dit is een deelbetaling. Na deze betaling staat nog {formatCurrency(nieuwOpenstaand)} open.
                </AlertDescription>
              </Alert>
            )}

            {isFullPayment && (
              <Alert className="border-green-200 bg-green-50 text-green-800">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700">
                  Met deze betaling wordt de factuur volledig voldaan en automatisch op status "Betaald" gezet.
                </AlertDescription>
              </Alert>
            )}

            {/* Date Input */}
            <div className="space-y-2">
              <Label htmlFor="datum" className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Datum *
              </Label>
              <Input
                id="datum"
                type="date"
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
                max={format(new Date(), "yyyy-MM-dd")}
                required
              />
            </div>

            {/* Payment Method */}
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

            {/* Reference */}
            <div className="space-y-2">
              <Label htmlFor="referentie">Referentie / Transactienummer</Label>
              <Input
                id="referentie"
                placeholder="Bankreferentie of transactienummer"
                value={referentie}
                onChange={(e) => setReferentie(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="opmerking">Interne opmerking</Label>
              <Textarea
                id="opmerking"
                placeholder="Optionele opmerking"
                value={opmerking}
                onChange={(e) => setOpmerking(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuleren
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Bezig...
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Betaling registreren
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
