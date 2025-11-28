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
import { ClientGroupingToggle } from "@/components/recruitment/ClientGroupingToggle";
import { ClientSection } from "@/components/recruitment/ClientSection";

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
  const [grouping, setGrouping] = useState<"bureau" | "matching" | "regio" | "alpha">(() => {
    const saved = localStorage.getItem("klanten-grouping");
    return (saved as any) || "bureau";
  });
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

  // Group clients based on selected grouping
  const groupClients = (clients: Client[], groupBy: "bureau" | "matching" | "regio" | "alpha") => {
    const getCompletenessScore = (client: Client) => {
      let score = 0;
      if (client.regio && client.regio.length > 0) score++;
      if (client.sector && client.sector.length > 0) score++;
      if (client.doelgroep && client.doelgroep.length > 0) score++;
      if (client.gezochte_functies && client.gezochte_functies.length > 0) score++;
      return score;
    };

    switch (groupBy) {
      case "bureau":
        return {
          ABCzorg: clients.filter((c) => c.organizations?.name === "ABCzorg"),
          CitoZorg: clients.filter((c) => c.organizations?.name === "CitoZorg"),
        };
      case "matching":
        return {
          Volledig: clients.filter((c) => getCompletenessScore(c) === 4),
          "Deels ingevuld": clients.filter((c) => {
            const score = getCompletenessScore(c);
            return score > 0 && score < 4;
          }),
          "Geen data": clients.filter((c) => getCompletenessScore(c) === 0),
        };
      case "regio": {
        const grouped: Record<string, Client[]> = {};
        clients.forEach((client) => {
          const region = client.regio?.[0] || "Onbekend";
          if (!grouped[region]) grouped[region] = [];
          grouped[region].push(client);
        });
        return grouped;
      }
      case "alpha": {
        const grouped: Record<string, Client[]> = {};
        clients.forEach((client) => {
          const letter = client.company[0]?.toUpperCase() || "#";
          if (!grouped[letter]) grouped[letter] = [];
          grouped[letter].push(client);
        });
        return grouped;
      }
    }
  };

  const groupedClients = groupClients(filteredClients, grouping);

  // Save grouping preference to localStorage
  const handleGroupingChange = (newGrouping: "bureau" | "matching" | "regio" | "alpha") => {
    setGrouping(newGrouping);
    localStorage.setItem("klanten-grouping", newGrouping);
  };

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
              <div className="mt-6">
                <ClientMatchingUrgency
                  clientsWithoutData={clientsWithoutMatching}
                  firstClientName={clients.find(c => !c.regio || c.regio.length === 0 || !c.sector || c.sector.length === 0)?.name}
                  firstClientInitials={clients.find(c => !c.regio || c.regio.length === 0 || !c.sector || c.sector.length === 0)?.company.slice(0, 2).toUpperCase()}
                  firstClientPhone={clients.find(c => !c.regio || c.regio.length === 0 || !c.sector || c.sector.length === 0)?.phone}
                  firstClientEmail={clients.find(c => !c.regio || c.regio.length === 0 || !c.sector || c.sector.length === 0)?.email}
                  onViewClick={() => setMatchingFilter("without")}
                />
              </div>
            )}

            {/* Recent Clients Widget - Collapsible */}
            <div className="mt-6">
              <RecentClientsWidget
                clients={clients}
                isLoading={loading}
                onClientClick={setSelectedClient}
              />
            </div>

            {/* Search and Filter Bar */}
            <div className="flex gap-3 flex-wrap items-center mt-8">
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

            {/* Grouping Toggle */}
            <div className="mt-6">
              <ClientGroupingToggle value={grouping} onChange={handleGroupingChange} />
            </div>

            {/* Grouped Client Sections */}
            <div className="space-y-8 mt-8">
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[...Array(6)].map((_, i) => (
                    <ClientCardSkeleton key={i} />
                  ))}
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {searchQuery ? "Geen klanten gevonden" : "Nog geen klanten"}
                </div>
              ) : (
                Object.entries(groupedClients)
                  .sort(([, a], [, b]) => b.length - a.length)
                  .map(([sectionName, sectionClients], index) => (
                    <div key={sectionName}>
                      {index > 0 && <div className="border-t my-6" />}
                      <ClientSection
                        title={sectionName}
                        clients={sectionClients}
                        totalClients={filteredClients.length}
                        groupType={grouping}
                        onClientClick={(client) => {
                          setSelectedClient(client);
                        }}
                        searchQuery={searchQuery}
                        defaultOpen={true}
                      />
                    </div>
                  ))
              )}
            </div>
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
