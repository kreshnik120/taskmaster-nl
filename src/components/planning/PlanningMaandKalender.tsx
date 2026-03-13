import { useMemo } from "react";
import { format, addDays, startOfMonth, startOfWeek, isToday, isSameMonth, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { splitByStatus } from "@/hooks/useDienstenPlanning";
import type { DienstData } from "@/hooks/useDienstenPlanning";

interface PlanningMaandKalenderProps {
  diensten: DienstData[];
  weekStart: string;
  showOpen: boolean;
  showIngepland: boolean;
  showGeannuleerd: boolean;
  compact: boolean;
  onDienstClick: (dienst: DienstData) => void;
  onEdit?: (dienst: DienstData) => void;
  onCopy?: (dienst: DienstData) => void;
  onDelete?: (dienst: DienstData) => void;
}

const DAGNAMEN = ["ma", "di", "wo", "do", "vr", "za", "zo"];

export function PlanningMaandKalender({
  diensten,
  weekStart,
  showOpen,
  showIngepland,
  showGeannuleerd,
  onDienstClick,
}: PlanningMaandKalenderProps) {
  const currentMonth = startOfMonth(parseISO(weekStart));

  const days = useMemo(() => {
    const gridStart = startOfWeek(currentMonth, { weekStartsOn: 1 });
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [currentMonth]);

  const dienstenPerDag = useMemo(() => {
    const map = new Map<string, DienstData[]>();
    diensten.forEach((d) => {
      const key = d.datum;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    });
    return map;
  }, [diensten]);

  return (
    <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border">
        {DAGNAMEN.map((dag) => (
          <div key={dag} className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground text-center uppercase tracking-wide">
            {dag}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const dagDiensten = dienstenPerDag.get(dateKey) || [];
          const { open, ingepland, geannuleerd } = splitByStatus(dagDiensten);
          const visibleDiensten = [
            ...(showOpen ? open : []),
            ...(showIngepland ? ingepland : []),
            ...(showGeannuleerd ? geannuleerd : []),
          ].sort((a, b) => a.start_tijd.localeCompare(b.start_tijd));
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);
          const MAX_VISIBLE = 3;

          return (
            <div
              key={dateKey}
              tabIndex={0}
              role="gridcell"
              aria-label={`${format(day, "EEEE d MMMM", { locale: nl })}, ${visibleDiensten.length} diensten`}
              className={cn(
                "min-h-[90px] border-b border-r border-border p-1 transition-colors",
                !inMonth && "opacity-40 bg-muted/20",
                today && "ring-2 ring-inset ring-primary/40 bg-primary/5"
              )}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className={cn("text-[11px] font-medium", today ? "text-primary font-bold" : "text-foreground")}>
                  {format(day, "d")}
                </span>
                {visibleDiensten.length > 0 && (
                  <span className="text-[9px] text-muted-foreground">
                    ({visibleDiensten.length})
                  </span>
                )}
              </div>

              <div className="space-y-0.5">
                {visibleDiensten.slice(0, MAX_VISIBLE).map((dienst) => (
                  <div
                    key={dienst.id}
                    onClick={() => onDienstClick(dienst)}
                    className={cn(
                      "text-[10px] leading-tight px-1 py-0.5 rounded cursor-pointer truncate",
                      "hover:bg-white/60 dark:hover:bg-slate-800/60 transition-colors",
                      dienst.status === "concept" && "bg-slate-100/60 dark:bg-slate-800/40 text-muted-foreground",
                      dienst.status === "open" && "bg-amber-50/60 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300",
                      dienst.status === "deels_bezet" && "bg-orange-50/60 dark:bg-orange-900/20 text-orange-800 dark:text-orange-300",
                      dienst.status === "volledig_bezet" && "bg-emerald-50/60 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300",
                      dienst.status === "voltooid" && "bg-blue-50/60 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300",
                      dienst.kleur && "border-l-2"
                    )}
                    style={dienst.kleur ? { borderLeftColor: dienst.kleur } : undefined}
                  >
                    {dienst.is_spoed && "🚨 "}
                    {dienst.start_tijd?.slice(0, 5)} {dienst.sublocation?.naam || dienst.titel}
                  </div>
                ))}
                {visibleDiensten.length > MAX_VISIBLE && (
                  <div
                    className="text-[10px] text-primary font-medium pl-1 cursor-pointer hover:underline"
                    onClick={() => onDienstClick(visibleDiensten[MAX_VISIBLE])}
                  >
                    +{visibleDiensten.length - MAX_VISIBLE} meer
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
