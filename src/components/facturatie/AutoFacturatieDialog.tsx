import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { nl } from "date-fns/locale";
import { Loader2, Zap, ChevronDown, ChevronUp, Receipt, Check, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAutoFacturatie } from "@/hooks/facturatie/useAutoFacturatie";

interface AutoFacturatieDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

export function AutoFacturatieDialog({ open, onOpenChange }: AutoFacturatieDialogProps) {
  const navigate = useNavigate();
  const { isLoading, preview, generateResult, error, fetchPreview, generateFacturen, reset } = useAutoFacturatie();

  const [periodType, setPeriodType] = useState<"vorige" | "deze">("vorige");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { periodStart, periodEnd, periodLabel } = useMemo(() => {
    const ref = periodType === "vorige" ? subMonths(new Date(), 1) : new Date();
    return {
      periodStart: format(startOfMonth(ref), "yyyy-MM-dd"),
      periodEnd: format(endOfMonth(ref), "yyyy-MM-dd"),
      periodLabel: format(ref, "MMMM yyyy", { locale: nl }),
    };
  }, [periodType]);

  // Determine wizard step
  const step = generateResult ? 3 : preview ? 2 : 1;

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      reset();
      setSelectedIds(new Set());
      setExpandedIds(new Set());
      setPeriodType("vorige");
    }, 200);
  };

  const handlePreview = () => {
    fetchPreview(periodStart, periodEnd);
  };

  const handleGenerate = () => {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
    generateFacturen(periodStart, periodEnd, ids);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (!preview) return;
    if (selectedIds.size === preview.opdrachtgevers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(preview.opdrachtgevers.map((o) => o.id)));
    }
  };

  const selectedCount = selectedIds.size > 0 ? selectedIds.size : (preview?.opdrachtgevers.length ?? 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <Zap className="h-5 w-5" />
            Auto-facturatie
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Selecteer een periode om factureerbare diensten op te halen."}
            {step === 2 && "Controleer de preview en selecteer opdrachtgevers."}
            {step === 3 && "Facturen zijn succesvol aangemaakt."}
          </DialogDescription>
        </DialogHeader>

        {/* Error */}
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Step 1: Period */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={periodType === "vorige" ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriodType("vorige")}
                className={periodType === "vorige" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
              >
                Vorige maand
              </Button>
              <Button
                variant={periodType === "deze" ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriodType("deze")}
                className={periodType === "deze" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
              >
                Deze maand
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Periode: <span className="font-medium capitalize">{periodLabel}</span>{" "}
              ({periodStart} t/m {periodEnd})
            </p>
          </div>
        )}

        {/* Step 2: Preview */}
        {step === 2 && preview && (
          <div className="space-y-4">
            {/* Totals */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center">
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{preview.totalen.opdrachtgevers}</p>
                <p className="text-xs text-muted-foreground">Opdrachtgevers</p>
              </div>
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center">
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{preview.totalen.uren.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">Uren</p>
              </div>
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center">
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(preview.totalen.bedrag)}</p>
                <p className="text-xs text-muted-foreground">Totaal (excl. BTW)</p>
              </div>
            </div>

            {preview.opdrachtgevers.length === 0 ? (
              <div className="text-center py-8">
                <Receipt className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Geen factureerbare diensten gevonden in deze periode.</p>
              </div>
            ) : (
              <>
                {/* Select all */}
                <div className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedIds.size === preview.opdrachtgevers.length}
                    onCheckedChange={selectAll}
                  />
                  <span className="text-muted-foreground">Alles selecteren</span>
                </div>

                <ScrollArea className="max-h-[400px]">
                  <div className="space-y-2 pr-3">
                    {preview.opdrachtgevers.map((opdr) => (
                      <div key={opdr.id} className="rounded-lg border p-3">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={selectedIds.has(opdr.id)}
                            onCheckedChange={() => toggleSelect(opdr.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{opdr.naam}</p>
                            <p className="text-xs text-muted-foreground">
                              {opdr.diensten_count} diensten · {opdr.toewijzingen_count} toewijzingen · {opdr.totaal_uren.toFixed(1)} uur
                            </p>
                          </div>
                          <span className="font-semibold text-sm whitespace-nowrap">{formatCurrency(opdr.totaal_bedrag)}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => toggleExpand(opdr.id)}
                          >
                            {expandedIds.has(opdr.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </div>

                        {expandedIds.has(opdr.id) && (
                          <div className="mt-2 pl-8 space-y-1">
                            {opdr.toewijzingen.map((t) => (
                              <div key={t.toewijzing_id} className="flex items-center justify-between text-xs text-muted-foreground">
                                <span className="truncate flex-1">
                                  {t.datum} — {t.dienst_titel} — {t.professional_naam}
                                </span>
                                <span className="whitespace-nowrap ml-2">
                                  {t.uren}u × {formatCurrency(t.tarief)} = {formatCurrency(t.bedrag)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </>
            )}
          </div>
        )}

        {/* Step 3: Result */}
        {step === 3 && generateResult && (
          <div className="space-y-4">
            <div className="flex flex-col items-center py-4">
              <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mb-3">
                <Check className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="font-medium">
                {generateResult.totalen.facturen} {generateResult.totalen.facturen === 1 ? "factuur" : "facturen"} aangemaakt
              </p>
              <p className="text-sm text-muted-foreground">
                {generateResult.totalen.regels} regels · {formatCurrency(generateResult.totalen.bedrag)}
              </p>
            </div>

            <ScrollArea className="max-h-[300px]">
              <div className="space-y-2 pr-3">
                {generateResult.created_facturen.map((f) => (
                  <div key={f.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium text-sm">{f.factuur_nummer}</p>
                      <p className="text-xs text-muted-foreground">{f.opdrachtgever_naam} · {f.regels_count} regels</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                        {formatCurrency(f.totaal)}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => navigate(`/facturatie/${f.id}`)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          {step === 1 && (
            <Button
              onClick={handlePreview}
              disabled={isLoading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
              Preview ophalen
            </Button>
          )}
          {step === 2 && preview && preview.opdrachtgevers.length > 0 && (
            <Button
              onClick={handleGenerate}
              disabled={isLoading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Receipt className="h-4 w-4 mr-2" />}
              Genereer {selectedCount} {selectedCount === 1 ? "factuur" : "facturen"}
            </Button>
          )}
          {step === 3 && (
            <Button onClick={handleClose}>Sluiten</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
