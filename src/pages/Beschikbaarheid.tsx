import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarCheck2, Users, AlertCircle, TrendingUp } from "lucide-react";
import { startOfWeek, format } from "date-fns";
import { PageContainer } from "@/components/ui/page-container";
import { PageHero } from "@/components/ui/page-hero";
import { KPICard } from "@/components/ui/kpi-card";
import { useBeschikbaarheid, getDefaultBeschikbaarheidFilters } from "@/hooks/useBeschikbaarheid";
import type { BeschikbaarheidFilters } from "@/hooks/useBeschikbaarheid";

function getDefaultWeekStart() {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

const Beschikbaarheid = () => {
  const [searchParams] = useSearchParams();
  const weekStart = searchParams.get("week") || getDefaultWeekStart();

  const [filters] = useState<BeschikbaarheidFilters>({
    ...getDefaultBeschikbaarheidFilters(),
    weekStart,
  });

  const activeFilters = useMemo(() => ({ ...filters, weekStart }), [filters, weekStart]);

  const { professionals, isLoading, stats } = useBeschikbaarheid(activeFilters);

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

      {/* Content placeholder — wordt uitgebouwd in B-2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-6 text-sm text-muted-foreground">
          Weekkalender wordt hier geladen...
        </div>
        <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-6 text-sm text-muted-foreground">
          {isLoading ? "Laden..." : `${professionals.length} professionals gevonden`}
        </div>
      </div>
    </PageContainer>
  );
};

export default Beschikbaarheid;
