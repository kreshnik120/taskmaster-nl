import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Building2, MapPin } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface Sublocation {
  id: string;
  naam: string;
  sector: string[] | null;
  provincie: string | null;
  location: {
    naam: string;
    client_org: {
      id: string;
      name: string;
      org_id: string;
    } | null;
  } | null;
}

interface ClientSelectionDialogProps {
  onSelect: (clientId: string) => void;
  onCancel: () => void;
}

export const ClientSelectionDialog = ({ onSelect, onCancel }: ClientSelectionDialogProps) => {
  const [sublocations, setSublocations] = useState<Sublocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadSublocations();
  }, []);

  const loadSublocations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userOrgs } = await supabase
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', user.id);

      if (!userOrgs || userOrgs.length === 0) return;

      const orgIds = userOrgs.map(uo => uo.org_id);

      const { data, error } = await supabase
        .from('client_sublocations')
        .select(`
          id, naam, sector, provincie,
          location:client_locations!location_id (
            naam,
            client_org:client_organizations!client_org_id (
              id, name, org_id
            )
          )
        `)
        .eq('is_active', true)
        .order('naam');

      if (error) throw error;
      
      // Filter by user's organizations
      const filtered = (data || []).filter(sub => 
        sub.location?.client_org?.org_id && orgIds.includes(sub.location.client_org.org_id)
      );
      
      setSublocations(filtered);
    } catch (error) {
      console.error('Error loading sublocations:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSublocations = sublocations.filter(sub => 
    sub.naam.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (sub.location?.client_org?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Zoek werklocatie..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <ScrollArea className="h-[400px] pr-4">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Werklocaties laden...
          </div>
        ) : filteredSublocations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {searchQuery ? "Geen werklocaties gevonden" : "Geen actieve werklocaties"}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSublocations.map((sub) => (
              <button
                key={sub.id}
                onClick={() => onSelect(sub.id)}
                className="w-full text-left p-4 rounded-lg border hover:border-primary hover:bg-accent/50 transition-all"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium">{sub.naam}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {sub.location?.client_org?.name || 'Onbekende organisatie'}
                      </div>
                    </div>
                  </div>
                  
                  {sub.provincie && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {sub.provincie}
                    </div>
                  )}
                  
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
