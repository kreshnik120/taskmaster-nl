import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Building2, MapPin } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface Client {
  id: string;
  name: string;
  company: string;
  tier: number;
  regio: string[] | null;
  sector: string[] | null;
}

interface ClientSelectionDialogProps {
  onSelect: (clientId: string) => void;
  onCancel: () => void;
}

export const ClientSelectionDialog = ({ onSelect, onCancel }: ClientSelectionDialogProps) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userOrgs } = await supabase
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', user.id);

      if (!userOrgs || userOrgs.length === 0) return;

      const { data, error } = await supabase
        .from('clients')
        .select('id, name, company, tier, regio, sector')
        .in('org_id', userOrgs.map(uo => uo.org_id))
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = clients.filter(client => 
    client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.company.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Zoek klant..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <ScrollArea className="h-[400px] pr-4">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Klanten laden...
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {searchQuery ? "Geen klanten gevonden" : "Geen actieve klanten"}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredClients.map((client) => (
              <button
                key={client.id}
                onClick={() => onSelect(client.id)}
                className="w-full text-left p-4 rounded-lg border hover:border-primary hover:bg-accent/50 transition-all"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium">{client.name}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {client.company}
                      </div>
                    </div>
                    <Badge variant="outline">Tier {client.tier}</Badge>
                  </div>
                  
                  {client.regio && client.regio.length > 0 && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {client.regio.slice(0, 3).join(", ")}
                      {client.regio.length > 3 && ` +${client.regio.length - 3}`}
                    </div>
                  )}
                  
                  {client.sector && client.sector.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {client.sector.slice(0, 3).map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                      {client.sector.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{client.sector.length - 3}
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
