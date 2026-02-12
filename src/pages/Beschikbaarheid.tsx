import { useState, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarCheck2, Users, AlertCircle, TrendingUp } from "lucide-react";
import { startOfWeek, format } from "date-fns";
import { PageContainer } from "@/components/ui/page-container";
import { PageHero } from "@/components/ui/page-hero";
import { KPICard } from "@/components/ui/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBeschikbaarheid, getDefaultBeschikbaarheidFilters } from "@/hooks/useBeschikbaarheid";
import { useBeschikbaarheidMutations } from "@/hooks/useBeschikbaarheidMutations";
import type { BeschikbaarheidFilters, AvailabilityEntry } from "@/hooks/useBeschikbaarheid";
import { BeschikbaarheidToolbar } from "@/components/beschikbaarheid/BeschikbaarheidToolbar";
import { BeschikbaarheidWeekKalender } from "@/components/beschikbaarheid/BeschikbaarheidWeekKalender";
import { BeschikbaarheidFilters as FiltersComponent } from "@/components/beschikbaarheid/BeschikbaarheidFilters";
import { BeschikbaarheidLegenda } from "@/components/beschikbaarheid/BeschikbaarheidLegenda";

function getDefaultWeekStart() {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

const Beschikbaarheid = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const weekStart = searchParams.get("week") || getDefaultWeekStart();

  const [filters, setFilters] = useState<BeschikbaarheidFilters>({
    ...getDefaultBeschikbaarheidFilters(),
    weekStart,
  });

  const activeFilters = useMemo(() => ({ ...filters, weekStart }), [filters, weekStart]);

  const { professionals, isLoading, stats } = useBeschikbaarheid(activeFilters);
  const { upsertBeschikbaarheid, deleteBeschikbaarheid, isUpdating } = useBeschikbaarheidMutations();

  const handleWeekChange = useCallback((newWeekStart: string) => {
    setSearchParams({ week: newWeekStart });
  }, [setSearchParams]);

  const handleToggle = useCallback(
    (professionalId: string, date: string, shift: string, currentEntry: AvailabilityEntry | undefined) => {
      if (!currentEntry) {
        upsertBeschikbaarheid({ professional_id: professionalId, date, shift, is_available: true });
      } else if (currentEntry.is_available) {
        upsertBeschikbaarheid({ professional_id: professionalId, date, shift, is_available: false });
      } else {
        deleteBeschikbaarheid({ professional_id: professionalId, date, shift });
      }
    },
    [upsertBeschikbaarheid, deleteBeschikbaarheid]
  );

  return (
    <PageContainer contextColor="teal">
      <PageHero
        title="Beschikbaarheid"
        subtitle="Overzicht van de beschikbaarheid van alle professionals per week"
        icon={CalendarCheck2}
        contextColor="teal"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KPICard icon={Users} title="Totaal Professionals" value={stats.totaalProfessionals} variant="teal" />
        <KPICard icon={CalendarCheck2} title="Beschikbaar Vandaag" value={stats.beschikbaarVandaag} variant="teal" />
        <KPICard icon={AlertCircle} title="Onbekend" value={stats.onbekend} variant="amber" />
        <KPICard icon={TrendingUp} title="Dekkingsgraad" value={stats.dekkingsgraad} suffix="%" variant="emerald" />
      </div>

      {/* Toolbar + Filters */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <BeschikbaarheidToolbar weekStart={weekStart} onWeekChange={handleWeekChange} />
        <div className="flex items-center gap-2">
          <FiltersComponent filters={filters} onFiltersChange={setFilters} />
        </div>
      </div>

      {/* Legenda */}
      <div className="mb-4">
        <BeschikbaarheidLegenda />
      </div>

      {/* Weekkalender */}
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <BeschikbaarheidWeekKalender
          professionals={professionals}
          weekStart={weekStart}
          onToggle={handleToggle}
          isUpdating={isUpdating}
        />
      )}

      {/* Telling */}
      <p className="text-xs text-muted-foreground text-center mt-4">
        {professionals.length} professional{professionals.length !== 1 ? "s" : ""} weergegeven
      </p>
    </PageContainer>
  );
};

export default Beschikbaarheid;
