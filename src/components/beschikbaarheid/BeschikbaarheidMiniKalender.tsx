import { useState, useMemo, useCallback } from "react";
import { format, addDays, addWeeks, subWeeks, startOfWeek, parseISO, isToday } from "date-fns";
import { nl } from "date-fns/locale";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BeschikbaarheidCelEditor } from "./BeschikbaarheidCelEditor";
import { BeschikbaarheidLegenda } from "./BeschikbaarheidLegenda";
import { useProfessionalWeekBeschikbaarheid } from "@/hooks/useProfessionalWeekBeschikbaarheid";
import { useBeschikbaarheidMutations } from "@/hooks/useBeschikbaarheidMutations";
import { Link } from "react-router-dom";
import type { AvailabilityEntry } from "@/hooks/useBeschikbaarheid";

const SHIFTS = [
  { key: "dag", label: "D", full: "Dag" },
  { key: "avond", label: "A", full: "Avond" },
  { key: "nacht", label: "N", full: "Nacht" },
] as const;

interface BeschikbaarheidMiniKalenderProps {
  professionalId: string;
}

function getStatus(entry: AvailabilityEntry | undefined): "onbekend" | "beschikbaar" | "niet_beschikbaar" {
  if (!entry) return "onbekend";
  return entry.is_available ? "beschikbaar" : "niet_beschikbaar";
}

export function BeschikbaarheidMiniKalender({ professionalId }: BeschikbaarheidMiniKalenderProps) {
  const [weekStart, setWeekStart] = useState(() =>
    format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd")
  );

  const { availability, isLoading } = useProfessionalWeekBeschikbaarheid(professionalId, weekStart);
  const { upsertBeschikbaarheid, deleteBeschikbaarheid, isUpdating } = useBeschikbaarheidMutations();

  const days = useMemo(() => {
    const start = parseISO(weekStart);
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      return {
        date: format(date, "yyyy-MM-dd"),
        dayLabel: format(date, "EEE", { locale: nl }),
        dateLabel: format(date, "dd/MM"),
        isToday: isToday(date),
      };
    });
  }, [weekStart]);

  const handleToggle = useCallback(
    (date: string, shift: string) => {
      const entry = availability.find((a) => a.date === date && a.shift === shift);
      if (!entry) {
        upsertBeschikbaarheid({ professional_id: professionalId, date, shift, is_available: true });
      } else if (entry.is_available) {
        upsertBeschikbaarheid({ professional_id: professionalId, date, shift, is_available: false });
      } else {
        deleteBeschikbaarheid({ professional_id: professionalId, date, shift });
      }
    },
    [availability, professionalId, upsertBeschikbaarheid, deleteBeschikbaarheid]
  );

  const goPrev = () => setWeekStart(format(subWeeks(parseISO(weekStart), 1), "yyyy-MM-dd"));
  const goNext = () => setWeekStart(format(addWeeks(parseISO(weekStart), 1), "yyyy-MM-dd"));
  const goToday = () => setWeekStart(format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));

  return (
    <div className="space-y-4">
      {/* Week navigatie */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={goToday}>
            Vandaag
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          {format(parseISO(weekStart), "dd MMM", { locale: nl })} t/m{" "}
          {format(addDays(parseISO(weekStart), 6), "dd MMM yyyy", { locale: nl })}
        </span>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">Laden...</div>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => (
            <div key={day.date} className="text-center space-y-1">
              <div
                className={cn(
                  "text-[10px] font-medium pb-1",
                  day.isToday ? "text-teal-600 dark:text-teal-400" : "text-muted-foreground"
                )}
              >
                <div>{day.dayLabel}</div>
                <div>{day.dateLabel}</div>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                {SHIFTS.map((shift) => {
                  const entry = availability.find(
                    (a) => a.date === day.date && a.shift === shift.key
                  );
                  return (
                    <BeschikbaarheidCelEditor
                      key={shift.key}
                      status={getStatus(entry)}
                      shiftLabel={shift.label}
                      shiftFull={shift.full}
                      onToggle={() => handleToggle(day.date, shift.key)}
                      disabled={isUpdating}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Legenda + link */}
      <div className="flex items-center justify-between pt-2 border-t border-white/10">
        <BeschikbaarheidLegenda />
        <Link
          to="/beschikbaarheid"
          className="text-xs text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1"
        >
          Volledig overzicht
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
