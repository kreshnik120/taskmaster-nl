import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, addWeeks, subWeeks, startOfWeek, getISOWeek, endOfWeek, parseISO } from "date-fns";
import { nl } from "date-fns/locale";

interface BeschikbaarheidToolbarProps {
  weekStart: string;
  onWeekChange: (newWeekStart: string) => void;
}

export function BeschikbaarheidToolbar({ weekStart, onWeekChange }: BeschikbaarheidToolbarProps) {
  const start = parseISO(weekStart);
  const end = endOfWeek(start, { weekStartsOn: 1 });
  const weekNr = getISOWeek(start);

  const goPrev = () => onWeekChange(format(subWeeks(start, 1), "yyyy-MM-dd"));
  const goNext = () => onWeekChange(format(addWeeks(start, 1), "yyyy-MM-dd"));
  const goToday = () => onWeekChange(format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={goPrev} className="h-8 w-8">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={goToday} className="h-8 text-xs">
        Vandaag
      </Button>
      <Button variant="outline" size="icon" onClick={goNext} className="h-8 w-8">
        <ChevronRight className="h-4 w-4" />
      </Button>
      <span className="text-sm font-medium text-muted-foreground ml-2">
        Week {weekNr} — {format(start, "dd MMM", { locale: nl })} t/m {format(end, "dd MMM yyyy", { locale: nl })}
      </span>
    </div>
  );
}
