import { useState, useCallback } from "react";
import { BeschikbaarheidToolbar } from "./BeschikbaarheidToolbar";
import { BeschikbaarheidFilters } from "./BeschikbaarheidFilters";
import { BeschikbaarheidWeekKalender } from "./BeschikbaarheidWeekKalender";
import { BeschikbaarheidLegenda } from "./BeschikbaarheidLegenda";
import { useBeschikbaarheid, getDefaultBeschikbaarheidFilters } from "@/hooks/useBeschikbaarheid";
import { useBeschikbaarheidMutations } from "@/hooks/useBeschikbaarheidMutations";
import { Loader2 } from "lucide-react";
import type { AvailabilityEntry } from "@/hooks/useBeschikbaarheid";

export default function BeschikbaarheidTab() {
  const [filters, setFilters] = useState(getDefaultBeschikbaarheidFilters);
  const { professionals, isLoading } = useBeschikbaarheid(filters);
  const { upsertBeschikbaarheid, deleteBeschikbaarheid, isUpdating } = useBeschikbaarheidMutations();

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
          onToggle={handleToggle}
          isUpdating={isUpdating}
        />
      )}
    </div>
  );
}
