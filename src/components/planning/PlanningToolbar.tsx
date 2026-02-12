import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarDays, List } from "lucide-react";
import { format, addWeeks, subWeeks, startOfWeek, getISOWeek, endOfWeek, parseISO } from "date-fns";
import { nl } from "date-fns/locale";

interface PlanningToolbarProps {
  weekStart: string;
  onWeekChange: (newWeekStart: string) => void;
  viewMode: "kalender" | "lijst";
  onViewModeChange: (mode: "kalender" | "lijst") => void;
}

export function PlanningToolbar({
  weekStart,
  onWeekChange,
  viewMode,
  onViewModeChange,
}: PlanningToolbarProps) {
  const start = parseISO(weekStart);
  const end = endOfWeek(start, { weekStartsOn: 1 });
  const weekNr = getISOWeek(start);

  const goToday = () => {
    onWeekChange(format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  };

  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onWeekChange(format(subWeeks(start, 1), "yyyy-MM-dd"))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={goToday}>
          Vandaag
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onWeekChange(format(addWeeks(start, 1), "yyyy-MM-dd"))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold text-foreground ml-2">
          Week {weekNr} — {format(start, "dd-MM-yyyy", { locale: nl })} t/m{" "}
          {format(end, "dd-MM-yyyy", { locale: nl })}
        </span>
      </div>

      <div className="flex items-center rounded-lg border border-white/30 dark:border-white/10 overflow-hidden">
        <Button
          variant={viewMode === "kalender" ? "default" : "ghost"}
          size="sm"
          className="h-8 rounded-none text-xs gap-1"
          onClick={() => onViewModeChange("kalender")}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          Kalender
        </Button>
        <Button
          variant={viewMode === "lijst" ? "default" : "ghost"}
          size="sm"
          className="h-8 rounded-none text-xs gap-1"
          onClick={() => onViewModeChange("lijst")}
        >
          <List className="h-3.5 w-3.5" />
          Lijst
        </Button>
      </div>
    </div>
  );
}
