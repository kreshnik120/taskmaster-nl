import { LayoutGrid, LayoutList, Square } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface DensityToggleProps {
  value: "compact" | "comfortable" | "spacious";
  onChange: (value: "compact" | "comfortable" | "spacious") => void;
}

export function DensityToggle({ value, onChange }: DensityToggleProps) {
  return (
    <TooltipProvider>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(val) => val && onChange(val as "compact" | "comfortable" | "spacious")}
        className="border rounded-lg p-1 bg-background"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem value="compact" aria-label="Compacte weergave" className="px-3">
              <LayoutGrid className="h-4 w-4" />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>Compact (3 kolommen)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem value="comfortable" aria-label="Comfortabele weergave" className="px-3">
              <Square className="h-4 w-4" />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>Comfortable (2 kolommen)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem value="spacious" aria-label="Ruime weergave" className="px-3">
              <LayoutList className="h-4 w-4" />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>Ruim (1 kolom)</TooltipContent>
        </Tooltip>
      </ToggleGroup>
    </TooltipProvider>
  );
}
