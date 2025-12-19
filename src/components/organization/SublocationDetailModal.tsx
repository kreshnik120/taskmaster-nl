import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building, MapPin, Phone, Mail, Users, Briefcase, ChevronRight, GraduationCap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { getOrganizationName, getOrganizationBadgeColor } from "@/lib/organizationMapping";
import { SublocationMatchingPanel } from "./SublocationMatchingPanel";
import { VacanciesPanel } from "./VacanciesPanel";
import { ClientExpertPreferences } from "./ClientExpertPreferences";

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

interface SublocationDetailModalProps {
  sublocation: Sublocation | null;
  organizationName: string;
  locationName: string;
  organizationId?: string;
  locationId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigateToOrganization?: () => void;
  onNavigateToLocation?: () => void;
}

export function SublocationDetailModal({
  sublocation,
  organizationName,
  locationName,
  organizationId,
  locationId,
  open,
  onOpenChange,
  onNavigateToOrganization,
  onNavigateToLocation,
}: SublocationDetailModalProps) {
  if (!sublocation) return null;

  const bemiddelaar = getOrganizationName(sublocation.gekoppelde_bv_org_id);
  const bemiddelaarColor = getOrganizationBadgeColor(bemiddelaar);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1">
              <div className="p-3 bg-green-50 rounded-lg">
                <Building className="h-6 w-6 text-green-600" />
              </div>
              <div className="flex-1">
                <DialogTitle className="text-2xl">{sublocation.naam}</DialogTitle>
                {/* Breadcrumb navigation */}
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 hover:bg-transparent hover:text-foreground transition-colors font-normal"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigateToOrganization?.();
                    }}
                  >
                    {organizationName}
                  </Button>
                  <ChevronRight className="h-3 w-3" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 hover:bg-transparent hover:text-foreground transition-colors font-normal"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigateToLocation?.();
                    }}
                  >
                    {locationName}
                  </Button>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-foreground font-medium">
                    {sublocation.naam}
                  </span>
                </div>
              </div>
            </div>
            <Badge variant="outline" className={bemiddelaarColor}>
              {bemiddelaar}
            </Badge>
          </div>
        </DialogHeader>

        <Tabs defaultValue="gegevens" className="mt-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="gegevens">Gegevens</TabsTrigger>
            <TabsTrigger value="vacatures">Vacatures</TabsTrigger>
            <TabsTrigger value="werk">Werkbeschrijving</TabsTrigger>
            <TabsTrigger value="voorkeuren" className="flex items-center gap-1">
              <GraduationCap className="h-3 w-3" />
              Expert
            </TabsTrigger>
            <TabsTrigger value="plaatsingen">Plaatsingen</TabsTrigger>
          </TabsList>

          <TabsContent value="gegevens" className="space-y-4">
            <Card className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Locatie informatie
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Adres</p>
                  <p className="font-medium">{sublocation.adres || "Niet opgegeven"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Plaats</p>
                  <p className="font-medium">{sublocation.plaats || "Niet opgegeven"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Provincie</p>
                  <p className="font-medium">{sublocation.provincie || "Niet opgegeven"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Telefoon</p>
                  <p className="font-medium">{sublocation.telefoon || "Niet opgegeven"}</p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Doelgroep & Sector
              </h3>
              <div className="space-y-3 text-sm">
                {sublocation.doelgroep && sublocation.doelgroep.length > 0 && (
                  <div>
                    <p className="text-muted-foreground mb-1">Doelgroep</p>
                    <div className="flex flex-wrap gap-1">
                      {sublocation.doelgroep.map((dg) => (
                        <Badge key={dg} variant="secondary">{dg}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {sublocation.sector && sublocation.sector.length > 0 && (
                  <div>
                    <p className="text-muted-foreground mb-1">Sector</p>
                    <div className="flex flex-wrap gap-1">
                      {sublocation.sector.map((sec) => (
                        <Badge key={sec} variant="outline">{sec}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {sublocation.gezochte_functies && sublocation.gezochte_functies.length > 0 && (
                  <div>
                    <p className="text-muted-foreground mb-1">Gezochte functies</p>
                    <div className="flex flex-wrap gap-1">
                      {sublocation.gezochte_functies.map((func) => (
                        <Badge key={func} variant="default">{func}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {sublocation.capaciteit_min !== null && sublocation.capaciteit_max !== null && (
                  <div>
                    <p className="text-muted-foreground mb-1">Capaciteit</p>
                    <p className="font-medium">
                      {sublocation.capaciteit_min} - {sublocation.capaciteit_max} personen
                    </p>
                  </div>
                )}
                {sublocation.leeftijd_van !== null && sublocation.leeftijd_tot !== null && (
                  <div>
                    <p className="text-muted-foreground mb-1">Leeftijdscategorie</p>
                    <p className="font-medium">
                      {sublocation.leeftijd_van} - {sublocation.leeftijd_tot} jaar
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="vacatures" className="space-y-4">
            <VacanciesPanel
              sublocationId={sublocation.id}
              sublocationName={sublocation.naam}
              gezochte_functies={sublocation.gezochte_functies || []}
              sector={sublocation.sector || []}
              doelgroep={sublocation.doelgroep || []}
            />
          </TabsContent>

          <TabsContent value="werk" className="space-y-4">
            <Card className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Werkbeschrijving & Opmerkingen
              </h3>
              <div className="space-y-3 text-sm">
                {sublocation.doelgroep_omschrijving && (
                  <div>
                    <p className="text-muted-foreground mb-1">Doelgroep omschrijving</p>
                    <p className="whitespace-pre-wrap">{sublocation.doelgroep_omschrijving}</p>
                  </div>
                )}
                {sublocation.publieke_opmerking && (
                  <div>
                    <p className="text-muted-foreground mb-1">Publieke opmerking</p>
                    <p className="whitespace-pre-wrap">{sublocation.publieke_opmerking}</p>
                  </div>
                )}
                {!sublocation.doelgroep_omschrijving && !sublocation.publieke_opmerking && (
                  <p className="text-muted-foreground text-center py-4">
                    Geen werkbeschrijving beschikbaar
                  </p>
                )}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="voorkeuren">
            <ClientExpertPreferences 
              sublocationId={sublocation.id}
              sublocationName={sublocation.naam}
              publicDescription={sublocation.publieke_opmerking}
            />
          </TabsContent>

          <TabsContent value="plaatsingen">
            <SublocationMatchingPanel 
              sublocationId={sublocation.id}
              sublocationName={sublocation.naam}
              gezochte_functies={sublocation.gezochte_functies || []}
              sector={sublocation.sector || []}
              doelgroep={sublocation.doelgroep || []}
              plaats={sublocation.plaats || ''}
              provincie={sublocation.provincie}
              capaciteit_min={sublocation.capaciteit_min}
              capaciteit_max={sublocation.capaciteit_max}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
