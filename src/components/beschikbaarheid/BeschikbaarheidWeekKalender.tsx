import { useMemo } from "react";
import { format, addDays, parseISO, isToday } from "date-fns";
import { nl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { BeschikbaarheidCelEditor } from "./BeschikbaarheidCelEditor";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ProfessionalBeschikbaarheid, AvailabilityEntry } from "@/hooks/useBeschikbaarheid";

const SHIFTS = [
  { key: "dag", label: "D", full: "Dag" },
  { key: "avond", label: "A", full: "Avond" },
  { key: "nacht", label: "N", full: "Nacht" },
] as const;

interface BeschikbaarheidWeekKalenderProps {
  professionals: ProfessionalBeschikbaarheid[];
  weekStart: string;
  onToggle: (professionalId: string, date: string, shift: string, currentEntry: AvailabilityEntry | undefined) => void;
  isUpdating?: boolean;
}

function getStatus(entry: AvailabilityEntry | undefined): "onbekend" | "beschikbaar" | "niet_beschikbaar" {
  if (!entry) return "onbekend";
  return entry.is_available ? "beschikbaar" : "niet_beschikbaar";
}

export function BeschikbaarheidWeekKalender({
  professionals,
  weekStart,
  onToggle,
  isUpdating,
}: BeschikbaarheidWeekKalenderProps) {
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

  if (professionals.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-12 text-center">
        <p className="text-sm text-muted-foreground">Geen professionals gevonden met huidige filters</p>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/30">
                <th className="sticky left-0 z-10 bg-card/90 backdrop-blur-sm px-4 py-3 text-left text-xs font-medium text-muted-foreground min-w-[180px]">
                  Professional
                </th>
                {days.map((day) => (
                  <th
                    key={day.date}
                    className={cn(
                      "px-2 py-3 text-center min-w-[100px]",
                      day.isToday && "bg-teal-50/50 dark:bg-teal-900/20"
                    )}
                  >
                    <p className="text-xs font-medium text-foreground">{day.dayLabel}</p>
                    <p className="text-[10px] text-muted-foreground">{day.dateLabel}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {professionals.map((pro, idx) => (
                <tr
                  key={pro.id}
                  className={cn(
                    "border-b border-border/20",
                    idx % 2 === 0 ? "bg-transparent" : "bg-muted/20"
                  )}
                >
                  <td className="sticky left-0 z-10 bg-card/90 backdrop-blur-sm px-4 py-2">
                    <div className="text-sm font-medium text-foreground truncate max-w-[160px]">
                      {pro.full_name}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {pro.functie_niveau}
                      {pro.werkvorm ? ` · ${pro.werkvorm}` : ""}
                    </div>
                  </td>
                  {days.map((day) => (
                    <td
                      key={day.date}
                      className={cn(
                        "px-2 py-2 text-center",
                        day.isToday && "bg-teal-50/50 dark:bg-teal-900/20"
                      )}
                    >
                      <div className="flex items-center justify-center gap-0.5">
                        {SHIFTS.map((shift) => {
                          const entry = pro.availability.find(
                            (a) => a.date === day.date && a.shift === shift.key
                          );
                          return (
                            <BeschikbaarheidCelEditor
                              key={shift.key}
                              status={getStatus(entry)}
                              shiftLabel={shift.label}
                              shiftFull={shift.full}
                              onToggle={() => onToggle(pro.id, day.date, shift.key, entry)}
                              disabled={isUpdating}
                            />
                          );
                        })}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </TooltipProvider>
  );
}
