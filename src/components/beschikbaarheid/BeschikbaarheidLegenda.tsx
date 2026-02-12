import { cn } from "@/lib/utils";

const items = [
  { label: "Beschikbaar", color: "bg-emerald-400" },
  { label: "Niet beschikbaar", color: "bg-rose-400" },
  { label: "Onbekend", color: "bg-slate-300 dark:bg-slate-600" },
];

export function BeschikbaarheidLegenda() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", item.color)} />
          <span className="text-[11px] text-muted-foreground">{item.label}</span>
        </div>
      ))}
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground ml-2">
        <span className="font-semibold">D</span>=Dag
        <span className="font-semibold ml-1">A</span>=Avond
        <span className="font-semibold ml-1">N</span>=Nacht
      </div>
    </div>
  );
}
