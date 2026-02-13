import { useState } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { Lock, MessageSquare, Bot, CalendarDays, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DienstStatusBadge } from "./DienstStatusBadge";
import { ToewijzingenBeheer } from "./ToewijzingenBeheer";
import { DienstMatchingSuggesties } from "./DienstMatchingSuggesties";
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
    <div className="flex justify-between items-baseline py-1.5 px-2 -mx-2 rounded-md border-b border-white/10 dark:border-white/5 last:border-0 hover:bg-white/30 dark:hover:bg-white/5 transition-colors duration-200" style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
      <dt className="text-xs text-muted-foreground/80 shrink-0">{label}</dt>
      <dd className="text-xs font-medium text-foreground text-right ml-2">{children}</dd>
    </div>
  );
}

const statusHeaderTint: Record<string, string> = {
  concept: "from-slate-100/60 to-transparent dark:from-slate-800/30",
  open: "from-rose-50/60 to-transparent dark:from-rose-900/20",
  deels_bezet: "from-amber-50/60 to-transparent dark:from-amber-900/20",
  volledig_bezet: "from-emerald-50/60 to-transparent dark:from-emerald-900/20",
  voltooid: "from-blue-50/60 to-transparent dark:from-blue-900/20",
  geannuleerd: "from-gray-100/60 to-transparent dark:from-gray-800/30",
};

export function DienstDetailSheet({ dienst, open, onClose, onEdit, onCopy, onDelete }: DienstDetailSheetProps) {
  const queryClient = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<"sluiten" | null>(null);

  if (!dienst) return null;

  const heeftPositieveReacties = dienst.toewijzingen.some((t) => t.status === "positief");
  const isAfgelopen = ["geannuleerd", "voltooid"].includes(dienst.status);
  const formatTijd = (t: string) => t?.slice(0, 5) ?? "";
  const formatTarief = (n: number | null) => n != null ? `€${n.toFixed(2).replace(".", ",")}` : "—";

  const dienstSubtitel = `${dienst.dienst_type ?? "Dienst"} ${formatTijd(dienst.start_tijd)}–${formatTijd(dienst.eind_tijd)}`;

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

  const handleSuggestieAssign = async (professionalId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("dienst_toewijzingen").insert({
      dienst_id: dienst.id,
      professional_id: professionalId,
      status: "voorgesteld",
      positie_nr: 1,
      toegewezen_door: user?.id,
    });
    if (error) {
      toast.error(error.message.includes("overlap") ? "Overlappende dienst gevonden" : error.message);
      return;
    }
    toast.success("Professional toegevoegd vanuit AI suggestie");
    queryClient.invalidateQueries({ queryKey: ["diensten-planning"] });
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

  const headerTint = statusHeaderTint[dienst.status] ?? statusHeaderTint.concept;

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="right" className="w-full max-w-3xl overflow-y-auto scroll-smooth p-0 sm:max-w-3xl">
          {/* Header with status-dependent gradient */}
          <SheetHeader className={cn("px-6 pt-6 pb-4 border-b border-white/10 dark:border-white/5 bg-gradient-to-b", headerTint)}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2.5">
                  <SheetTitle className="text-base truncate">
                    {dienst.sublocation?.location?.organization?.name} / {dienst.sublocation?.naam}
                  </SheetTitle>
                  <DienstStatusBadge status={dienst.status} />
                </div>
                <p className="text-xs text-muted-foreground/70 tracking-wide">
                  {dienstSubtitel} · {format(parseISO(dienst.datum), "d MMM yyyy", { locale: nl })}
                </p>
              </div>
            </div>
          </SheetHeader>

          <div className="px-6 py-5 space-y-8">
            {/* Action buttons — grouped with separator */}
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-2">
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
              </div>
              <div className="flex items-center gap-2">
                <div className="h-5 border-l border-white/20 dark:border-white/10" />
                {!isAfgelopen && (
                  <Button variant="outline" size="sm" className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setConfirmAction("sluiten")}>
                    Sluiten
                  </Button>
                )}
                <Button variant="outline" size="sm" className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => onDelete(dienst)}>
                  Verwijderen
                </Button>
              </div>
            </div>

            {/* Two column layout — glass cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: Dienst details */}
              <div className="rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/20 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-4 space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4 text-muted-foreground/60" />
                  Dienst details
                </h3>
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
                    <div className="flex gap-1 mt-1 mb-1 px-2 -mx-2">
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
                          )}
                            title={bezet ? `Positie ${nr}: Bezet` : `Positie ${nr}: Open`}
                            aria-label={bezet ? `Positie ${nr}: Bezet` : `Positie ${nr}: Open`}
                            role="img"
                          >
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
              <div className="rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/20 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-4 space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-muted-foreground/60" />
                  Opdrachtgever
                </h3>
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

            {/* AI Suggesties */}
            <DienstMatchingSuggesties dienst={dienst} onAssign={handleSuggestieAssign} />

            {/* Vraag aan AI chat */}
            {!["geannuleerd", "voltooid"].includes(dienst.status) && (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30"
                onClick={() => {
                  const dienstInfo = `Ik bekijk een dienst op ${format(parseISO(dienst.datum), 'd MMMM yyyy', { locale: nl })}. ${dienst.dienst_type ?? 'Dag'}dienst van ${dienst.start_tijd?.slice(0, 5) ?? '?'} tot ${dienst.eind_tijd?.slice(0, 5) ?? '?'}. Status: ${dienst.status}. Locatie: ${dienst.sublocation?.naam ?? 'onbekend'}. Gevraagd niveau: ${(dienst.gevraagd_functie_niveau as string[])?.join(', ') || 'niet gespecificeerd'}. Geef advies over de beste aanpak voor het invullen van deze dienst.`;
                  window.dispatchEvent(new CustomEvent('open-chat-with-context', { detail: { prompt: dienstInfo } }));
                }}
              >
                <Bot className="h-3.5 w-3.5 mr-1.5" />
                Vraag aan AI assistent
              </Button>
            )}
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
