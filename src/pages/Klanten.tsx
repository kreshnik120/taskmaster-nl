import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Search, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import NewClientDialog from "@/components/NewClientDialog";
import ClientDetailModal from "@/components/ClientDetailModal";

interface Client {
  id: string;
  name: string;
  company: string;
  org_id: string;
  created_at: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  regio?: string[] | null;
  sector?: string[] | null;
  doelgroep?: string[] | null;
  gezochte_functies?: string[] | null;
  organizations?: {
    name: string;
  };
}

export default function Klanten() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [orgFilter, setOrgFilter] = useState<string>("");
  const [matchingFilter, setMatchingFilter] = useState<string>("");
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("clients")
        .select(`
          *,
          organizations!inner(name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setClients(data || []);
    } catch (error: any) {
      console.error("Error loading clients:", error);
      toast.error("Kon klanten niet laden");
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = clients.filter(client => {
    const matchesSearch = client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.company.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesOrg = !orgFilter || client.organizations?.name === orgFilter;
    
    // Matching filter
    const hasMatchingData = (client.regio && client.regio.length > 0) ||
                           (client.sector && client.sector.length > 0) ||
                           (client.doelgroep && client.doelgroep.length > 0) ||
                           (client.gezochte_functies && client.gezochte_functies.length > 0);
    const matchesMatchingFilter = !matchingFilter || 
      (matchingFilter === "with" && hasMatchingData) ||
      (matchingFilter === "without" && !hasMatchingData);
    
    return matchesSearch && matchesOrg && matchesMatchingFilter;
  });

  const abczorgCount = clients.filter(c => c.organizations?.name === "ABCzorg").length;
  const citozorgCount = clients.filter(c => c.organizations?.name === "CitoZorg").length;
  
  // Matching readiness stats
  const clientsWithMatching = clients.filter(c => 
    (c.regio && c.regio.length > 0) ||
    (c.sector && c.sector.length > 0) ||
    (c.doelgroep && c.doelgroep.length > 0) ||
    (c.gezochte_functies && c.gezochte_functies.length > 0)
  ).length;
  const matchingPercentage = clients.length > 0 ? Math.round((clientsWithMatching / clients.length) * 100) : 0;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-6 space-y-6">
            <SidebarTrigger className="mb-4" />

            {/* Hero Section */}
            <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-background rounded-lg p-6 border border-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold mb-2">Klanten</h1>
                  <p className="text-muted-foreground">
                    Beheer opdrachtgevers en zorglocaties
                  </p>
                </div>
                <Button onClick={() => setNewClientOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nieuwe klant
                </Button>
              </div>
            </div>

            {/* Stats Bar */}
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{clients.length}</span>
                <span className="text-muted-foreground">klanten</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-2">
                <span className="font-medium">{abczorgCount}</span>
                <span className="text-muted-foreground">ABCzorg</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-2">
                <span className="font-medium">{citozorgCount}</span>
                <span className="text-muted-foreground">CitoZorg</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`h-4 w-4 ${matchingPercentage >= 70 ? 'text-green-600' : 'text-amber-600'}`} />
                <span className="font-medium">{clientsWithMatching}</span>
                <span className="text-muted-foreground">van {clients.length} met matching data</span>
                <span className={`font-medium ${matchingPercentage >= 70 ? 'text-green-600' : 'text-amber-600'}`}>
                  ({matchingPercentage}%)
                </span>
              </div>
            </div>

            {/* Search and Filter Bar */}
            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Zoek op naam of bedrijf..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                value={orgFilter}
                onChange={(e) => setOrgFilter(e.target.value)}
                className="px-3 py-2 border rounded-md bg-background text-sm"
              >
                <option value="">Alle bureaus</option>
                <option value="ABCzorg">ABCzorg</option>
                <option value="CitoZorg">CitoZorg</option>
              </select>
              <select
                value={matchingFilter}
                onChange={(e) => setMatchingFilter(e.target.value)}
                className="px-3 py-2 border rounded-md bg-background text-sm"
              >
                <option value="">Alle klanten</option>
                <option value="with">Met matching data</option>
                <option value="without">Zonder matching data</option>
              </select>
            </div>

            {/* Clients Grid */}
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">
                Laden...
              </div>
            ) : filteredClients.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {searchQuery ? "Geen klanten gevonden" : "Nog geen klanten"}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredClients.map((client) => {
                  const hasMatchingData = (client.regio && client.regio.length > 0) ||
                                         (client.sector && client.sector.length > 0) ||
                                         (client.doelgroep && client.doelgroep.length > 0) ||
                                         (client.gezochte_functies && client.gezochte_functies.length > 0);
                  
                  return (
                    <Card key={client.id} className="hover:shadow-md transition-shadow">
                      <CardHeader>
                        <CardTitle className="flex items-start justify-between">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <span className="text-base">{client.name}</span>
                              {hasMatchingData && (
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground font-normal">
                              {client.company}
                            </p>
                            
                            {/* Matching data preview */}
                            {hasMatchingData && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {client.regio?.slice(0, 2).map((r) => (
                                  <Badge key={r} variant="secondary" className="text-xs">
                                    {r}
                                  </Badge>
                                ))}
                                {client.sector?.slice(0, 2).map((s) => (
                                  <Badge key={s} variant="outline" className="text-xs">
                                    {s}
                                  </Badge>
                                ))}
                                {((client.regio?.length || 0) > 2 || (client.sector?.length || 0) > 2) && (
                                  <Badge variant="secondary" className="text-xs">
                                    +meer
                                  </Badge>
                                )}
                              </div>
                            )}
                            
                            {/* Quick info */}
                            <div className="text-xs text-muted-foreground mt-1">
                              {client.regio?.length || 0} regio's • {client.sector?.length || 0} sectoren
                            </div>
                          </div>
                          <Badge variant={client.organizations?.name === "ABCzorg" ? "default" : "secondary"}>
                            {client.organizations?.name || "Onbekend"}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="text-xs text-muted-foreground">
                          Toegevoegd {format(new Date(client.created_at), "d MMM yyyy", { locale: nl })}
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full"
                          onClick={() => setSelectedClient(client)}
                        >
                          Bekijk details
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      <NewClientDialog
        open={newClientOpen}
        onOpenChange={setNewClientOpen}
        onClientCreated={loadClients}
      />

      {selectedClient && (
        <ClientDetailModal
          open={!!selectedClient}
          onOpenChange={(open) => !open && setSelectedClient(null)}
          client={selectedClient}
          onUpdate={loadClients}
        />
      )}
    </SidebarProvider>
  );
}
