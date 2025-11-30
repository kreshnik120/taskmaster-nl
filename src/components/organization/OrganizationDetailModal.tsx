import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
  Euro, 
  Users, 
  Briefcase,
  Calendar,
  Clock,
  TrendingUp
} from "lucide-react";
import { LocationCard } from "./LocationCard";
import { SublocationCard } from "./SublocationCard";

interface Organization {
  id: string;
  name: string;
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
  sublocations: Sublocation[];
}

interface Sublocation {
  id: string;
  naam: string;
  plaats: string | null;
  doelgroep: string[] | null;
  sector: string[] | null;
  gekoppelde_bv_org_id: string | null;
  hourly_rates_count?: number;
  telefoon?: string | null;
  adres?: string | null;
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

const ORG_NAMES: Record<string, string> = {
  "550e8400-e29b-41d4-a716-446655440000": "ABCzorg",
  "7c9e6679-7425-40de-944b-e07fc1f90ae7": "CitoZorg",
};

export function OrganizationDetailModal({
  organization,
  open,
  onOpenChange,
}: OrganizationDetailModalProps) {
  const [activeTab, setActiveTab] = useState("algemeen");

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

  // Bereken statistieken
  const stats = {
    totalLocations: organization?.locations?.length || 0,
    totalSublocations: organization?.locations?.reduce((sum, loc) => sum + (loc.sublocations?.length || 0), 0) || 0,
    totalRates: organization?.locations?.reduce((sum, loc) => 
      sum + (loc.sublocations?.reduce((subSum, sub) => subSum + (sub.hourly_rates_count || 0), 0) || 0), 0) || 0,
    activeAssignments: assignments?.filter(a => a.status === 'active')?.length || 0,
    proposedAssignments: assignments?.filter(a => a.status === 'proposed')?.length || 0,
  };

  // Count per bureau
  const abczorgCount = organization?.locations?.reduce((sum, loc) => 
    sum + (loc.sublocations?.filter(sub => sub.gekoppelde_bv_org_id === "550e8400-e29b-41d4-a716-446655440000")?.length || 0), 0) || 0;
  const citozorgCount = organization?.locations?.reduce((sum, loc) => 
    sum + (loc.sublocations?.filter(sub => sub.gekoppelde_bv_org_id === "7c9e6679-7425-40de-944b-e07fc1f90ae7")?.length || 0), 0) || 0;

  if (!organization) return null;

  return (
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
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="algemeen">Algemeen</TabsTrigger>
            <TabsTrigger value="locaties">Locaties ({stats.totalLocations})</TabsTrigger>
            <TabsTrigger value="sublocaties">Sublocaties ({stats.totalSublocations})</TabsTrigger>
            <TabsTrigger value="opdrachten">
              Opdrachten ({stats.activeAssignments})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="algemeen" className="space-y-4">
            {/* Overzicht KPI's */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
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

              <Card>
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

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Euro className="h-4 w-4 text-amber-600" />
                    Tarieven
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalRates}</div>
                </CardContent>
              </Card>

              <Card>
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

            {/* Organisatie details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Organisatiegegevens</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {organization.centrale_facturatie_email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Centrale facturatie:</span>
                    <span className="font-medium">{organization.centrale_facturatie_email}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Gekoppelde bureaus */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Gekoppelde bemiddelingsbureaus</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">ABCzorg</div>
                      <div className="text-sm text-muted-foreground">
                        {abczorgCount} {abczorgCount === 1 ? 'sublocatie' : 'sublocaties'}
                      </div>
                    </div>
                    <Badge variant="outline" className="border-blue-300 text-blue-700">
                      ABCzorg
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">CitoZorg</div>
                      <div className="text-sm text-muted-foreground">
                        {citozorgCount} {citozorgCount === 1 ? 'sublocatie' : 'sublocaties'}
                      </div>
                    </div>
                    <Badge variant="outline" className="border-green-300 text-green-700">
                      CitoZorg
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="locaties" className="space-y-3">
            {organization.locations.map((location) => (
              <LocationCard
                key={location.id}
                location={location}
                organizationName={organization.name}
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
                />
              ))
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
                        <Card key={assignment.id} className="border-l-4 border-l-green-400">
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
                        <Card key={assignment.id} className="border-l-4 border-l-amber-400">
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
  );
}
