import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { DienstStatusBadge } from "./DienstStatusBadge";
import { DienstQuickActions } from "./DienstQuickActions";
import { Progress } from "@/components/ui/progress";
import { berekenBezetting } from "@/utils/bezetting";
import type { DienstData } from "@/hooks/useDienstenPlanning";

interface PlanningLijstWeergaveProps {
  diensten: DienstData[];
  onDienstClick?: (dienst: DienstData) => void;
  onEdit?: (dienst: DienstData) => void;
  onCopy?: (dienst: DienstData) => void;
  onDelete?: (dienst: DienstData) => void;
}

export function PlanningLijstWeergave({ diensten, onDienstClick, onEdit, onCopy, onDelete }: PlanningLijstWeergaveProps) {
  if (diensten.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-white/10">
        <Inbox className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">Geen diensten gevonden voor deze week</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      {/* Header */}
      <div className="grid grid-cols-[1fr_1fr_100px_100px_90px] gap-2 px-3 py-2 text-[11px] font-medium text-muted-foreground border-b border-white/20 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md">
        <span>Datum & Tijd</span>
        <span>Locatie</span>
        <span>Functie</span>
        <span>Bezetting</span>
        <span>Status</span>
      </div>

      {/* Rows */}
      {diensten.map((d) => {
        const bezet = d.toewijzingen.filter((t) => ["bevestigd", "positief"].includes(t.status)).length;
        const gevraagd = d.gevraagd_aantal || 1;
        const pct = Math.min(Math.round((bezet / gevraagd) * 100), 100);
        const formatTijd = (t: string) => t?.slice(0, 5) ?? "";

        const row = (
          <button
            key={d.id}
            onClick={() => onDienstClick?.(d)}
            className={cn(
              "grid grid-cols-[1fr_1fr_100px_100px_90px] gap-2 px-3 py-2 text-left w-full",
              "hover:bg-white/60 dark:hover:bg-slate-800/40 transition-colors",
              "border-b border-white/10 dark:border-white/5 last:border-b-0",
              d.status === "geannuleerd" && "opacity-60"
            )}
          >
            <div>
              <div className="text-xs font-medium text-foreground">
                {d.kleur && <span className="inline-block w-2.5 h-2.5 rounded-full mr-1 align-middle" style={{ backgroundColor: d.kleur }} />}
                {d.is_spoed && <span className="mr-0.5">🚨</span>}
                {format(parseISO(d.datum), "EEE d MMM", { locale: nl })}
                {d.dienst_type === "nacht" && " 🌙"}
                {d.is_slaapdienst && " 🛏️"}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {formatTijd(d.start_tijd)}–{formatTijd(d.eind_tijd)} · {d.netto_uren}u · {d.dienst_type}
              </div>
            </div>
            <div>
              <div className="text-xs text-foreground truncate">{d.sublocation?.naam ?? "—"}</div>
              <div className="text-[10px] text-muted-foreground truncate">
                {d.sublocation?.location?.organization?.name ?? ""}
              </div>
            </div>
            <div className="flex items-center">
              <span className="text-[11px] font-medium text-muted-foreground truncate">
                {d.gevraagd_functie_niveau?.length > 0 ? d.gevraagd_functie_niveau.join(", ") : "–"}
              </span>
            </div>
            <div className="flex flex-col justify-center gap-0.5">
              <span className="text-[10px] text-muted-foreground">{bezet}/{gevraagd}</span>
              <Progress value={pct} size="xs" />
            </div>
            <div className="flex items-center">
              <DienstStatusBadge status={d.status} size="xs" />
            </div>
          </button>
        );

        return onEdit && onCopy && onDelete ? (
          <DienstQuickActions
            key={d.id}
            dienst={d}
            onOpen={(di) => onDienstClick?.(di)}
            onEdit={onEdit}
            onCopy={onCopy}
            onDelete={onDelete}
          >
            {row}
          </DienstQuickActions>
        ) : row;
      })}
    </div>
  );
}
