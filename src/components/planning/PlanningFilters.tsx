import { useState } from "react";
import { Filter, X, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useClientOrganizations } from "@/hooks/useClientOrganizations";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { DienstFilters } from "@/hooks/useDienstenPlanning";

interface PlanningFiltersProps {
  filters: DienstFilters;
  onFiltersChange: (filters: DienstFilters) => void;
}

export function PlanningFilters({ filters, onFiltersChange }: PlanningFiltersProps) {
  const [presetName, setPresetName] = useState("");
  const { data: orgs = [] } = useClientOrganizations();
  const queryClient = useQueryClient();

  // Count active filters (exclude weekStart and "all" values)
  const activeCount = [
    filters.status,
    filters.bureau,
    filters.functieNiveau,
    filters.locatie,
    filters.werkvorm,
    filters.certificering,
    filters.spoed,
  ].filter((v) => v !== "all").length;

  const update = (partial: Partial<DienstFilters>) =>
    onFiltersChange({ ...filters, ...partial });

  const reset = () =>
    onFiltersChange({
      ...filters,
      status: "all",
      bureau: "all",
      functieNiveau: "all",
      locatie: "all",
      werkvorm: "all",
      certificering: "all",
      spoed: "all",
    });

  // Presets
  const { data: presets = [] } = useQuery({
    queryKey: ["dienst-filter-presets"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("dienst_filter_presets")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Array<{ id: string; naam: string; filters: Record<string, string> }>;
    },
  });

  const savePreset = async () => {
    if (!presetName.trim()) return;
    const { status, bureau, functieNiveau, locatie, werkvorm, certificering, spoed } = filters;
    const { error } = await supabase.from("dienst_filter_presets").insert({
      naam: presetName.trim(),
      filters: { status, bureau, functieNiveau, locatie, werkvorm, certificering, spoed },
      user_id: (await supabase.auth.getUser()).data.user?.id,
    });
    if (error) {
      toast.error("Preset opslaan mislukt");
    } else {
      toast.success("Filter preset opgeslagen");
      setPresetName("");
      queryClient.invalidateQueries({ queryKey: ["dienst-filter-presets"] });
    }
  };

  const deletePreset = async (id: string) => {
    await supabase.from("dienst_filter_presets").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["dienst-filter-presets"] });
    toast.success("Preset verwijderd");
  };

  const loadPreset = (preset: { filters: Record<string, string> }) => {
    onFiltersChange({
      ...filters,
      status: preset.filters.status ?? "all",
      bureau: preset.filters.bureau ?? "all",
      functieNiveau: preset.filters.functieNiveau ?? "all",
      locatie: preset.filters.locatie ?? "all",
      werkvorm: preset.filters.werkvorm ?? "all",
      certificering: preset.filters.certificering ?? "all",
      spoed: preset.filters.spoed ?? "all",
    });
    toast.success("Filter preset geladen");
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 relative">
          <Filter className="h-3.5 w-3.5" />
          Filters
          {activeCount > 0 && (
            <Badge className="h-4 w-4 p-0 flex items-center justify-center text-[9px] absolute -top-1.5 -right-1.5">
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" align="start">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Filters</span>
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={reset}>
              <X className="h-3 w-3" /> Reset
            </Button>
          )}
        </div>

        {/* Status */}
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Status</label>
          <Select value={filters.status} onValueChange={(v) => update({ status: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="concept">Concept</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="deels_bezet">Deels bezet</SelectItem>
              <SelectItem value="volledig_bezet">Volledig bezet</SelectItem>
              <SelectItem value="voltooid">Voltooid</SelectItem>
              <SelectItem value="geannuleerd">Geannuleerd</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bureau */}
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Bureau</label>
          <Select value={filters.bureau} onValueChange={(v) => update({ bureau: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="ABCzorg">ABCzorg</SelectItem>
              <SelectItem value="CitoZorg">CitoZorg</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Functieniveau */}
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Functieniveau</label>
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

        {/* Opdrachtgever */}
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Opdrachtgever</label>
          <Select value={filters.locatie} onValueChange={(v) => update({ locatie: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              {orgs.filter((o) => o.org_id).map((o) => (
                <SelectItem key={o.id} value={o.org_id!}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Werkvorm */}
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Werkvorm</label>
          <Select value={filters.werkvorm} onValueChange={(v) => update({ werkvorm: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="ZZP">ZZP</SelectItem>
              <SelectItem value="Uitzendkracht">Uitzendkracht</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Certificering */}
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Certificering</label>
          <Select value={filters.certificering} onValueChange={(v) => update({ certificering: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              {["BHV", "SKJ", "Medicatie", "Tilliften", "Voorbehouden handelingen", "Agressie", "EMB", "EVC"].map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Spoed */}
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Spoed</label>
          <Select value={filters.spoed} onValueChange={(v) => update({ spoed: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="ja">Alleen spoed</SelectItem>
              <SelectItem value="nee">Geen spoed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Presets */}
        <div className="border-t border-white/20 dark:border-white/10 pt-2 space-y-2">
          <span className="text-[11px] text-muted-foreground">Presets</span>
          <div className="flex gap-1">
            <Input
              placeholder="Preset naam..."
              className="h-7 text-xs flex-1"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
            />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={savePreset} disabled={!presetName.trim()}>
              <Save className="h-3.5 w-3.5" />
            </Button>
          </div>
          {presets.map((p) => (
            <div key={p.id} className="flex items-center justify-between">
              <button
                className="text-xs text-foreground hover:text-tab-recruitment-600 transition-colors truncate"
                onClick={() => loadPreset(p)}
              >
                {p.naam}
              </button>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => deletePreset(p.id)}>
                <Trash2 className="h-3 w-3 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
