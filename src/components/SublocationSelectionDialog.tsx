import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Building2, MapPin, Users } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Sublocation {
  id: string;
  naam: string;
  plaats: string | null;
  sector: string[] | null;
  doelgroep: string[] | null;
  gezochte_functies: string[] | null;
  location: {
    id: string;
    naam: string;
    client_org: {
      id: string;
      name: string;
    } | null;
  } | null;
}

interface SublocationSelectionDialogProps {
  onSelect: (sublocationId: string, sublocationName: string) => void;
  onCancel: () => void;
}

export const SublocationSelectionDialog = ({ onSelect, onCancel }: SublocationSelectionDialogProps) => {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: sublocations, isLoading } = useQuery({
    queryKey: ['sublocations-for-placement'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: userOrgs } = await supabase
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', user.id);

      if (!userOrgs || userOrgs.length === 0) return [];

      const { data, error } = await supabase
        .from('client_sublocations')
        .select(`
          id,
          naam,
          plaats,
          sector,
          doelgroep,
          gezochte_functies,
          location:client_locations!location_id (
            id,
            naam,
            client_org:client_organizations!client_org_id (
              id,
              name
            )
          )
        `)
        .eq('is_active', true)
        .order('naam');

      if (error) {
        console.error('Error loading sublocations:', error);
        return [];
      }

      return (data || []) as unknown as Sublocation[];
    }
  });

  const filteredSublocations = useMemo(() => {
    if (!sublocations) return [];
    if (!searchQuery.trim()) return sublocations.slice(0, 50); // Limit initial display

    const query = searchQuery.toLowerCase();
    return sublocations.filter(sub => 
      sub.naam.toLowerCase().includes(query) ||
      sub.plaats?.toLowerCase().includes(query) ||
      sub.location?.naam?.toLowerCase().includes(query) ||
      sub.location?.client_org?.name?.toLowerCase().includes(query) ||
      sub.sector?.some(s => s.toLowerCase().includes(query)) ||
      sub.doelgroep?.some(d => d.toLowerCase().includes(query))
    ).slice(0, 100);
  }, [sublocations, searchQuery]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Zoek op naam, plaats, organisatie of sector..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
          autoFocus
        />
      </div>

      <div className="text-xs text-muted-foreground">
        {filteredSublocations.length} van {sublocations?.length || 0} locaties
      </div>

      <ScrollArea className="h-[400px] pr-4">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : filteredSublocations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {searchQuery ? "Geen locaties gevonden" : "Geen actieve locaties beschikbaar"}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSublocations.map((sub) => (
              <button
                key={sub.id}
                onClick={() => onSelect(sub.id, sub.naam)}
                className="w-full text-left p-4 rounded-lg border hover:border-primary hover:bg-accent/50 transition-all"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium">{sub.naam}</div>
                      {sub.location?.client_org && (
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {sub.location.client_org.name}
                        </div>
                      )}
                    </div>
                    {sub.plaats && (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {sub.plaats}
                      </Badge>
                    )}
                  </div>
                  
                  {sub.sector && sub.sector.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {sub.sector.slice(0, 3).map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                      {sub.sector.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{sub.sector.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}

                  {sub.doelgroep && sub.doelgroep.length > 0 && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {sub.doelgroep.slice(0, 3).join(", ")}
                      {sub.doelgroep.length > 3 && ` +${sub.doelgroep.length - 3}`}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="flex justify-end">
        <Button variant="outline" onClick={onCancel}>
          Annuleren
        </Button>
      </div>
    </div>
  );
};
