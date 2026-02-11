import { cn } from "@/lib/utils";

const items = [
  { label: "Open", color: "bg-rose-400" },
  { label: "Deels bezet", color: "bg-amber-400" },
  { label: "Bezet", color: "bg-emerald-400" },
  { label: "Voltooid", color: "bg-blue-400" },
  { label: "Concept", color: "bg-slate-400" },
  { label: "Met reactie", color: "bg-yellow-400" },
  { label: "Geannuleerd", color: "bg-gray-300", strike: true },
];

export function PlanningLegenda() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", item.color)} />
          <span
            className={cn(
              "text-[11px] text-muted-foreground",
              item.strike && "line-through"
            )}
          >
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
