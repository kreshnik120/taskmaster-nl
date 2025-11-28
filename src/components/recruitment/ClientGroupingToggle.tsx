import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface ClientGroupingToggleProps {
  value: "bureau" | "matching" | "regio" | "alpha";
  onChange: (value: "bureau" | "matching" | "regio" | "alpha") => void;
  counts?: {
    bureau?: number;
    matching?: number;
    regio?: number;
    alpha?: number;
  };
}

export function ClientGroupingToggle({ value, onChange, counts }: ClientGroupingToggleProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">Groepeer op:</span>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(val) => val && onChange(val as any)}
        className="bg-muted/30 p-1 rounded-xl border border-border/50"
      >
        <ToggleGroupItem value="bureau" className="rounded-lg px-4 py-1.5 text-sm font-medium text-foreground/70 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm transition-all">
          Bureau
          {counts?.bureau !== undefined && (
            <span className="ml-1.5 text-xs opacity-60">({counts.bureau})</span>
          )}
        </ToggleGroupItem>
        <ToggleGroupItem value="matching" className="rounded-lg px-4 py-1.5 text-sm font-medium text-foreground/70 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm transition-all">
          Matching
          {counts?.matching !== undefined && (
            <span className="ml-1.5 text-xs opacity-60">({counts.matching})</span>
          )}
        </ToggleGroupItem>
        <ToggleGroupItem value="regio" className="rounded-lg px-4 py-1.5 text-sm font-medium text-foreground/70 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm transition-all">
          Regio
          {counts?.regio !== undefined && (
            <span className="ml-1.5 text-xs opacity-60">({counts.regio})</span>
          )}
        </ToggleGroupItem>
        <ToggleGroupItem value="alpha" className="rounded-lg px-4 py-1.5 text-sm font-medium text-foreground/70 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm transition-all">
          A-Z
          {counts?.alpha !== undefined && (
            <span className="ml-1.5 text-xs opacity-60">({counts.alpha})</span>
          )}
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
