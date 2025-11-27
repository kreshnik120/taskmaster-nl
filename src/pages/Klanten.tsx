import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import NewClientDialog from "@/components/NewClientDialog";

interface Client {
  id: string;
  name: string;
  company: string;
  org_id: string;
  created_at: string;
  organizations?: {
    name: string;
  };
}

export default function Klanten() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [orgFilter, setOrgFilter] = useState<string>("");
  const [newClientOpen, setNewClientOpen] = useState(false);
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
    return matchesSearch && matchesOrg;
  });

  const abczorgCount = clients.filter(c => c.organizations?.name === "ABCzorg").length;
  const citozorgCount = clients.filter(c => c.organizations?.name === "CitoZorg").length;

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
            <div className="flex items-center gap-4 text-sm">
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
            </div>

            {/* Search and Filter Bar */}
            <div className="flex gap-3">
              <div className="relative flex-1">
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
                <option value="">Alle organisaties</option>
                <option value="ABCzorg">ABCzorg</option>
                <option value="CitoZorg">CitoZorg</option>
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
                {filteredClients.map((client) => (
                  <Card key={client.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <CardTitle className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="text-base">{client.name}</span>
                          </div>
                          <p className="text-sm text-muted-foreground font-normal">
                            {client.company}
                          </p>
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
                      <Button variant="outline" size="sm" className="w-full">
                        Bekijk details
                      </Button>
                    </CardContent>
                  </Card>
                ))}
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
    </SidebarProvider>
  );
}
