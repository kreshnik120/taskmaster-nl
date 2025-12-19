import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Building, 
  MapPin, 
  Globe, 
  Mail, 
  Users, 
  Briefcase,
  Calendar,
  Clock,
  TrendingUp,
  Phone,
  User,
  ImagePlus,
  FileText,
  Target,
  Activity,
  Sparkles
} from "lucide-react";
import { LocationCard } from "./LocationCard";
import { SublocationCard } from "./SublocationCard";
import { LocationDetailModal } from "./LocationDetailModal";
import { SublocationDetailModal } from "./SublocationDetailModal";
import { LogoUpload } from "./LogoUpload";
import { getOrganizationName, getOrganizationBadgeColor } from "@/lib/organizationMapping";

interface Organization {
  id: string;
  name: string;
  org_id: string;
  kvk_nummer: string | null;
  logo_url: string | null;
  website: string | null;
  centrale_facturatie_email: string | null;
  locations: Location[];
}

interface Location {
  id: string;
  naam: string;
  plaats: string | null;
  provincie: string | null;
  adres: string | null;
  telefoon: string | null;
  contactpersoon_naam: string | null;
  contactpersoon_email: string | null;
  factuur_email: string | null;
  crediteuren_tav: string | null;
  ubl_enabled: boolean;
  sublocations: Sublocation[];
}

interface Sublocation {
  id: string;
  naam: string;
  plaats: string | null;
  provincie: string | null;
  adres: string | null;
  telefoon: string | null;
  doelgroep: string[] | null;
  doelgroep_omschrijving: string | null;
  sector: string[] | null;
  gezochte_functies: string[] | null;
  gekoppelde_bv_org_id: string | null;
  publieke_opmerking: string | null;
  capaciteit_min: number | null;
  capaciteit_max: number | null;
  leeftijd_van: number | null;
  leeftijd_tot: number | null;
}

interface Assignment {
  id: string;
  professional_name: string;
  sublocation_name: string;
  sublocation_plaats: string | null;
  start_date: string;
  end_date: string | null;
  weekly_hours: number;
  status: string;
  bemiddelingsbureau: string;
  ai_match_score: number | null;
}

interface OrganizationDetailModalProps {
  organization: Organization | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrganizationDetailModal({
  organization,
  open,
  onOpenChange,
}: OrganizationDetailModalProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("algemeen");
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [selectedSublocation, setSelectedSublocation] = useState<Sublocation | null>(null);
  const [isSublocationModalOpen, setIsSublocationModalOpen] = useState(false);
  const [currentLogoUrl, setCurrentLogoUrl] = useState<string | null>(organization?.logo_url || null);

  const handleLocationClick = (location: Location) => {
    setSelectedLocation(location);
    setIsLocationModalOpen(true);
  };

  const handleSublocationClick = (sublocation: Sublocation) => {
    setSelectedSublocation(sublocation);
    setIsSublocationModalOpen(true);
  };

  // Query assignments voor deze organisatie
  const { data: assignments, isLoading: assignmentsLoading } = useQuery({
    queryKey: ["organization-assignments", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      const { data, error } = await supabase
        .from("assignment_details")
        .select("*")
        .eq("organization_name", organization.name)
        .order("start_date", { ascending: false });

      if (error) throw error;
      return data as Assignment[];
    },
    enabled: !!organization?.id && open,
  });

  // Helper: check if description contains garbage patterns
  const isGarbageDescription = (desc: string | undefined | null): boolean => {
    if (!desc) return true;
    if (desc.includes('](http')) return true;  // Markdown links
    if (desc.includes('](https')) return true;
    if (/naar.*navigatie/i.test(desc)) return true;
    if (/naar.*inhoud/i.test(desc)) return true;
    if (/naar.*menu/i.test(desc)) return true;
    if (/cookie/i.test(desc)) return true;
    if (/\]\s*\[/.test(desc)) return true;  // Multiple markdown patterns
    if (/\]\s*\(/.test(desc)) return true;  // Broken markdown
    if (desc.length < 50) return true;
    return false;
  };

  // Query AI knowledge base voor organisatie beschrijving (zoek op org_enrichment_{id})
  const { data: orgKnowledge, isLoading: knowledgeLoading } = useQuery({
    queryKey: ["organization-knowledge", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return null;
      
      const { data, error } = await supabase
        .from("ai_knowledge_base")
        .select("key, value, category, confidence_score")
        .eq("key", `org_enrichment_${organization.id}`)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;
      
      // Data zit direct in value als JSON object
      const enrichmentData = data?.value as {
        description?: string;
        detected_sectors?: string[];
        extracted_emails?: string[];
        extracted_phones?: string[];
        enriched_at?: string;
      } | null;

      return { 
        enrichment: enrichmentData,
        raw: data,
      };
    },
    enabled: !!organization?.id && open,
  });

  // Clean description - return null if garbage
  const cleanDescription = useMemo(() => {
    const desc = orgKnowledge?.enrichment?.description;
    if (isGarbageDescription(desc)) return null;
    return desc;
  }, [orgKnowledge?.enrichment?.description]);

  // Aggregeer doelgroepen en sectoren uit sublocaties
  const aggregatedData = useMemo(() => {
    if (!organization?.locations) return { doelgroepen: {}, sectoren: {}, totalLocations: 0 };
    
    const doelgroepen: Record<string, number> = {};
    const sectoren: Record<string, number> = {};
    let totalWithDoelgroep = 0;
    
    organization.locations.forEach(location => {
      location.sublocations?.forEach(sub => {
        // Aggregeer doelgroepen
        sub.doelgroep?.forEach(dg => {
          if (dg) {
            doelgroepen[dg] = (doelgroepen[dg] || 0) + 1;
            totalWithDoelgroep++;
          }
        });
        
        // Aggregeer sectoren
        sub.sector?.forEach(s => {
          if (s) {
            sectoren[s] = (sectoren[s] || 0) + 1;
          }
        });
      });
    });
    
    return { 
      doelgroepen, 
      sectoren, 
      totalWithDoelgroep,
      hasDoelgroepen: Object.keys(doelgroepen).length > 0,
      hasSectoren: Object.keys(sectoren).length > 0
    };
  }, [organization?.locations]);

  // Bereken statistieken
  const stats = {
    totalLocations: organization?.locations?.length || 0,
    totalSublocations: organization?.locations?.reduce((sum, loc) => sum + (loc.sublocations?.length || 0), 0) || 0,
    activeAssignments: assignments?.filter(a => a.status === 'active')?.length || 0,
    proposedAssignments: assignments?.filter(a => a.status === 'proposed')?.length || 0,
  };

  // Verzamel contactpersonen uit locaties (inclusief factuur_email en crediteuren_tav)
  const contacts = organization?.locations?.filter(loc => 
    loc.contactpersoon_naam || loc.contactpersoon_email || loc.factuur_email || loc.crediteuren_tav
  ).map(loc => ({
    naam: loc.contactpersoon_naam,
    email: loc.contactpersoon_email,
    telefoon: loc.telefoon,
    locatie: loc.naam,
    factuur_email: loc.factuur_email,
    crediteuren_tav: loc.crediteuren_tav,
  })) || [];

  // Bureau bepalen op basis van organization.org_id (niet gekoppelde_bv_org_id)
  const bureauName = getOrganizationName(organization?.org_id || null);

  // Kleuren voor doelgroep badges
  const getDoelgroepColor = (doelgroep: string) => {
    const colors: Record<string, string> = {
      'LVB': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      'MVB': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
      'EVB': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      'NAH': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
      'GGZ': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
      'Autisme': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
      'Psychiatrie': 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
      'Gedragsproblematiek': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
      'Ouderen': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
      'Jeugd': 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
    };
    return colors[doelgroep] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  };

  const getSectorColor = (sector: string) => {
    const colors: Record<string, string> = {
      'GHZ': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      'GGZ': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
      'VVT': 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
      'Jeugdzorg': 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
      'Ziekenhuis': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    };
    return colors[sector] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  };

  if (!organization) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start gap-4">
              {organization.logo_url && (
                <img
                  src={organization.logo_url}
                  alt={organization.name}
                  className="h-12 w-12 rounded-lg object-cover"
                />
              )}
              <div className="flex-1">
                <DialogTitle className="text-2xl">{organization.name}</DialogTitle>
                <div className="flex items-center gap-2 mt-2">
                  {organization.kvk_nummer && (
                    <Badge variant="outline" className="text-xs">
                      KVK: {organization.kvk_nummer}
                    </Badge>
                  )}
                  {/* Bureau badge gebaseerd op organization.org_id */}
                  {bureauName !== "Niet toegewezen" && (
                    <Badge variant="outline" className={getOrganizationBadgeColor(bureauName)}>
                      {bureauName}
                    </Badge>
                  )}
                  {organization.website && (
                    <a
                      href={organization.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                    >
                      <Globe className="h-3 w-3" />
                      Website
                    </a>
                  )}
                </div>
              </div>
            </div>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="algemeen">Algemeen</TabsTrigger>
              <TabsTrigger value="locaties">Locaties ({stats.totalLocations})</TabsTrigger>
              <TabsTrigger value="sublocaties">Sublocaties ({stats.totalSublocations})</TabsTrigger>
              <TabsTrigger value="contacten">
                Contacten ({contacts.length})
              </TabsTrigger>
              <TabsTrigger value="opdrachten">
                Opdrachten ({stats.activeAssignments})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="algemeen" className="space-y-4">
              {/* Overzicht KPI's - Premium gradient style */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Card className="border-t-4 border-t-blue-400/60 bg-gradient-to-br from-blue-50/80 to-white/60 dark:from-blue-950/30 dark:to-background hover:shadow-md transition-shadow backdrop-blur-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Building className="h-4 w-4 text-blue-600" />
                      Locaties
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.totalLocations}</div>
                  </CardContent>
                </Card>

                <Card className="border-t-4 border-t-green-400/60 bg-gradient-to-br from-green-50/80 to-white/60 dark:from-green-950/30 dark:to-background hover:shadow-md transition-shadow backdrop-blur-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-green-600" />
                      Sublocaties
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.totalSublocations}</div>
                  </CardContent>
                </Card>

                <Card className="border-t-4 border-t-purple-400/60 bg-gradient-to-br from-purple-50/80 to-white/60 dark:from-purple-950/30 dark:to-background hover:shadow-md transition-shadow backdrop-blur-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-purple-600" />
                      Actieve opdrachten
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.activeAssignments}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Logo Upload Sectie */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ImagePlus className="h-4 w-4" />
                    Organisatie Logo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <LogoUpload
                    organizationId={organization.id}
                    organizationName={organization.name}
                    currentLogoUrl={currentLogoUrl}
                    onLogoUpdate={(newUrl) => {
                      setCurrentLogoUrl(newUrl);
                      // Invalidate queries to refresh data
                      queryClient.invalidateQueries({ queryKey: ["organizations"] });
                    }}
                  />
                </CardContent>
              </Card>

              {/* Organisatie Profiel Sectie */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Doelgroepen Samenvatting */}
                <Card className="border-l-4 border-l-cyan-400">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Target className="h-4 w-4 text-cyan-600" />
                      Doelgroepen
                      {aggregatedData.hasDoelgroepen && (
                        <Badge variant="secondary" className="ml-auto text-xs">
                          {Object.keys(aggregatedData.doelgroepen).length} types
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {aggregatedData.hasDoelgroepen ? (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(aggregatedData.doelgroepen)
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 10)
                          .map(([doelgroep, count]) => (
                            <Badge 
                              key={doelgroep} 
                              className={`${getDoelgroepColor(doelgroep)} font-medium`}
                            >
                              {doelgroep}
                              <span className="ml-1 opacity-70">({count})</span>
                            </Badge>
                          ))}
                        {Object.keys(aggregatedData.doelgroepen).length > 10 && (
                          <Badge variant="outline" className="text-xs">
                            +{Object.keys(aggregatedData.doelgroepen).length - 10} meer
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Geen doelgroepen geconfigureerd in sublocaties
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Sectoren */}
                <Card className="border-l-4 border-l-emerald-400">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="h-4 w-4 text-emerald-600" />
                      Sectoren
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {aggregatedData.hasSectoren ? (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(aggregatedData.sectoren)
                          .sort(([, a], [, b]) => b - a)
                          .map(([sector, count]) => (
                            <Badge 
                              key={sector} 
                              className={`${getSectorColor(sector)} font-medium`}
                            >
                              {sector}
                              <span className="ml-1 opacity-70">({count})</span>
                            </Badge>
                          ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Geen sectoren geconfigureerd in sublocaties
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* AI Beschrijving (indien beschikbaar) */}
              {knowledgeLoading ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Over deze organisatie
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-16 w-full" />
                  </CardContent>
                </Card>
              ) : cleanDescription ? (
                <Card className="border-l-4 border-l-violet-400">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-violet-600" />
                      Over deze organisatie
                      <Badge variant="outline" className="ml-auto text-xs bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                        AI verrijkt
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {cleanDescription}
                    </p>
                    {orgKnowledge?.enrichment?.enriched_at && (
                      <p className="text-xs text-muted-foreground/60 mt-2">
                        Laatst verrijkt: {new Date(orgKnowledge.enrichment.enriched_at).toLocaleDateString('nl-NL')}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ) : null}

              {/* Organisatie details - alleen tonen als er data is */}
              {organization.centrale_facturatie_email && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Organisatiegegevens</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Centrale facturatie:</span>
                      <span className="font-medium">{organization.centrale_facturatie_email}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Gekoppeld bureau - gebaseerd op organization.org_id */}
              {bureauName !== "Niet toegewezen" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Bemiddelingsbureau</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 px-4 py-2 border rounded-lg w-fit">
                      <Badge variant="outline" className={getOrganizationBadgeColor(bureauName)}>
                        {bureauName}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        • {stats.totalSublocations} {stats.totalSublocations === 1 ? 'sublocatie' : 'sublocaties'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* Geen werklocaties melding - gebaseerd op stats.totalSublocations */}
              {stats.totalSublocations === 0 && (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <Building className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Nog geen werklocaties geconfigureerd</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="locaties" className="space-y-3">
              {organization.locations.map((location) => (
                <LocationCard
                  key={location.id}
                  location={location}
                  organizationName={organization.name}
                  onLocationClick={handleLocationClick}
                  onSublocationClick={handleSublocationClick}
                />
              ))}
            </TabsContent>

            <TabsContent value="sublocaties" className="space-y-3">
              {organization.locations.map((location) =>
                location.sublocations.map((sublocation) => (
                  <SublocationCard
                    key={sublocation.id}
                    sublocation={sublocation}
                    organizationName={organization.name}
                    locationName={location.naam}
                    onSublocationClick={handleSublocationClick}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="contacten" className="space-y-3">
              {contacts.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <User className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Nog geen contactpersonen toegevoegd</p>
                    <p className="text-xs mt-1">Voeg contactpersonen toe via de locatie-instellingen</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {contacts.map((contact, index) => (
                    <Card key={index} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <User className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="font-medium truncate">
                              {contact.naam || "Geen naam"}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {contact.locatie}
                            </div>
                            {contact.email && (
                              <a 
                                href={`mailto:${contact.email}`}
                                className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                              >
                                <Mail className="h-3 w-3" />
                                <span className="truncate">{contact.email}</span>
                              </a>
                            )}
                            {contact.telefoon && (
                              <a 
                                href={`tel:${contact.telefoon}`}
                                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
                              >
                                <Phone className="h-3 w-3" />
                                <span>{contact.telefoon}</span>
                              </a>
                            )}
                            {contact.factuur_email && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1 border-t mt-2">
                                <Mail className="h-3 w-3" />
                                <span>Factuur: {contact.factuur_email}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="opdrachten" className="space-y-4">
              {assignmentsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : !assignments || assignments.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <Briefcase className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Nog geen opdrachten voor deze organisatie</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Actieve opdrachten */}
                  {assignments.filter(a => a.status === 'active').length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-green-600" />
                        Actieve opdrachten ({assignments.filter(a => a.status === 'active').length})
                      </h3>
                      <div className="space-y-2">
                        {assignments.filter(a => a.status === 'active').map((assignment) => (
                          <Card key={assignment.id} className="border-l-4 border-l-green-400 hover:shadow-md transition-shadow">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                  <div className="font-medium">{assignment.professional_name}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {assignment.sublocation_name}
                                    {assignment.sublocation_plaats && ` • ${assignment.sublocation_plaats}`}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Calendar className="h-3 w-3" />
                                    {new Date(assignment.start_date).toLocaleDateString('nl-NL')}
                                    {assignment.end_date && ` - ${new Date(assignment.end_date).toLocaleDateString('nl-NL')}`}
                                    <span>•</span>
                                    <Clock className="h-3 w-3" />
                                    {assignment.weekly_hours} uur/week
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className={
                                      assignment.bemiddelingsbureau === "ABCzorg"
                                        ? "border-blue-300 text-blue-700"
                                        : "border-green-300 text-green-700"
                                    }
                                  >
                                    {assignment.bemiddelingsbureau}
                                  </Badge>
                                  {assignment.ai_match_score && (
                                    <Badge variant="secondary">
                                      {Math.round(assignment.ai_match_score)}% match
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Voorgestelde opdrachten */}
                  {assignments.filter(a => a.status === 'proposed').length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                        <Users className="h-5 w-5 text-amber-600" />
                        Voorgestelde opdrachten ({assignments.filter(a => a.status === 'proposed').length})
                      </h3>
                      <div className="space-y-2">
                        {assignments.filter(a => a.status === 'proposed').map((assignment) => (
                          <Card key={assignment.id} className="border-l-4 border-l-amber-400 hover:shadow-md transition-shadow">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                  <div className="font-medium">{assignment.professional_name}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {assignment.sublocation_name}
                                    {assignment.sublocation_plaats && ` • ${assignment.sublocation_plaats}`}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Calendar className="h-3 w-3" />
                                    Start: {new Date(assignment.start_date).toLocaleDateString('nl-NL')}
                                    <span>•</span>
                                    <Clock className="h-3 w-3" />
                                    {assignment.weekly_hours} uur/week
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {assignment.ai_match_score && (
                                    <Badge variant="secondary">
                                      {Math.round(assignment.ai_match_score)}% match
                                    </Badge>
                                  )}
                                  <Button size="sm" variant="outline">
                                    Beoordeel
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <LocationDetailModal
        location={selectedLocation}
        organizationName={organization?.name || ""}
        open={isLocationModalOpen}
        onOpenChange={setIsLocationModalOpen}
        onSublocationClick={handleSublocationClick}
      />

      <SublocationDetailModal
        sublocation={selectedSublocation}
        organizationName={organization?.name || ""}
        locationName={selectedLocation?.naam || ""}
        open={isSublocationModalOpen}
        onOpenChange={setIsSublocationModalOpen}
      />
    </>
  );
}
