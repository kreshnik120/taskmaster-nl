import { useState, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, AlertCircle, TrendingUp, Plus } from "lucide-react";
import { startOfWeek, format, addDays, parseISO } from "date-fns";
import { PageContainer } from "@/components/ui/page-container";
import { PageHero } from "@/components/ui/page-hero";
import { KPICard } from "@/components/ui/kpi-card";
import { Button } from "@/components/ui/button";
import { useDienstenPlanning } from "@/hooks/useDienstenPlanning";
import { PlanningToolbar } from "@/components/planning/PlanningToolbar";
import { PlanningLegenda } from "@/components/planning/PlanningLegenda";
import { PlanningWeekKalender } from "@/components/planning/PlanningWeekKalender";
import { PlanningLijstWeergave } from "@/components/planning/PlanningLijstWeergave";
import { PlanningFilters } from "@/components/planning/PlanningFilters";
import { DienstDetailSheet } from "@/components/planning/DienstDetailSheet";
import { NieuweDienstModal } from "@/components/planning/NieuweDienstModal";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { DienstFilters, DienstData } from "@/hooks/useDienstenPlanning";

function getDefaultWeekStart() {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

const Planning = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const weekStart = searchParams.get("week") || getDefaultWeekStart();
  const viewMode = (searchParams.get("view") as "kalender" | "lijst") || "kalender";

  const [filters, setFilters] = useState<DienstFilters>({
    status: "all",
    bureau: "all",
    functieNiveau: "all",
    locatie: "all",
    werkvorm: "all",
    certificering: "all",
    weekStart,
  });

  const [showOpen, setShowOpen] = useState(true);
  const [showIngepland, setShowIngepland] = useState(true);
  const [compact, setCompact] = useState(true);
  const [nieuweDienstOpen, setNieuweDienstOpen] = useState(false);
  const [selectedDienst, setSelectedDienst] = useState<DienstData | null>(null);
  const [editDienst, setEditDienst] = useState<DienstData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DienstData | null>(null);

  const queryClient = useQueryClient();

  // Keep filters.weekStart in sync with URL
  const activeFilters = useMemo(() => ({ ...filters, weekStart }), [filters, weekStart]);

  const { diensten, isLoading, stats } = useDienstenPlanning(activeFilters);

  const handleWeekChange = useCallback(
    (newWeek: string) => {
      setSearchParams((p) => {
        p.set("week", newWeek);
        return p;
      });
    },
    [setSearchParams]
  );

  const handleViewChange = useCallback(
    (mode: "kalender" | "lijst") => {
      setSearchParams((p) => {
        p.set("view", mode);
        return p;
      });
    },
    [setSearchParams]
  );

  const handleDienstClick = useCallback((dienst: DienstData) => {
    setSelectedDienst(dienst);
  }, []);

  const handleEditDienst = useCallback((dienst: DienstData) => {
    setSelectedDienst(null);
    setEditDienst(dienst);
  }, []);

  const handleCopyDienst = useCallback(async (dienst: DienstData) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const newDatum = format(addDays(parseISO(dienst.datum), 1), "yyyy-MM-dd");
    const { error } = await supabase.from("diensten").insert({
      sublocation_id: dienst.sublocation?.id,
      titel: dienst.titel,
      datum: newDatum,
      start_tijd: dienst.start_tijd,
      eind_tijd: dienst.eind_tijd,
      pauze_minuten: dienst.pauze_minuten,
      gevraagd_functie_niveau: dienst.gevraagd_functie_niveau,
      gevraagd_aantal: dienst.gevraagd_aantal,
      werkvorm: dienst.werkvorm,
      dienst_type: dienst.dienst_type,
      tarief_per_uur: dienst.tarief_per_uur,
      prive_opmerking: dienst.prive_opmerking,
      publieke_opmerking: dienst.publieke_opmerking,
      status: "concept",
      accepteerbaar: dienst.accepteerbaar,
      is_slaapdienst: dienst.is_slaapdienst,
      slaap_start_tijd: dienst.slaap_start_tijd,
      slaap_eind_tijd: dienst.slaap_eind_tijd,
      flexwerker_opmerking: dienst.flexwerker_opmerking,
      vereiste_certificeringen: dienst.vereiste_certificeringen,
      bron: "gekopieerd",
      org_id: dienst.org_id,
      aangemaakt_door: user.id,
    });
    if (error) { toast.error("Kopiëren mislukt"); return; }
    toast.success(`Dienst gekopieerd naar ${newDatum}`);
    queryClient.invalidateQueries({ queryKey: ["diensten-planning"] });
  }, [queryClient]);

  const handleDeleteDienst = useCallback((dienst: DienstData) => {
    setDeleteTarget(dienst);
  }, []);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("diensten").delete().eq("id", deleteTarget.id);
    if (error) { toast.error("Verwijderen mislukt"); return; }
    toast.success("Dienst verwijderd");
    setDeleteTarget(null);
    setSelectedDienst(null);
    queryClient.invalidateQueries({ queryKey: ["diensten-planning"] });
  };

  return (
    <PageContainer contextColor="rose" className="space-y-6 p-6">
      <PageHero
        title="Planning"
        subtitle="Diensten & roosterbeheer"
        icon={CalendarDays}
        contextColor="rose"
      >
        <PlanningFilters filters={filters} onFiltersChange={setFilters} />
        <Button size="sm" className="h-8 text-xs gap-1" onClick={() => setNieuweDienstOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Nieuwe Dienst
        </Button>
      </PageHero>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          icon={CalendarDays}
          title="Vandaag"
          value={stats.vandaag}
          variant="rose"
          subtitle="diensten vandaag"
        />
        <KPICard
          icon={CalendarDays}
          title="Deze week"
          value={stats.dezeWeek}
          variant="rose"
          subtitle="totaal deze week"
        />
        <KPICard
          icon={AlertCircle}
          title="Open diensten"
          value={stats.openDiensten}
          variant="amber"
          subtitle="nog te bezetten"
        />
        <KPICard
          icon={TrendingUp}
          title="Bezettingsgraad"
          value={stats.bezettingsgraad}
          suffix="%"
          variant="emerald"
          subtitle={`${stats.totaalUrenWeek.toFixed(0)} uur ingepland`}
        />
      </div>

      {/* Toggle knoppen */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={showOpen ? "default" : "outline"}
          size="sm"
          className="h-7 text-[11px]"
          onClick={() => setShowOpen(!showOpen)}
        >
          Openstaand
        </Button>
        <Button
          variant={showIngepland ? "default" : "outline"}
          size="sm"
          className="h-7 text-[11px]"
          onClick={() => setShowIngepland(!showIngepland)}
        >
          Ingepland
        </Button>
        <Button
          variant={compact ? "default" : "outline"}
          size="sm"
          className="h-7 text-[11px]"
          onClick={() => setCompact(!compact)}
        >
          Compact
        </Button>
      </div>

      {/* Toolbar */}
      <PlanningToolbar
        weekStart={weekStart}
        onWeekChange={handleWeekChange}
        viewMode={viewMode}
        onViewModeChange={handleViewChange}
      />

      {/* Legenda */}
      <PlanningLegenda />

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="h-32 rounded-xl bg-white/30 dark:bg-slate-900/30 animate-pulse border border-white/20 dark:border-white/10"
            />
          ))}
        </div>
      ) : viewMode === "kalender" ? (
        <PlanningWeekKalender
          diensten={diensten}
          weekStart={weekStart}
          showOpen={showOpen}
          showIngepland={showIngepland}
          compact={compact}
          onDienstClick={handleDienstClick}
          onEdit={handleEditDienst}
          onCopy={handleCopyDienst}
          onDelete={handleDeleteDienst}
        />
      ) : (
        <PlanningLijstWeergave
          diensten={diensten}
          onDienstClick={handleDienstClick}
          onEdit={handleEditDienst}
          onCopy={handleCopyDienst}
          onDelete={handleDeleteDienst}
        />
      )}

      {/* Detail Sheet */}
      <DienstDetailSheet
        dienst={selectedDienst}
        open={!!selectedDienst}
        onClose={() => setSelectedDienst(null)}
        onEdit={handleEditDienst}
        onCopy={handleCopyDienst}
        onDelete={handleDeleteDienst}
      />

      {/* Nieuwe / Edit Dienst Modal */}
      <NieuweDienstModal
        open={nieuweDienstOpen || !!editDienst}
        onClose={() => { setNieuweDienstOpen(false); setEditDienst(null); }}
        editDienst={editDienst}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dienst verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>Deze dienst wordt definitief verwijderd.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Verwijderen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
};

export default Planning;
