import { useState } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { Lock, MessageSquare, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DienstStatusBadge } from "./DienstStatusBadge";
import { ToewijzingenBeheer } from "./ToewijzingenBeheer";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { DienstData } from "@/hooks/useDienstenPlanning";

interface DienstDetailSheetProps {
  dienst: DienstData | null;
  open: boolean;
  onClose: () => void;
  onEdit: (dienst: DienstData) => void;
  onCopy: (dienst: DienstData) => void;
  onDelete: (dienst: DienstData) => void;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-white/10 dark:border-white/5 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xs font-medium text-foreground text-right">{children}</dd>
    </div>
  );
}

export function DienstDetailSheet({ dienst, open, onClose, onEdit, onCopy, onDelete }: DienstDetailSheetProps) {
  const queryClient = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<"sluiten" | null>(null);

  if (!dienst) return null;

  const heeftPositieveReacties = dienst.toewijzingen.some((t) => t.status === "positief");
  const isAfgelopen = ["geannuleerd", "voltooid"].includes(dienst.status);
  const formatTijd = (t: string) => t?.slice(0, 5) ?? "";
  const formatTarief = (n: number | null) => n != null ? `€${n.toFixed(2).replace(".", ",")}` : "—";

  const handleSluitenDienst = async () => {
    const { data: updated, error } = await supabase
      .from("diensten")
      .update({ status: "geannuleerd" })
      .eq("id", dienst.id)
      .eq("lock_version", dienst.lock_version)
      .select("id")
      .maybeSingle();

    if (error) { toast.error("Kon dienst niet sluiten"); return; }
    if (!updated) {
      toast.error("Dienst is ondertussen gewijzigd. Vernieuw de pagina.");
      setConfirmAction(null);
      return;
    }
    toast.success("Dienst gesloten");
    setConfirmAction(null);
    queryClient.invalidateQueries({ queryKey: ["diensten-planning"] });
    onClose();
  };

  const handleBevestigen = async () => {
    const { error } = await supabase
      .from("dienst_toewijzingen")
      .update({ status: "bevestigd" })
      .eq("dienst_id", dienst.id)
      .in("status", ["positief"]);
    if (error) { toast.error("Bevestigen mislukt"); return; }
    toast.success("Alle positieve reacties bevestigd");
    queryClient.invalidateQueries({ queryKey: ["diensten-planning"] });
    onClose();
  };

  const bronLabel: Record<string, string> = {
    handmatig: "Handmatig",
    gekopieerd: "Gekopieerd",
    herhaling: "Herhaling",
    geimporteerd: "Geïmporteerd",
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="right" className="w-full max-w-3xl overflow-y-auto p-0 sm:max-w-3xl">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-white/10 dark:border-white/5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <SheetTitle className="text-base truncate">
                  {dienst.sublocation?.location?.organization?.name} / {dienst.sublocation?.naam}
                </SheetTitle>
                <div className="mt-1">
                  <DienstStatusBadge status={dienst.status} />
                </div>
              </div>
            </div>
          </SheetHeader>

          <div className="px-6 py-4 space-y-6">
            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {!isAfgelopen && (
                <Button variant="destructive" size="sm" className="h-8 text-xs" onClick={() => setConfirmAction("sluiten")}>
                  Sluiten dienst
                </Button>
              )}
              {heeftPositieveReacties && (
                <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleBevestigen}>
                  Bevestigen
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onEdit(dienst)}>
                Bewerken
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onCopy(dienst)}>
                Kopiëren
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => onDelete(dienst)}>
                Verwijderen
              </Button>
            </div>

            {/* Two column layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: Dienst details */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Dienst details</h3>
                <dl className="space-y-0">
                  <DetailRow label="Datum">
                    {format(parseISO(dienst.datum), "EEEE d MMMM yyyy", { locale: nl })}
                  </DetailRow>
                  <DetailRow label="Tijden">
                    {formatTijd(dienst.start_tijd)} tot {formatTijd(dienst.eind_tijd)}
                  </DetailRow>
                  <DetailRow label="Netto uren">{dienst.netto_uren} uur</DetailRow>
                  <DetailRow label="Functieniveau">
                    <span className="font-semibold">
                      {dienst.gevraagd_functie_niveau?.length > 0
                        ? dienst.gevraagd_functie_niveau.join(", ")
                        : "—"}
                    </span>
                  </DetailRow>
                  {dienst.vereiste_certificeringen?.length > 0 && (
                    <DetailRow label="Certificeringen">
                      <span className="font-semibold">{dienst.vereiste_certificeringen.join(", ")}</span>
                    </DetailRow>
                  )}
                  <DetailRow label="Dienst type">{dienst.dienst_type ?? "—"}</DetailRow>
                  {dienst.is_slaapdienst && (
                    <>
                      <DetailRow label="Slaapdienst">Ja</DetailRow>
                      <DetailRow label="Slaapperiode">
                        {dienst.slaap_start_tijd?.slice(0, 5) ?? "—"} tot {dienst.slaap_eind_tijd?.slice(0, 5) ?? "—"}
                      </DetailRow>
                    </>
                  )}
                  <DetailRow label="Werkvorm">{dienst.werkvorm ?? "—"}</DetailRow>
                  <DetailRow label="Tarief">{formatTarief(dienst.tarief_per_uur)} /uur</DetailRow>
                  <DetailRow label="Gevraagd aantal">{dienst.gevraagd_aantal}</DetailRow>
                  {dienst.gevraagd_aantal > 1 && (
                    <div className="flex gap-1 mt-1 mb-1">
                      {Array.from({ length: dienst.gevraagd_aantal }, (_, i) => i + 1).map((nr) => {
                        const bezet = dienst.toewijzingen.some(
                          (t) => t.positie_nr === nr && ["bevestigd", "positief"].includes(t.status)
                        );
                        return (
                          <div key={nr} className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold",
                            bezet
                              ? "bg-emerald-500 text-white"
                              : "bg-amber-100 text-amber-700 border border-amber-300"
                          )} title={bezet ? `Positie ${nr}: Bezet` : `Positie ${nr}: Open`}>
                            {nr}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <DetailRow label="Accepteerbaar">{dienst.accepteerbaar ? "Ja" : "Nee"}</DetailRow>
                  <DetailRow label="Bron">{bronLabel[dienst.bron] ?? dienst.bron}</DetailRow>
                  {dienst.is_spoed && (
                    <DetailRow label="Spoed">
                      <span className="text-red-600 dark:text-red-400 font-semibold">🚨 JA</span>
                    </DetailRow>
                  )}
                  {dienst.kleur && (
                    <DetailRow label="Kleur">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: dienst.kleur }} />
                      </span>
                    </DetailRow>
                  )}
                  <DetailRow label="Aangemaakt op">
                    {format(parseISO(dienst.created_at), "d MMM yyyy", { locale: nl })}
                  </DetailRow>
                </dl>

                {dienst.prive_opmerking && (
                  <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/40 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Lock className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400" />
                      <span className="text-[10px] font-medium text-yellow-700 dark:text-yellow-400">Privé opmerking</span>
                    </div>
                    <p className="text-xs text-yellow-800 dark:text-yellow-300">{dienst.prive_opmerking}</p>
                  </div>
                )}

                {dienst.publieke_opmerking && (
                  <div className="rounded-lg bg-white/50 dark:bg-slate-800/50 border border-white/20 dark:border-white/10 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[10px] font-medium text-muted-foreground">Publieke opmerking</span>
                    </div>
                    <p className="text-xs text-foreground">{dienst.publieke_opmerking}</p>
                  </div>
                )}

                {dienst.flexwerker_opmerking && (
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <MessageSquare className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      <span className="text-[10px] font-medium text-blue-700 dark:text-blue-400">Flexwerker opmerking (na toewijzing)</span>
                    </div>
                    <p className="text-xs text-blue-800 dark:text-blue-300">{dienst.flexwerker_opmerking}</p>
                  </div>
                )}
              </div>

              {/* Right: Opdrachtgever info */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Opdrachtgever</h3>
                <dl className="space-y-0">
                  <DetailRow label="Organisatie">{dienst.sublocation?.location?.organization?.name ?? "—"}</DetailRow>
                  <DetailRow label="Locatie">{dienst.sublocation?.location?.naam ?? "—"}</DetailRow>
                  <DetailRow label="Sublocation">{dienst.sublocation?.naam ?? "—"}</DetailRow>
                  <DetailRow label="Plaats">{dienst.sublocation?.plaats ?? "—"}</DetailRow>
                  <DetailRow label="Sector">{dienst.sublocation?.sector ?? "—"}</DetailRow>
                  <DetailRow label="Doelgroep">{dienst.sublocation?.doelgroep ?? "—"}</DetailRow>
                </dl>
              </div>
            </div>

            {/* Toewijzingen */}
            <ToewijzingenBeheer dienst={dienst} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Confirm sluiten */}
      <AlertDialog open={confirmAction === "sluiten"} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dienst sluiten?</AlertDialogTitle>
            <AlertDialogDescription>
              De dienst wordt geannuleerd. Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleSluitenDienst}>Sluiten</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
