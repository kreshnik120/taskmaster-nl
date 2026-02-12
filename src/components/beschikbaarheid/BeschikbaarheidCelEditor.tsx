import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type CelStatus = "onbekend" | "beschikbaar" | "niet_beschikbaar";

interface BeschikbaarheidCelEditorProps {
  status: CelStatus;
  shiftLabel: string;
  shiftFull: string;
  onToggle: () => void;
  disabled?: boolean;
}

const statusConfig: Record<CelStatus, { bg: string; text: string; tooltip: string }> = {
  onbekend: {
    bg: "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700",
    text: "text-slate-400 dark:text-slate-500",
    tooltip: "Onbekend — klik voor beschikbaar",
  },
  beschikbaar: {
    bg: "bg-emerald-100 dark:bg-emerald-900/40 hover:bg-emerald-200 dark:hover:bg-emerald-800/40",
    text: "text-emerald-700 dark:text-emerald-300",
    tooltip: "Beschikbaar — klik voor niet beschikbaar",
  },
  niet_beschikbaar: {
    bg: "bg-rose-100 dark:bg-rose-900/40 hover:bg-rose-200 dark:hover:bg-rose-800/40",
    text: "text-rose-700 dark:text-rose-300",
    tooltip: "Niet beschikbaar — klik voor onbekend",
  },
};

export function BeschikbaarheidCelEditor({
  status,
  shiftLabel,
  shiftFull,
  onToggle,
  disabled,
}: BeschikbaarheidCelEditorProps) {
  const config = statusConfig[status];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-label={`${shiftFull}: ${config.tooltip}`}
          className={cn(
            "w-8 h-8 rounded-md text-[11px] font-semibold transition-all duration-150",
            "border border-white/30 dark:border-white/10",
            "focus:outline-none focus:ring-2 focus:ring-teal-400/50",
            config.bg,
            config.text,
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          {shiftLabel}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {shiftFull}: {config.tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
