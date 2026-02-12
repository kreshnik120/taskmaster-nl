import { useState, useEffect, useMemo } from "react";
import { Check, X, Undo2, UserPlus, Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import type { DienstData } from "@/hooks/useDienstenPlanning";

interface ToewijzingenBeheerProps {
  dienst: DienstData;
}

const toewijzingStatusConfig: Record<string, { label: string; classes: string }> = {
  voorgesteld: { label: "Voorgesteld", classes: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700" },
  positief: { label: "Positief", classes: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800" },
  misschien: { label: "Misschien", classes: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800" },
  bevestigd: { label: "Bevestigd", classes: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800" },
  afgewezen: { label: "Afgewezen", classes: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800" },
  no_show: { label: "No-show", classes: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800" },
  voltooid: { label: "Voltooid", classes: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800" },
};

function ToewijzingRij({ t, renderActions }: { t: DienstData["toewijzingen"][0]; renderActions: (t: DienstData["toewijzingen"][0]) => React.ReactNode }) {
  const cfg = toewijzingStatusConfig[t.status] ?? { label: t.status, classes: "" };
  return (
    <div className="grid grid-cols-[1fr_70px_90px_90px_80px_auto] gap-2 px-3 py-2 items-center border-b border-white/5 last:border-0 text-xs">
      <span className="truncate font-medium text-foreground">{t.professional?.full_name ?? "—"}</span>
      <span className="text-muted-foreground text-[11px]">{t.professional?.functie_niveau ?? "—"}</span>
      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", cfg.classes)}>{cfg.label}</Badge>
      <span className="text-muted-foreground text-[10px]">
        {t.reactie_op ? format(new Date(t.reactie_op), "dd-MM HH:mm", { locale: nl }) : "—"}
      </span>
      <span className="text-muted-foreground text-[10px] truncate">{t.reactie_door ?? "—"}</span>
      <div>{renderActions(t)}</div>
    </div>
  );
}

export function ToewijzingenBeheer({ dienst }: ToewijzingenBeheerProps) {
  const queryClient = useQueryClient();
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedPositie, setSelectedPositie] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const gevraagd = dienst.gevraagd_aantal || 1;
  const isMultiPositie = gevraagd > 1;

  const bezet = useMemo(() => {
    if (!isMultiPositie) {
      return dienst.toewijzingen.filter((t) => ["bevestigd", "positief"].includes(t.status)).length;
    }
    const bezetSet = new Set<number>();
    dienst.toewijzingen
      .filter((t) => ["bevestigd", "positief"].includes(t.status))
      .forEach((t) => bezetSet.add(t.positie_nr));
    return bezetSet.size;
  }, [dienst, isMultiPositie]);

  const pct = Math.min(Math.round((bezet / gevraagd) * 100), 100);

  const { data: professionals = [], isLoading: searchLoading } = useQuery({
    queryKey: ["professionals-search", debouncedSearch],
    queryFn: async () => {
      let q = supabase
        .from("professionals")
        .select("id, full_name, functie_niveau, telefoonnummer, email")
        .is("deleted_at", null)
        .in("status", ["actief", "beschikbaar"])
        .limit(20);
      if (debouncedSearch) q = q.ilike("full_name", `%${debouncedSearch}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: searchOpen && debouncedSearch.length > 0,
    staleTime: 10000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["diensten-planning"] });

  const updateStatus = async (id: string, status: string, msg: string) => {
    const { error } = await supabase.from("dienst_toewijzingen").update({ status }).eq("id", id);
    if (error) { toast.error("Actie mislukt"); return; }
    toast.success(msg);
    invalidate();
  };

  const deleteToewijzing = async (id: string) => {
    const { error } = await supabase.from("dienst_toewijzingen").delete().eq("id", id);
    if (error) { toast.error("Verwijderen mislukt"); return; }
    toast.success("Toewijzing verwijderd");
    setDeleteTarget(null);
    invalidate();
  };

  const assignProfessional = async (professionalId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("dienst_toewijzingen").insert({
      dienst_id: dienst.id,
      professional_id: professionalId,
      status: "voorgesteld",
      positie_nr: isMultiPositie ? selectedPositie : 1,
      toegewezen_door: user?.id,
    });
    if (error) {
      toast.error(error.message.includes("overlap") ? "Overlappende dienst gevonden" : error.message);
      return;
    }
    toast.success("Professional toegevoegd aan dienst");
    setSearchOpen(false);
    setSearch("");
    invalidate();
  };

  const renderActions = (t: DienstData["toewijzingen"][0]) => {
    switch (t.status) {
      case "voorgesteld":
        return (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(t.id)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        );
      case "positief":
      case "misschien":
        return (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" onClick={() => updateStatus(t.id, "bevestigd", "Professional bevestigd")}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-600" onClick={() => updateStatus(t.id, "afgewezen", "Reactie afgewezen")}>
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateStatus(t.id, "voorgesteld", "Actie ongedaan gemaakt")}>
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      case "bevestigd":
        return (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateStatus(t.id, "positief", "Actie ongedaan gemaakt")}>
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
        );
      case "afgewezen":
        return (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateStatus(t.id, "voorgesteld", "Actie ongedaan gemaakt")}>
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
        );
      default:
        return null;
    }
  };

  const tabelHeader = (
    <div className="grid grid-cols-[1fr_70px_90px_90px_80px_auto] gap-2 px-3 py-1.5 text-[10px] font-medium text-muted-foreground bg-white/50 dark:bg-slate-900/50 border-b border-white/10">
      <span>Flexwerker</span>
      <span>Niveau</span>
      <span>Status</span>
      <span>Reactie op</span>
      <span>Reactie door</span>
      <span>Acties</span>
    </div>
  );

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Toewijzingen & Reacties{" "}
          <span className="text-muted-foreground font-normal">({bezet}/{gevraagd})</span>
        </h3>
      </div>
      <Progress value={pct} size="sm" />

      {dienst.toewijzingen.length > 0 ? (
        <div className="rounded-lg overflow-hidden border border-white/20 dark:border-white/10 bg-white/30 dark:bg-slate-900/30">
          {isMultiPositie ? (
            // Gegroepeerd per positie
            <>
              {tabelHeader}
              {Array.from({ length: gevraagd }, (_, i) => i + 1).map((positieNr) => {
                const positieToewijzingen = dienst.toewijzingen.filter((t) => t.positie_nr === positieNr);
                const positieBezet = positieToewijzingen.some((t) => ["bevestigd", "positief"].includes(t.status));
                return (
                  <div key={positieNr}>
                    <div className="px-3 py-1.5 bg-white/20 dark:bg-slate-800/30 border-b border-white/5">
                      <span className={cn(
                        "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                        positieBezet ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                      )}>
                        Positie {positieNr} — {positieBezet ? "Bezet" : "Open"}
                      </span>
                    </div>
                    {positieToewijzingen.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground italic pl-6 py-1.5">Geen reacties</p>
                    ) : (
                      positieToewijzingen.map((t) => (
                        <ToewijzingRij key={t.id} t={t} renderActions={renderActions} />
                      ))
                    )}
                  </div>
                );
              })}
            </>
          ) : (
            // Flat lijst voor single positie
            <>
              {tabelHeader}
              {dienst.toewijzingen.map((t) => (
                <ToewijzingRij key={t.id} t={t} renderActions={renderActions} />
              ))}
            </>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground py-4 text-center">Nog geen toewijzingen</p>
      )}

      {/* Positie selector */}
      {isMultiPositie && (
        <div className="flex gap-2 items-center">
          <Label className="text-xs whitespace-nowrap">Positie:</Label>
          <Select value={String(selectedPositie)} onValueChange={(v) => setSelectedPositie(Number(v))}>
            <SelectTrigger className="h-8 text-xs w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: gevraagd }, (_, i) => i + 1).map((nr) => {
                const bezetDoor = dienst.toewijzingen.find(
                  (t) => t.positie_nr === nr && ["bevestigd", "positief"].includes(t.status)
                );
                return (
                  <SelectItem key={nr} value={String(nr)}>
                    Positie {nr} {bezetDoor ? `(${bezetDoor.professional?.full_name})` : "(open)"}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Professional toewijzen */}
      <Popover open={searchOpen} onOpenChange={setSearchOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            Professional toewijzen
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Zoek professional..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                {searchLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  "Geen professionals gevonden"
                )}
              </CommandEmpty>
              <CommandGroup>
                {professionals.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    onSelect={() => assignProfessional(p.id)}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{p.full_name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {p.functie_niveau ?? "—"} · {p.telefoonnummer ?? "—"}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Toewijzing verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Deze toewijzing wordt definitief verwijderd.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteToewijzing(deleteTarget)}>
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}