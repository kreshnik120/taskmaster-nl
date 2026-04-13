import { useState } from "react";
import { BeschikbaarheidToolbar } from "./BeschikbaarheidToolbar";
import { BeschikbaarheidFilters } from "./BeschikbaarheidFilters";
import { BeschikbaarheidWeekKalender } from "./BeschikbaarheidWeekKalender";
import { BeschikbaarheidLegenda } from "./BeschikbaarheidLegenda";
import { useBeschikbaarheid, getDefaultBeschikbaarheidFilters } from "@/hooks/useBeschikbaarheid";
import { Loader2 } from "lucide-react";

export default function BeschikbaarheidTab() {
  const [filters, setFilters] = useState(getDefaultBeschikbaarheidFilters);
  const { professionals, stats, isLoading } = useBeschikbaarheid(filters);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <BeschikbaarheidToolbar
          weekStart={filters.weekStart}
          onWeekChange={(w) => setFilters((f) => ({ ...f, weekStart: w }))}
        />
        <BeschikbaarheidFilters filters={filters} onFiltersChange={setFilters} />
        <BeschikbaarheidLegenda />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <BeschikbaarheidWeekKalender
          weekStart={filters.weekStart}
          professionals={professionals}
        />
      )}
    </div>
  );
}
