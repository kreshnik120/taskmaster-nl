import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Building, Mail, Phone } from "lucide-react";
import { SublocationCard } from "./SublocationCard";

interface Sublocation {
  id: string;
  naam: string;
  plaats: string | null;
  provincie?: string | null;
  doelgroep: string[] | null;
  doelgroep_omschrijving?: string | null;
  sector: string[] | null;
  gezochte_functies?: string[] | null;
  gekoppelde_bv_org_id: string | null;
  telefoon?: string | null;
  adres?: string | null;
  capaciteit_min?: number | null;
  capaciteit_max?: number | null;
  leeftijd_van?: number | null;
  leeftijd_tot?: number | null;
  publieke_opmerking?: string | null;
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
  sublocations?: Sublocation[];
}

interface LocationDetailModalProps {
  location: Location | null;
  organizationName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSublocationClick?: (sublocation: Sublocation) => void;
  onNavigateToOrganization?: () => void;
}

export function LocationDetailModal({
  location,
  organizationName,
  open,
  onOpenChange,
  onSublocationClick,
  onNavigateToOrganization,
}: LocationDetailModalProps) {
  if (!location) return null;

  const sublocationsCount = location.sublocations?.length || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-50 rounded-lg">
              <MapPin className="h-6 w-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-2xl">{location.naam}</DialogTitle>
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
                <span className="text-foreground">→</span>
                <span className="text-foreground font-medium">
                  {location.naam}
                </span>
              </div>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="gegevens" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="gegevens">Gegevens</TabsTrigger>
            <TabsTrigger value="sublocaties">
              Sublocaties ({sublocationsCount})
            </TabsTrigger>
            <TabsTrigger value="factuur">Factuur</TabsTrigger>
          </TabsList>

          <TabsContent value="gegevens" className="space-y-4">
            <Card className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Building className="h-4 w-4" />
                Locatie informatie
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Adres</p>
                  <p className="font-medium">
                    {location.adres || "Niet opgegeven"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Plaats</p>
                  <p className="font-medium">
                    {location.plaats || "Niet opgegeven"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Provincie</p>
                  <p className="font-medium">
                    {location.provincie || "Niet opgegeven"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Telefoon</p>
                  <p className="font-medium">
                    {location.telefoon || "Niet opgegeven"}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Contactpersoon
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Naam</p>
                  <p className="font-medium">
                    {location.contactpersoon_naam || "Niet opgegeven"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p className="font-medium">
                    {location.contactpersoon_email || "Niet opgegeven"}
                  </p>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="sublocaties" className="space-y-3">
            {location.sublocations && location.sublocations.length > 0 ? (
              location.sublocations.map((sublocation) => (
                <SublocationCard
                  key={sublocation.id}
                  sublocation={sublocation}
                  organizationName={organizationName}
                  locationName={location.naam}
                  onSublocationClick={(sub) => onSublocationClick?.(sub)}
                />
              ))
            ) : (
              <Card className="p-8 text-center">
                <Building className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">
                  Geen sublocaties gevonden voor deze locatie
                </p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="factuur" className="space-y-4">
            <Card className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Factuur gegevens
              </h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Factuur email</p>
                  <p className="font-medium">
                    {location.factuur_email || "Niet opgegeven"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Crediteuren t.a.v.</p>
                  <p className="font-medium">
                    {location.crediteuren_tav || "Niet opgegeven"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">UBL ingeschakeld</p>
                  <Badge variant={location.ubl_enabled ? "default" : "secondary"}>
                    {location.ubl_enabled ? "Ja" : "Nee"}
                  </Badge>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
