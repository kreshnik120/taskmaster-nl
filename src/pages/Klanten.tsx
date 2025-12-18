import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Plus, Search, X, Users, Building2, Target, LayoutGrid, Network, FileSpreadsheet, Image, Loader2, Flame } from "lucide-react";
import { toast } from "sonner";
import NewClientDialog from "@/components/NewClientDialog";
import { KPICard } from "@/components/ui/kpi-card";
import { OrganizationCardSimple, OrganizationCardSimpleSkeleton } from "@/components/organization/OrganizationCardSimple";
import { ClientGroupingToggle } from "@/components/recruitment/ClientGroupingToggle";
import { DensityToggle } from "@/components/recruitment/DensityToggle";
import { OrganizationSection } from "@/components/recruitment/OrganizationSection";
import { OrganizationCard } from "@/components/organization/OrganizationCard";
import { OrganizationDetailModal } from "@/components/organization/OrganizationDetailModal";
import { LocationDetailModal } from "@/components/organization/LocationDetailModal";
import { SublocationDetailModal } from "@/components/organization/SublocationDetailModal";
import { ABCzorgExcelImport } from "@/components/AITraining/ABCzorgExcelImport";
import { AdminOnly } from "@/components/auth/AdminOnly";
import { firecrawlApi } from "@/lib/api/firecrawl";

// Unified Organization type used in both views
interface Sublocation {
  id: string;
  naam: string;
  sector?: string[] | null;
  doelgroep?: string[] | null;
  gezochte_functies?: string[] | null;
  plaats?: string | null;
  publieke_opmerking?: string | null;
  hourly_rates_count?: number;
  tarieven_min?: number;
  tarieven_max?: number;
}

interface Location {
  id: string;
  naam: string;
  plaats?: string | null;
  telefoon?: string | null;
  contactpersoon_email?: string | null;
  sublocations?: Sublocation[];
}

interface Organization {
  id: string;
  name: string;
  org_id: string;
  kvk_nummer?: string | null;
  logo_url?: string | null;
  website?: string | null;
  centrale_facturatie_email?: string | null;
  locations?: Location[];
  bureau?: string; // ABCzorg or CitoZorg (derived from org_id)
}

// Bureau mapping
const BUREAU_IDS: Record<string, string> = {
  '550e8400-e29b-41d4-a716-446655440000': 'ABCzorg',
  '650e8400-e29b-41d4-a716-446655440001': 'CitoZorg',
};

export default function Klanten() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [selectedSublocation, setSelectedSublocation] = useState<Sublocation | null>(null);
  const [isSublocationModalOpen, setIsSublocationModalOpen] = useState(false);
  const [isFetchingLogos, setIsFetchingLogos] = useState(false);
  const [isEnrichingOrgs, setIsEnrichingOrgs] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "hierarchy">(() => {
    const saved = localStorage.getItem("klanten-view-mode");
    return (saved as any) || "cards";
  });
  const [grouping, setGrouping] = useState<"bureau" | "sector" | "matching" | "regio" | "alpha">(() => {
    const saved = localStorage.getItem("klanten-grouping");
    // Default to bureau if matching was selected (doesn't apply to organizations)
    const value = saved as any;
    if (value === "matching") return "bureau";
    return value || "bureau";
  });
  const [density, setDensity] = useState<"compact" | "comfortable" | "spacious">(() => {
    const saved = localStorage.getItem("klanten-density");
    return (saved as any) || "compact";
  });
  const [allExpanded, setAllExpanded] = useState(true);
  
  // Logo fetch handler
  const handleFetchLogos = async () => {
    setIsFetchingLogos(true);
    try {
      toast.info("Logo's ophalen gestart - dit kan enkele minuten duren...");
      
      const { data, error } = await supabase.functions.invoke("fetch-organization-logos", {
        body: { fetchAll: false, includeNameLookup: true } // Fetch for orgs without logos, try name-based lookup
      });
      
      if (error) throw error;
      
      if (data) {
        toast.success(`Logo's opgehaald: ${data.success} geslaagd, ${data.failed} mislukt, ${data.skipped} overgeslagen`);
        // Reload organizations to show new logos
        loadOrganizations();
      }
    } catch (error: any) {
      console.error("Error fetching logos:", error);
      toast.error(`Fout bij ophalen logo's: ${error.message}`);
    } finally {
      setIsFetchingLogos(false);
    }
  };
  
  // Firecrawl enrich handler
  const handleFirecrawlEnrich = async () => {
    // Get organizations with websites but missing data
    const orgsToEnrich = organizations.filter(org => 
      org.website && (!org.centrale_facturatie_email || !org.logo_url)
    );
    
    if (orgsToEnrich.length === 0) {
      toast.info("Alle organisaties met websites zijn al verrijkt");
      return;
    }
    
    setIsEnrichingOrgs(true);
    toast.info(`Verrijken van ${orgsToEnrich.length} organisaties gestart...`);
    
    try {
      const result = await firecrawlApi.batchEnrich(
        orgsToEnrich.map(o => o.id),
        {
          updateDatabase: true,
          onProgress: (current, total) => {
            if (current % 5 === 0 || current === total) {
              console.log(`Firecrawl progress: ${current}/${total}`);
            }
          }
        }
      );
      
      toast.success(`Verrijking voltooid: ${result.success} geslaagd, ${result.failed} mislukt`);
      loadOrganizations(); // Refresh data
    } catch (error: any) {
      console.error("Error enriching organizations:", error);
      toast.error(`Fout bij verrijken: ${error.message}`);
    } finally {
      setIsEnrichingOrgs(false);
    }
  };
  
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Sync filters with URL
  const searchQuery = searchParams.get('search') || '';
  const bureauFilter = searchParams.get('bureau') || 'all';
  const sectorFilter = searchParams.get('sector') || 'all';
  
  const setSearchQuery = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set('search', value);
    else params.delete('search');
    setSearchParams(params);
  };
  
  const setBureauFilter = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value !== 'all') params.set('bureau', value);
    else params.delete('bureau');
    setSearchParams(params);
  };

  const setSectorFilter = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value !== 'all') params.set('sector', value);
    else params.delete('sector');
    setSearchParams(params);
  };

  // Location click handler
  const handleLocationClick = (location: Location, organization?: Organization) => {
    setSelectedLocation(location);
    if (organization) {
      setSelectedOrganization(organization);
    }
    setIsLocationModalOpen(true);
  };

  // Sublocation click handler
  const handleSublocationClick = (sublocation: Sublocation, location?: Location, organization?: Organization) => {
    setSelectedSublocation(sublocation);
    if (location) {
      setSelectedLocation(location);
    }
    if (organization) {
      setSelectedOrganization(organization);
    }
    setIsSublocationModalOpen(true);
  };

  useEffect(() => {
    loadOrganizations();
  }, []);
  
  const loadOrganizations = async () => {
    try {
      setLoading(true);
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        navigate("/auth");
        return;
      }

      // Load organizations with locations and sublocations
      const { data: orgsData, error: orgsError } = await supabase
        .from("client_organizations")
        .select("*")
        .order("name");
      
      if (orgsError) throw orgsError;

      const { data: locsData } = await supabase
        .from("client_locations")
        .select("*")
        .order("naam");
      
      const { data: sublocsData } = await supabase
        .from("client_sublocations")
        .select(`
          *,
          hourly_rates(
            id,
            basis_tarief
          )
        `)
        .order("naam");

      // Build hierarchy structure with tariff calculations and bureau mapping
      const orgsWithHierarchy: Organization[] = orgsData?.map(org => {
        const orgLocations = locsData?.filter(loc => loc.client_org_id === org.id).map(loc => {
          const locationSubs = sublocsData?.filter(sub => sub.location_id === loc.id) || [];
          return {
            ...loc,
            sublocations: locationSubs.map(sub => {
              const rates = (sub.hourly_rates || []) as any[];
              const tarieven = rates.map(r => r.basis_tarief).filter(t => t != null);
              return {
                ...sub,
                hourly_rates_count: rates.length,
                tarieven_min: tarieven.length > 0 ? Math.min(...tarieven) : undefined,
                tarieven_max: tarieven.length > 0 ? Math.max(...tarieven) : undefined,
              };
            })
          };
        }) || [];

        return {
          ...org,
          locations: orgLocations,
          bureau: BUREAU_IDS[org.org_id] || 'Onbekend'
        };
      }) || [];

      setOrganizations(orgsWithHierarchy);
    } catch (error: any) {
      console.error("Error loading organizations:", error);
      toast.error("Kon organisaties niet laden");
    } finally {
      setLoading(false);
    }
  };
  
  const handleViewModeChange = (mode: "cards" | "hierarchy") => {
    setViewMode(mode);
    localStorage.setItem("klanten-view-mode", mode);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === "Escape" && searchQuery) {
          setSearchQuery("");
          e.preventDefault();
        }
        return;
      }

      if (e.key === "n" || e.key === "N") {
        setNewClientOpen(true);
        e.preventDefault();
      }

      if (e.key === "/") {
        document.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
        e.preventDefault();
      }

      if (e.key === "Escape") {
        if (isOrgModalOpen) {
          setIsOrgModalOpen(false);
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
  }, [searchQuery, isOrgModalOpen, newClientOpen]);

  // Get all unique sectors from organizations
  const allSectors = new Set<string>();
  organizations.forEach(org => {
    org.locations?.forEach(loc => {
      loc.sublocations?.forEach(sub => {
        sub.sector?.forEach(s => allSectors.add(s));
      });
    });
  });

  // Filter organizations
  const filteredOrganizations = organizations.filter(org => {
    // Search filter
    const matchesSearch = org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.locations?.some(loc => 
        loc.naam.toLowerCase().includes(searchQuery.toLowerCase()) ||
        loc.sublocations?.some(sub => sub.naam.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    
    // Bureau filter
    const matchesBureau = bureauFilter === "all" || org.bureau === bureauFilter;
    
    // Sector filter
    const orgSectors = new Set<string>();
    org.locations?.forEach(loc => {
      loc.sublocations?.forEach(sub => {
        sub.sector?.forEach(s => orgSectors.add(s));
      });
    });
    const matchesSector = sectorFilter === "all" || orgSectors.has(sectorFilter);
    
    return matchesSearch && matchesBureau && matchesSector;
  });

  // Group organizations based on selected grouping
  const groupOrganizations = (orgs: Organization[]) => {
    if (grouping === "bureau") {
      return {
        ABCzorg: orgs.filter(o => o.bureau === "ABCzorg"),
        CitoZorg: orgs.filter(o => o.bureau === "CitoZorg"),
      };
    }

    if (grouping === "sector") {
      const groups: Record<string, Organization[]> = {};
      
      orgs.forEach(org => {
        const orgSectors = new Set<string>();
        org.locations?.forEach(loc => {
          loc.sublocations?.forEach(sub => {
            sub.sector?.forEach(s => orgSectors.add(s));
          });
        });
        
        const primarySector = Array.from(orgSectors)[0] || "Geen sector";
        
        if (!groups[primarySector]) {
          groups[primarySector] = [];
        }
        groups[primarySector].push(org);
      });
      
      return groups;
    }
    
    if (grouping === "regio") {
      const grouped: Record<string, Organization[]> = {};
      orgs.forEach(org => {
        const primaryRegion = org.locations?.find(l => l.plaats)?.plaats ||
          org.locations?.flatMap(l => l.sublocations || []).find(s => s.plaats)?.plaats ||
          "Onbekend";
        if (!grouped[primaryRegion]) grouped[primaryRegion] = [];
        grouped[primaryRegion].push(org);
      });
      return grouped;
    }
    
    if (grouping === "alpha") {
      const grouped: Record<string, Organization[]> = {};
      orgs.forEach(org => {
        // Skip common prefixes like "Stichting"
        const cleanName = org.name.replace(/^(Stichting|De|Het)\s+/i, '');
        const letter = cleanName[0]?.toUpperCase() || "#";
        if (!grouped[letter]) grouped[letter] = [];
        grouped[letter].push(org);
      });
      return grouped;
    }

    return {};
  };

  const groupedOrganizations = groupOrganizations(filteredOrganizations);

  // Save preferences to localStorage
  const handleGroupingChange = (newGrouping: "bureau" | "sector" | "matching" | "regio" | "alpha") => {
    // Skip "matching" as it doesn't apply to organizations
    if (newGrouping === "matching") return;
    setGrouping(newGrouping);
    localStorage.setItem("klanten-grouping", newGrouping);
  };

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

  // Stats
  const abczorgCount = organizations.filter(o => o.bureau === "ABCzorg").length;
  const citozorgCount = organizations.filter(o => o.bureau === "CitoZorg").length;
  const totalSublocations = organizations.reduce((acc, org) => 
    acc + (org.locations?.reduce((locAcc, loc) => locAcc + (loc.sublocations?.length || 0), 0) || 0), 0
  );
  const orgsWithSublocations = organizations.filter(org => 
    (org.locations?.reduce((acc, loc) => acc + (loc.sublocations?.length || 0), 0) || 0) > 0
  ).length;
  const dataPercentage = organizations.length > 0 ? Math.round((orgsWithSublocations / organizations.length) * 100) : 0;

  const handleOrganizationClick = (org: Organization) => {
    setSelectedOrganization(org);
    setIsOrgModalOpen(true);
  };
  
  // Metric click handlers for filtering
  const handleMetricClick = (metric: 'total' | 'abczorg' | 'citozorg' | 'sublocations') => {
    if (metric === 'total') {
      setBureauFilter('all');
      setSectorFilter('all');
    } else if (metric === 'abczorg') {
      setBureauFilter('ABCzorg');
    } else if (metric === 'citozorg') {
      setBureauFilter('CitoZorg');
    }
  };
  
  const clearAllFilters = () => {
    setSearchParams(new URLSearchParams());
  };
  
  const hasActiveFilters = searchQuery || bureauFilter !== 'all' || sectorFilter !== 'all';

  return (
    <div className="space-y-6">
      {/* Hero Section - Apple Design Minimal */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Klanten</h1>
        <p className="text-muted-foreground text-sm">
          {organizations.length} organisaties • {totalSublocations} werklocaties
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

      {/* KPI Cards - Same for both views now */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          icon={Users}
          title="Organisaties"
          value={organizations.length}
          subtitle="totaal"
          variant="count"
          onClick={() => handleMetricClick('total')}
        />
        <KPICard
          icon={Building2}
          title="ABCzorg"
          value={abczorgCount}
          subtitle="organisaties"
          variant="success"
          onClick={() => handleMetricClick('abczorg')}
        />
        <KPICard
          icon={Building2}
          title="CitoZorg"
          value={citozorgCount}
          subtitle="organisaties"
          variant="time"
          onClick={() => handleMetricClick('citozorg')}
        />
        <KPICard
          icon={Target}
          title="Werklocaties"
          value={totalSublocations}
          subtitle="sublocaties"
          variant="urgent"
          onClick={() => handleMetricClick('sublocations')}
        />
      </div>

      {/* Search and Filter Bar */}
      <div className="flex gap-3 flex-wrap items-center mt-8">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Zoek organisatie, locatie of werklocatie..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-12"
          />
          <kbd className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
            /
          </kbd>
        </div>

        <Select value={bureauFilter} onValueChange={setBureauFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Alle bureaus" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle bureaus</SelectItem>
            <SelectItem value="ABCzorg">ABCzorg</SelectItem>
            <SelectItem value="CitoZorg">CitoZorg</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sectorFilter} onValueChange={setSectorFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Alle sectoren" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle sectoren</SelectItem>
            {Array.from(allSectors).sort().map(sector => (
              <SelectItem key={sector} value={sector}>{sector}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button 
          onClick={() => setNewClientOpen(true)}
          className="shrink-0"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nieuwe organisatie
          <kbd className="ml-2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-background/20 bg-background/20 px-1.5 font-mono text-[10px] font-medium opacity-100">
            N
          </kbd>
        </Button>

        <AdminOnly>
          <Button 
            variant="outline" 
            className="shrink-0"
            onClick={handleFetchLogos}
            disabled={isFetchingLogos}
          >
            {isFetchingLogos ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Image className="h-4 w-4 mr-2" />
            )}
            {isFetchingLogos ? "Ophalen..." : "Logo's ophalen"}
          </Button>
          <Button 
            variant="outline" 
            className="shrink-0"
            onClick={handleFirecrawlEnrich}
            disabled={isEnrichingOrgs}
          >
            {isEnrichingOrgs ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Flame className="h-4 w-4 mr-2" />
            )}
            {isEnrichingOrgs ? "Verrijken..." : "Verrijk met Firecrawl"}
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="shrink-0">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel Import
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[400px] sm:w-[540px]">
              <ABCzorgExcelImport />
            </SheetContent>
          </Sheet>
        </AdminOnly>
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
          {bureauFilter !== 'all' && (
            <Badge variant="secondary" className="gap-2">
              Bureau: {bureauFilter}
              <button 
                onClick={() => setBureauFilter('all')}
                className="hover:bg-muted-foreground/20 rounded-full p-0.5 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {sectorFilter !== 'all' && (
            <Badge variant="secondary" className="gap-2">
              Sector: {sectorFilter}
              <button 
                onClick={() => setSectorFilter('all')}
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
            <ClientGroupingToggle 
              value={grouping} 
              onChange={handleGroupingChange}
            />
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

      {/* Organization grid or hierarchy view */}
      <div className="space-y-10 mt-8">
        {viewMode === "cards" ? (
          loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <OrganizationCardSimpleSkeleton key={i} />
              ))}
            </div>
          ) : filteredOrganizations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery ? "Geen organisaties gevonden" : "Nog geen organisaties"}
            </div>
          ) : (
            Object.entries(groupedOrganizations)
              .sort(([, a], [, b]) => b.length - a.length)
              .map(([sectionName, sectionOrgs]) => (
                <OrganizationSection
                  key={sectionName}
                  title={sectionName}
                  organizations={sectionOrgs}
                  totalOrganizations={filteredOrganizations.length}
                  groupType={grouping}
                  onOrganizationClick={handleOrganizationClick}
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
          ) : filteredOrganizations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Geen organisaties gevonden</p>
              <p className="text-sm mt-2">
                {searchQuery ? "Probeer een andere zoekterm" : "Nog geen klantorganisaties"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrganizations.map((org) => (
                <OrganizationCard
                  key={org.id}
                  organization={org as any}
                  onOrganizationClick={(clickedOrg) => {
                    setSelectedOrganization(clickedOrg as any);
                    setIsOrgModalOpen(true);
                  }}
                  onLocationClick={(location) => handleLocationClick(location as any, org)}
                  onSublocationClick={(sublocation) => {
                    const location = org.locations?.find((loc: any) => 
                      loc.sublocations?.some((sub: any) => sub.id === sublocation.id)
                    );
                    handleSublocationClick(sublocation as any, location, org);
                  }}
                />
              ))}
            </div>
          )
        )}
      </div>

      <NewClientDialog
        open={newClientOpen}
        onOpenChange={setNewClientOpen}
        onClientCreated={loadOrganizations}
      />
      
      <OrganizationDetailModal
        organization={selectedOrganization as any}
        open={isOrgModalOpen}
        onOpenChange={setIsOrgModalOpen}
      />
      
      <LocationDetailModal
        location={selectedLocation as any}
        organizationName={selectedOrganization?.name || ""}
        open={isLocationModalOpen}
        onOpenChange={setIsLocationModalOpen}
        onSublocationClick={(sub) => handleSublocationClick(sub as any)}
        onNavigateToOrganization={() => {
          setIsLocationModalOpen(false);
          setIsOrgModalOpen(true);
        }}
      />
      
      <SublocationDetailModal
        sublocation={selectedSublocation as any}
        organizationName={selectedOrganization?.name || ""}
        locationName={selectedLocation?.naam || ""}
        organizationId={selectedOrganization?.id}
        locationId={selectedLocation?.id}
        open={isSublocationModalOpen}
        onOpenChange={setIsSublocationModalOpen}
        onNavigateToOrganization={() => {
          setIsSublocationModalOpen(false);
          setIsOrgModalOpen(true);
        }}
        onNavigateToLocation={() => {
          setIsSublocationModalOpen(false);
          setIsLocationModalOpen(true);
        }}
      />
    </div>
  );
}
