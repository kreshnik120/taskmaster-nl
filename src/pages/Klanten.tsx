import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import NewClientDialog from "@/components/NewClientDialog";
import ClientDetailModal from "@/components/ClientDetailModal";
import { ClientMetricsBar } from "@/components/recruitment/ClientMetricsBar";
import { ClientCard, ClientCardSkeleton } from "@/components/ClientCard";
import { ClientMatchingUrgency } from "@/components/recruitment/ClientMatchingUrgency";
import { RecentClientsWidget } from "@/components/recruitment/RecentClientsWidget";

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        // Allow Escape to clear search
        if (e.key === "Escape" && searchQuery) {
          setSearchQuery("");
          e.preventDefault();
        }
        return;
      }

      // N = New Client
      if (e.key === "n" || e.key === "N") {
        setNewClientOpen(true);
        e.preventDefault();
      }

      // / = Focus search
      if (e.key === "/") {
        document.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
        e.preventDefault();
      }

      // Escape = Close modals, clear search
      if (e.key === "Escape") {
        if (selectedClient) {
          setSelectedClient(null);
        } else if (newClientOpen) {
          setNewClientOpen(false);
        } else if (searchQuery) {
          setSearchQuery("");
        }
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchQuery, selectedClient, newClientOpen]);

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
  const clientsWithoutMatching = clients.length - clientsWithMatching;

  const handleQuickCall = (client: Client) => {
    if (client.phone) {
      window.location.href = `tel:${client.phone}`;
      toast.success(`Bellen naar ${client.name}`);
    }
  };

  const handleQuickEmail = (client: Client) => {
    if (client.email) {
      window.location.href = `mailto:${client.email}`;
      toast.success(`Email naar ${client.name}`);
    }
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-6 space-y-6">
            <SidebarTrigger className="mb-4" />

            {/* Hero Section */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold mb-1">
                Goedemiddag 👋
              </h1>
              <p className="text-muted-foreground">
                Beheer opdrachtgevers en zorglocaties
              </p>
            </div>

            {/* Metrics Bar */}
            <ClientMetricsBar
              total={clients.length}
              abczorgCount={abczorgCount}
              citozorgCount={citozorgCount}
              matchingPercentage={matchingPercentage}
            />

            {/* Urgency Banner */}
            {clientsWithoutMatching > 0 && (
              <ClientMatchingUrgency
                clientsWithoutData={clientsWithoutMatching}
                onViewClick={() => setMatchingFilter("without")}
              />
            )}

            {/* Recent Clients Widget */}
            <RecentClientsWidget
              clients={clients}
              isLoading={loading}
              onClientClick={setSelectedClient}
            />

            {/* Search and Filter Bar */}
            <div className="flex gap-3 flex-wrap items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Zoek op naam of bedrijf..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-12"
                />
                <kbd className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  /
                </kbd>
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
              <Button 
                onClick={() => setNewClientOpen(true)}
                className="shrink-0"
              >
                <Plus className="h-4 w-4 mr-2" />
                Nieuwe klant
                <kbd className="ml-2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-background/20 bg-background/20 px-1.5 font-mono text-[10px] font-medium opacity-100">
                  N
                </kbd>
              </Button>
            </div>

            {/* Clients Grid */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <ClientCardSkeleton key={i} />
                ))}
              </div>
            ) : filteredClients.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {searchQuery ? "Geen klanten gevonden" : "Nog geen klanten"}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredClients.map((client) => (
                  <ClientCard
                    key={client.id}
                    client={client}
                    searchQuery={searchQuery}
                    onClick={() => setSelectedClient(client)}
                    onQuickCall={() => handleQuickCall(client)}
                    onQuickEmail={() => handleQuickEmail(client)}
                  />
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
