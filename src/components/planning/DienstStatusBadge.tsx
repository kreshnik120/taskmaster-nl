import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type DienstStatus = "concept" | "open" | "deels_bezet" | "volledig_bezet" | "voltooid" | "geannuleerd";

interface DienstStatusBadgeProps {
  status: string;
  size?: "default" | "xs";
  className?: string;
}

const statusConfig: Record<DienstStatus, { label: string; classes: string }> = {
  concept: {
    label: "Concept",
    classes: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700",
  },
  open: {
    label: "Open",
    classes: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800",
  },
  deels_bezet: {
    label: "Deels bezet",
    classes: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800",
  },
  volledig_bezet: {
    label: "Bezet",
    classes: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800",
  },
  voltooid: {
    label: "Voltooid",
    classes: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800",
  },
  geannuleerd: {
    label: "Geannuleerd",
    classes: "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800/40 dark:text-gray-400 dark:border-gray-700 line-through",
  },
};

export function DienstStatusBadge({ status, size = "default", className }: DienstStatusBadgeProps) {
  const config = statusConfig[status as DienstStatus] ?? { label: status, classes: "" };

  return (
    <Badge
      variant="outline"
      className={cn(
        config.classes,
        size === "xs" && "text-[10px] px-1.5 py-0",
        className
      )}
    >
      {config.label}
    </Badge>
  );
}
