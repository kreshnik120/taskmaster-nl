import { CalendarDays } from "lucide-react";
import { PageContainer } from "@/components/ui/page-container";
import { PageHero } from "@/components/ui/page-hero";
import { useDienstenPlanning, getDefaultFilters } from "@/hooks/useDienstenPlanning";

const Planning = () => {
  const filters = getDefaultFilters();
  const { diensten, isLoading } = useDienstenPlanning(filters);

  return (
    <PageContainer contextColor="rose" className="space-y-6 p-6">
      <PageHero
        title="Planning"
        subtitle="Diensten & roosterbeheer"
        icon={CalendarDays}
        contextColor="rose"
      />

      <div className="flex flex-col items-center justify-center py-12 px-8 text-center rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="p-4 rounded-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm mb-4">
          <CalendarDays className="h-8 w-8 text-muted-foreground/30" />
        </div>
        <h3 className="text-base font-medium text-foreground mb-1">
          {isLoading ? "Planning wordt geladen..." : "Planning"}
        </h3>
        <p className="text-sm text-muted-foreground/70">
          {isLoading
            ? "Data ophalen..."
            : `${diensten.length} diensten gevonden deze week`}
        </p>
      </div>
    </PageContainer>
  );
};

export default Planning;
