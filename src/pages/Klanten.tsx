import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, X, Users, Building2, Target, LayoutGrid, Network } from "lucide-react";
import { toast } from "sonner";
import NewClientDialog from "@/components/NewClientDialog";
import ClientDetailModal from "@/components/ClientDetailModal";
import { KPICard } from "@/components/ui/kpi-card";
import { ClientCard, ClientCardSkeleton } from "@/components/ClientCard";
import { ClientMatchingUrgency } from "@/components/recruitment/ClientMatchingUrgency";
import { RecentClientsWidget } from "@/components/recruitment/RecentClientsWidget";
import { ClientGroupingToggle } from "@/components/recruitment/ClientGroupingToggle";
import { DensityToggle } from "@/components/recruitment/DensityToggle";
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
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "hierarchy">(() => {
    const saved = localStorage.getItem("klanten-view-mode");
    return (saved as any) || "cards";
  });
  const [grouping, setGrouping] = useState<"bureau" | "sector" | "matching" | "regio" | "alpha">(() => {
    const saved = localStorage.getItem("klanten-grouping");
    return (saved as any) || "bureau";
  });
  const [density, setDensity] = useState<"compact" | "comfortable" | "spacious">(() => {
    const saved = localStorage.getItem("klanten-density");
    return (saved as any) || "compact";
  });
  const [allExpanded, setAllExpanded] = useState(true);
  
  // Hierarchy data (will be loaded from database)
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [sublocations, setSublocations] = useState<any[]>([]);
  
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Sync filters with URL
  const searchQuery = searchParams.get('search') || '';
  const orgFilter = searchParams.get('org') || 'all';
  const matchingFilter = searchParams.get('matching') || 'all';
  
  const setSearchQuery = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set('search', value);
    else params.delete('search');
    setSearchParams(params);
  };
  
  const setOrgFilter = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value !== 'all') params.set('org', value);
    else params.delete('org');
    setSearchParams(params);
  };
  
  const setMatchingFilter = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value !== 'all') params.set('matching', value);
    else params.delete('matching');
    setSearchParams(params);
  };

  // getGreeting removed - not needed for minimal hero design

  useEffect(() => {
    loadClients();
    if (viewMode === "hierarchy") {
      loadHierarchyData();
    }
  }, [viewMode]);
  
  const loadHierarchyData = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) return;

      // Load organizations, locations, and sublocations
      const { data: orgsData } = await supabase
        .from("client_organizations")
        .select("*")
        .order("name");
      
      const { data: locsData } = await supabase
        .from("client_locations")
        .select("*")
        .order("naam");
      
      const { data: sublocsData } = await supabase
        .from("client_sublocations")
        .select("*")
        .order("naam");

      setOrganizations(orgsData || []);
      setLocations(locsData || []);
      setSublocations(sublocsData || []);
    } catch (error: any) {
      console.error("Error loading hierarchy data:", error);
      toast.error("Kon hiërarchische data niet laden");
    }
  };
  
  const handleViewModeChange = (mode: "cards" | "hierarchy") => {
    setViewMode(mode);
    localStorage.setItem("klanten-view-mode", mode);
  };

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
    const matchesOrg = orgFilter === "all" || client.organizations?.name === orgFilter;
    
    // Matching filter
    const hasMatchingData = (client.regio && client.regio.length > 0) ||
                           (client.sector && client.sector.length > 0) ||
                           (client.doelgroep && client.doelgroep.length > 0) ||
                           (client.gezochte_functies && client.gezochte_functies.length > 0);
    const matchesMatchingFilter = matchingFilter === "all" || 
      (matchingFilter === "with" && hasMatchingData) ||
      (matchingFilter === "without" && !hasMatchingData);
    
    return matchesSearch && matchesOrg && matchesMatchingFilter;
  });

  // Group clients based on selected grouping
  const groupClients = (clients: Client[]) => {
    const getCompletenessScore = (client: Client) => {
      let score = 0;
      if (client.regio && client.regio.length > 0) score++;
      if (client.sector && client.sector.length > 0) score++;
      if (client.doelgroep && client.doelgroep.length > 0) score++;
      if (client.gezochte_functies && client.gezochte_functies.length > 0) score++;
      return score;
    };

    if (grouping === "bureau") {
      return {
        ABCzorg: clients.filter((c) => c.organizations?.name === "ABCzorg"),
        CitoZorg: clients.filter((c) => c.organizations?.name === "CitoZorg"),
      };
    }

    if (grouping === "sector") {
      const groups: Record<string, Client[]> = {};
      
      clients.forEach(client => {
        const primarySector = client.sector && client.sector.length > 0 
          ? client.sector[0] 
          : "Geen sector";
        
        if (!groups[primarySector]) {
          groups[primarySector] = [];
        }
        groups[primarySector].push(client);
      });
      
      return groups;
    }
    
    if (grouping === "matching") {
      return {
        Volledig: clients.filter((c) => getCompletenessScore(c) === 4),
        "Deels ingevuld": clients.filter((c) => {
          const score = getCompletenessScore(c);
          return score > 0 && score < 4;
        }),
        "Geen data": clients.filter((c) => getCompletenessScore(c) === 0),
      };
    }
    
    if (grouping === "regio") {
      const grouped: Record<string, Client[]> = {};
      clients.forEach((client) => {
        const region = client.regio?.[0] || "Onbekend";
        if (!grouped[region]) grouped[region] = [];
        grouped[region].push(client);
      });
      return grouped;
    }
    
    if (grouping === "alpha") {
      const grouped: Record<string, Client[]> = {};
      clients.forEach((client) => {
        const letter = client.company[0]?.toUpperCase() || "#";
        if (!grouped[letter]) grouped[letter] = [];
        grouped[letter].push(client);
      });
      return grouped;
    }

    return {};
  };

  const groupedClients = groupClients(filteredClients);

  // Save grouping preference to localStorage
  const handleGroupingChange = (newGrouping: "bureau" | "sector" | "matching" | "regio" | "alpha") => {
    setGrouping(newGrouping);
    localStorage.setItem("klanten-grouping", newGrouping);
  };

  // Save density preference to localStorage
  const handleDensityChange = (newDensity: "compact" | "comfortable" | "spacious") => {
    setDensity(newDensity);
    localStorage.setItem("klanten-density", newDensity);
  };

  // Grid class based on density
  const getGridClass = () => {
    if (density === "compact") return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
    if (density === "comfortable") return "grid-cols-1 lg:grid-cols-2";
    return "grid-cols-1";
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
  
  // Metric click handlers for filtering
  const handleMetricClick = (metric: 'total' | 'abczorg' | 'citozorg' | 'matching') => {
    if (metric === 'total') {
      setOrgFilter('all');
      setMatchingFilter('all');
    } else if (metric === 'abczorg') {
      setOrgFilter('ABCzorg');
    } else if (metric === 'citozorg') {
      setOrgFilter('CitoZorg');
    } else if (metric === 'matching') {
      setMatchingFilter('with');
      setGrouping('matching');
    }
  };
  
  const clearAllFilters = () => {
    setSearchParams(new URLSearchParams());
  };
  
  const hasActiveFilters = searchQuery || orgFilter !== 'all' || matchingFilter !== 'all';

  return (
    <div className="space-y-6">

            {/* Hero Section - Apple Design Minimal */}
            <div className="mb-8">
              <h1 className="text-2xl font-semibold">Klanten</h1>
              <p className="text-muted-foreground text-sm">
                {clients.length} klanten in je portfolio
              </p>
            </div>

            {/* View Toggle */}
            <div className="flex items-center gap-2 mb-6">
              <Button
                variant={viewMode === "cards" ? "default" : "outline"}
                size="sm"
                onClick={() => handleViewModeChange("cards")}
                className="gap-2"
              >
                <LayoutGrid className="h-4 w-4" />
                Kaarten
              </Button>
              <Button
                variant={viewMode === "hierarchy" ? "default" : "outline"}
                size="sm"
                onClick={() => handleViewModeChange("hierarchy")}
                className="gap-2"
              >
                <Network className="h-4 w-4" />
                Hiërarchie
              </Button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {viewMode === "cards" ? (
                <>
                  <KPICard
                    icon={Users}
                    title="Totaal"
                    value={clients.length}
                    subtitle="klanten"
                    variant="count"
                    onClick={() => handleMetricClick('total')}
                  />
                  <KPICard
                    icon={Building2}
                    title="ABCzorg"
                    value={abczorgCount}
                    subtitle="klanten"
                    variant="success"
                    onClick={() => handleMetricClick('abczorg')}
                  />
                  <KPICard
                    icon={Building2}
                    title="CitoZorg"
                    value={citozorgCount}
                    subtitle="klanten"
                    variant="time"
                    onClick={() => handleMetricClick('citozorg')}
                  />
                  <KPICard
                    icon={Target}
                    title="Met matchdata"
                    value={matchingPercentage}
                    subtitle="%"
                    variant="urgent"
                    onClick={() => handleMetricClick('matching')}
                  />
                </>
              ) : (
                <>
                  <KPICard
                    icon={Building2}
                    title="Organisaties"
                    value={organizations.length}
                    subtitle="klantorganisaties"
                    variant="count"
                  />
                  <KPICard
                    icon={Building2}
                    title="Hoofdlocaties"
                    value={locations.length}
                    subtitle="locaties"
                    variant="success"
                  />
                  <KPICard
                    icon={Target}
                    title="Sublocaties"
                    value={sublocations.length}
                    subtitle="werklocaties"
                    variant="time"
                  />
                  <KPICard
                    icon={Target}
                    title="Met tarieven"
                    value={0}
                    subtitle="sublocaties"
                    variant="urgent"
                  />
                </>
              )}
            </div>

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

              <Select value={orgFilter} onValueChange={setOrgFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Alle bureaus" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle bureaus</SelectItem>
                  <SelectItem value="ABCzorg">ABCzorg</SelectItem>
                  <SelectItem value="CitoZorg">CitoZorg</SelectItem>
                </SelectContent>
              </Select>

              <Select value={matchingFilter} onValueChange={setMatchingFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Alle klanten" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle klanten</SelectItem>
                  <SelectItem value="with">Met data</SelectItem>
                  <SelectItem value="without">Zonder data</SelectItem>
                </SelectContent>
              </Select>

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

            {/* Active Filter Chips */}
            {hasActiveFilters && (
              <div className="flex items-center gap-2 flex-wrap mt-4">
                <span className="text-xs text-muted-foreground">Actieve filters:</span>
                {searchQuery && (
                  <Badge variant="secondary" className="gap-2">
                    Zoekterm: {searchQuery}
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="hover:bg-muted-foreground/20 rounded-full p-0.5 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {orgFilter !== 'all' && (
                  <Badge variant="secondary" className="gap-2">
                    Bureau: {orgFilter}
                    <button 
                      onClick={() => setOrgFilter('all')}
                      className="hover:bg-muted-foreground/20 rounded-full p-0.5 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {matchingFilter !== 'all' && (
                  <Badge variant="secondary" className="gap-2">
                    Data: {matchingFilter === 'with' ? 'Met data' : 'Zonder data'}
                    <button 
                      onClick={() => setMatchingFilter('all')}
                      className="hover:bg-muted-foreground/20 rounded-full p-0.5 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearAllFilters}
                  className="h-7 px-3 text-xs"
                >
                  Wis filters
                </Button>
              </div>
            )}

            {/* Grouping Toggle & Collapse Controls - Only for Cards view */}
            {viewMode === "cards" && (
              <div className="mt-6 flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <ClientGroupingToggle value={grouping} onChange={handleGroupingChange} />
                  <DensityToggle value={density} onChange={handleDensityChange} />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAllExpanded(!allExpanded)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {allExpanded ? 'Alles inklappen' : 'Alles uitklappen'}
                </Button>
              </div>
            )}

            {/* Client grid or hierarchy view */}
            <div className="space-y-10 mt-8">
              {viewMode === "cards" ? (
                loading ? (
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
                    .map(([sectionName, sectionClients]) => (
                      <ClientSection
                        key={sectionName}
                        title={sectionName}
                        clients={sectionClients}
                        totalClients={filteredClients.length}
                        groupType={grouping}
                       onClientClick={(client) => {
                          setSelectedClient(client);
                        }}
                        searchQuery={searchQuery}
                        defaultOpen={allExpanded}
                        gridClass={getGridClass()}
                      />
                    ))
                )
              ) : (
                // Hierarchy View
                loading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="border rounded-lg p-4">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 rounded-full bg-muted animate-pulse" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 w-48 bg-muted animate-pulse rounded" />
                            <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : organizations.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                    <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">Nog geen klantorganisaties</p>
                    <p className="text-sm mt-2">
                      Hiërarchische structuur is nog leeg
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {organizations.map((org) => {
                      const orgLocations = locations.filter(l => l.client_org_id === org.id);
                      return (
                        <div key={org.id} className="border rounded-lg p-4 bg-card hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <Building2 className="h-6 w-6 text-primary" />
                            </div>
                            <div className="flex-1">
                              <h3 className="font-semibold text-base">{org.name}</h3>
                              <p className="text-sm text-muted-foreground">
                                {org.kvk_nummer ? `KVK: ${org.kvk_nummer}` : 'Geen KVK'} · {orgLocations.length} locatie{orgLocations.length !== 1 ? 's' : ''}
                              </p>
                            </div>
                            <Badge variant="secondary">
                              {sublocations.filter(s => orgLocations.some(l => l.id === s.location_id)).length} sublocaties
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}
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
    </div>
  );
}
