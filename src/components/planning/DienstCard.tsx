import { cn } from "@/lib/utils";
import { DienstStatusBadge } from "./DienstStatusBadge";
import { Building2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { DienstData } from "@/hooks/useDienstenPlanning";

interface DienstCardProps {
  dienst: DienstData;
  compact?: boolean;
  onClick?: () => void;
}

const borderColorMap: Record<string, string> = {
  concept: "border-l-slate-400",
  open: "border-l-rose-400",
  deels_bezet: "border-l-amber-400",
  volledig_bezet: "border-l-emerald-400",
  voltooid: "border-l-blue-400",
  geannuleerd: "border-l-gray-300",
};

export function DienstCard({ dienst, compact = true, onClick }: DienstCardProps) {
  const bezet = dienst.toewijzingen.filter((t) =>
    ["bevestigd", "positief"].includes(t.status)
  ).length;
  const gevraagd = dienst.gevraagd_aantal || 1;
  const bezettingPct = Math.min(Math.round((bezet / gevraagd) * 100), 100);

  const heeftReacties = dienst.toewijzingen.some((t) =>
    ["positief", "misschien"].includes(t.status)
  );

  const formatTijd = (t: string) => t?.slice(0, 5) ?? "";
  const isGeannuleerd = dienst.status === "geannuleerd";

  if (compact) {
    return (
      <button
        onClick={onClick}
        className={cn(
          "w-full text-left border-l-4 rounded-lg p-2 transition-all duration-200",
          "bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm",
          "border border-white/30 dark:border-white/10",
          "hover:bg-white/70 dark:hover:bg-slate-800/50 hover:shadow-sm",
          borderColorMap[dienst.status] ?? "border-l-slate-300",
          isGeannuleerd && "opacity-60"
        )}
      >
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <span className="text-xs font-medium text-foreground truncate">
            {formatTijd(dienst.start_tijd)}–{formatTijd(dienst.eind_tijd)}
          </span>
          <div className="flex items-center gap-1">
            {heeftReacties && (
              <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" />
            )}
            <DienstStatusBadge status={dienst.status} size="xs" />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground truncate">
          {dienst.sublocation?.naam ?? "Onbekende locatie"}
        </p>
        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground/80">
          <Building2 className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {dienst.gevraagd_functie_niveau?.length > 0 ? dienst.gevraagd_functie_niveau.join(", ") : "–"}
          </span>
          <span>·</span>
          <span>{bezet}/{gevraagd} bezet</span>
        </div>
      </button>
    );
  }

  // Full mode (list view row)
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left border-l-4 rounded-lg px-3 py-2 transition-all duration-200",
        "bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm",
        "border border-white/30 dark:border-white/10",
        "hover:bg-white/70 dark:hover:bg-slate-800/50 hover:shadow-sm",
        "flex items-center gap-4",
        borderColorMap[dienst.status] ?? "border-l-slate-300",
        isGeannuleerd && "opacity-60"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {formatTijd(dienst.start_tijd)}–{formatTijd(dienst.eind_tijd)}
          </span>
          <span className="text-xs text-muted-foreground">
            ({dienst.netto_uren}u)
          </span>
          {heeftReacties && (
            <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" />
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {dienst.sublocation?.naam ?? "Onbekende locatie"} — {dienst.sublocation?.location?.organization?.name ?? ""}
        </p>
      </div>
      <div className="shrink-0">
        <span className="text-xs font-medium text-muted-foreground">
          {dienst.gevraagd_functie_niveau?.length > 0 ? dienst.gevraagd_functie_niveau.join(", ") : "–"}
        </span>
      </div>
      <div className="shrink-0 w-20 space-y-0.5">
        <span className="text-[10px] text-muted-foreground">{bezet}/{gevraagd}</span>
        <Progress value={bezettingPct} size="xs" />
      </div>
      <DienstStatusBadge status={dienst.status} size="xs" />
    </button>
  );
}
