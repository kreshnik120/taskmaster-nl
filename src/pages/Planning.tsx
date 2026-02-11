import { useState, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, AlertCircle, TrendingUp, Plus } from "lucide-react";
import { startOfWeek, format } from "date-fns";
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
    weekStart,
  });

  const [showOpen, setShowOpen] = useState(true);
  const [showIngepland, setShowIngepland] = useState(true);
  const [compact, setCompact] = useState(true);
  const [, setNieuweDienstOpen] = useState(false);

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

  const handleDienstClick = useCallback((_dienst: DienstData) => {
    // Detail sheet wordt gebouwd in prompt #1C
  }, []);

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
        />
      ) : (
        <PlanningLijstWeergave diensten={diensten} onDienstClick={handleDienstClick} />
      )}
    </PageContainer>
  );
};

export default Planning;
