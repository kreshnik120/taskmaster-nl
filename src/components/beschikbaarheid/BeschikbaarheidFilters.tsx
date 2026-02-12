import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BeschikbaarheidFilters as FiltersType } from "@/hooks/useBeschikbaarheid";

interface BeschikbaarheidFiltersProps {
  filters: FiltersType;
  onFiltersChange: (filters: FiltersType) => void;
}

export function BeschikbaarheidFilters({ filters, onFiltersChange }: BeschikbaarheidFiltersProps) {
  const activeCount = [
    filters.functieNiveau,
    filters.werkvorm,
    filters.status,
    filters.regio,
  ].filter((v) => v !== "all").length;

  const update = (partial: Partial<FiltersType>) =>
    onFiltersChange({ ...filters, ...partial });

  const reset = () =>
    onFiltersChange({
      ...filters,
      functieNiveau: "all",
      werkvorm: "all",
      status: "all",
      regio: "all",
    });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          Filters
          {activeCount > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px] rounded-full">
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4" align="end">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">Filters</span>
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" onClick={reset} className="h-6 text-xs gap-1 px-2">
              <X className="h-3 w-3" /> Reset
            </Button>
          )}
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Functieniveau</label>
            <Select value={filters.functieNiveau} onValueChange={(v) => update({ functieNiveau: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                {["HBO", "HBO-V", "VP5", "VP4", "VP3", "VIG", "Helpende Plus", "Helpende", "BEG4", "BEG3"].map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Werkvorm</label>
            <Select value={filters.werkvorm} onValueChange={(v) => update({ werkvorm: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="ZZP">ZZP</SelectItem>
                <SelectItem value="Uitzendkracht">Uitzendkracht</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Status professional</label>
            <Select value={filters.status} onValueChange={(v) => update({ status: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="actief">Actief</SelectItem>
                <SelectItem value="beschikbaar">Beschikbaar</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Regio</label>
            <Select value={filters.regio} onValueChange={(v) => update({ regio: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="Noord">Noord</SelectItem>
                <SelectItem value="Midden">Midden</SelectItem>
                <SelectItem value="Zuid">Zuid</SelectItem>
                <SelectItem value="West">West</SelectItem>
                <SelectItem value="Oost">Oost</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
