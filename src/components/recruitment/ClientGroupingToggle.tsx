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
        className="bg-muted/50 p-1 rounded-lg"
      >
        <ToggleGroupItem value="bureau" className="data-[state=on]:bg-background data-[state=on]:shadow-sm">
          Bureau
          {counts?.bureau !== undefined && (
            <span className="ml-1.5 text-xs text-muted-foreground">({counts.bureau})</span>
          )}
        </ToggleGroupItem>
        <ToggleGroupItem value="matching" className="data-[state=on]:bg-background data-[state=on]:shadow-sm">
          Matching
          {counts?.matching !== undefined && (
            <span className="ml-1.5 text-xs text-muted-foreground">({counts.matching})</span>
          )}
        </ToggleGroupItem>
        <ToggleGroupItem value="regio" className="data-[state=on]:bg-background data-[state=on]:shadow-sm">
          Regio
          {counts?.regio !== undefined && (
            <span className="ml-1.5 text-xs text-muted-foreground">({counts.regio})</span>
          )}
        </ToggleGroupItem>
        <ToggleGroupItem value="alpha" className="data-[state=on]:bg-background data-[state=on]:shadow-sm">
          A-Z
          {counts?.alpha !== undefined && (
            <span className="ml-1.5 text-xs text-muted-foreground">({counts.alpha})</span>
          )}
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
