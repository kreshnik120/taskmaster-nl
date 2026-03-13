import { useMemo } from "react";
import { format, addDays, isToday, isSameDay, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DienstCard } from "./DienstCard";
import { DienstQuickActions } from "./DienstQuickActions";
import { splitByStatus, type DienstData } from "@/hooks/useDienstenPlanning";

interface PlanningWeekKalenderProps {
  diensten: DienstData[];
  weekStart: string;
  showOpen: boolean;
  showIngepland: boolean;
  showGeannuleerd: boolean;
  compact: boolean;
  onDienstClick?: (dienst: DienstData) => void;
  onEdit?: (dienst: DienstData) => void;
  onCopy?: (dienst: DienstData) => void;
  onDelete?: (dienst: DienstData) => void;
}

function DagKolom({
  dag,
  diensten,
  compact,
  onDienstClick,
  onEdit,
  onCopy,
  onDelete,
}: {
  dag: Date;
  diensten: DienstData[];
  compact: boolean;
  onDienstClick?: (d: DienstData) => void;
  onEdit?: (d: DienstData) => void;
  onCopy?: (d: DienstData) => void;
  onDelete?: (d: DienstData) => void;
}) {
  const dagDiensten = diensten
    .filter((d) => isSameDay(parseISO(d.datum), dag))
    .sort((a, b) => a.start_tijd.localeCompare(b.start_tijd));

  const vandaag = isToday(dag);

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl p-2 min-h-[120px]",
        "bg-white/30 dark:bg-slate-900/30 backdrop-blur-sm",
        "border border-white/20 dark:border-white/10",
        vandaag && "ring-2 ring-tab-recruitment-500/50"
      )}
    >
      <div className="text-center mb-1.5">
        <div className={cn("text-xs uppercase text-muted-foreground", vandaag && "font-bold text-foreground")}>
          {format(dag, "EEEEEE", { locale: nl })}
        </div>
        <div className={cn("text-sm font-medium", vandaag && "text-tab-recruitment-600 dark:text-tab-recruitment-400")}>
          {format(dag, "d")}
        </div>
        <div className="text-[10px] text-muted-foreground/60">{dagDiensten.length || "—"}</div>
      </div>
      <div className="flex flex-col gap-1.5 flex-1">
        {dagDiensten.map((d) => (
          onEdit && onCopy && onDelete ? (
            <DienstQuickActions
              key={d.id}
              dienst={d}
              onOpen={(di) => onDienstClick?.(di)}
              onEdit={onEdit}
              onCopy={onCopy}
              onDelete={onDelete}
            >
              <DienstCard dienst={d} compact={compact} onClick={() => onDienstClick?.(d)} />
            </DienstQuickActions>
          ) : (
            <DienstCard key={d.id} dienst={d} compact={compact} onClick={() => onDienstClick?.(d)} />
          )
        ))}
      </div>
    </div>
  );
}

export function PlanningWeekKalender({
  diensten,
  weekStart,
  showOpen,
  showIngepland,
  compact,
  onDienstClick,
  onEdit,
  onCopy,
  onDelete,
}: PlanningWeekKalenderProps) {
  const start = parseISO(weekStart);
  const dagen = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [weekStart]);

  const { open, ingepland } = useMemo(() => splitByStatus(diensten), [diensten]);

  const ingeplandUren = useMemo(
    () => ingepland.reduce((s, d) => s + (d.netto_uren || 0), 0),
    [ingepland]
  );

  return (
    <div className="space-y-6">
      {showOpen && (
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-2">
            Openstaande diensten{" "}
            <span className="text-muted-foreground font-normal">({open.length})</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            {dagen.map((dag) => (
              <DagKolom
                key={dag.toISOString()}
                dag={dag}
                diensten={open}
                compact={compact}
                onDienstClick={onDienstClick}
                onEdit={onEdit}
                onCopy={onCopy}
                onDelete={onDelete}
              />
            ))}
          </div>
        </section>
      )}

      {showIngepland && (
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-2">
            Ingeplande diensten{" "}
            <span className="text-muted-foreground font-normal">
              ({ingepland.length}, {ingeplandUren.toFixed(1)} uur)
            </span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            {dagen.map((dag) => (
              <DagKolom
                key={dag.toISOString()}
                dag={dag}
                diensten={ingepland}
                compact={compact}
                onDienstClick={onDienstClick}
                onEdit={onEdit}
                onCopy={onCopy}
                onDelete={onDelete}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
