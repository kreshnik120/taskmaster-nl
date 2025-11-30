import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building, MapPin, Phone, Mail, Euro, Users, Briefcase } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { getOrganizationName, getOrganizationBadgeColor } from "@/lib/organizationMapping";

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

interface HourlyRate {
  id: string;
  uursoort_naam: string;
  basis_tarief: number;
  btw_percentage: number;
  kostensoort: string;
}

interface SublocationDetailModalProps {
  sublocation: Sublocation | null;
  organizationName: string;
  locationName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// WTT schema voor tarieven berekening
const WTT_SCHEMA = [
  {
    dagtype: "Werkdag",
    tijdVan: "07:00",
    tijdTot: "23:00",
    wttPercentage: 0,
    label: "Dag (07:00-23:00)",
  },
  {
    dagtype: "Werkdag",
    tijdVan: "23:00",
    tijdTot: "07:00",
    wttPercentage: 20,
    label: "Nacht (23:00-07:00)",
  },
  {
    dagtype: "Weekend",
    tijdVan: "00:00",
    tijdTot: "24:00",
    wttPercentage: 20,
    label: "Weekend",
  },
  {
    dagtype: "Feestdag",
    tijdVan: "00:00",
    tijdTot: "24:00",
    wttPercentage: 20,
    label: "Feestdag",
  },
];

function calculateWTTRate(basisTarief: number, wttPercentage: number): number {
  return basisTarief * (1 + wttPercentage / 100);
}

function calculateFinalRate(wttRate: number): number {
  // BTW 0% + 20% werkgeversbijdrage
  return wttRate * 1.20;
}

export function SublocationDetailModal({
  sublocation,
  organizationName,
  locationName,
  open,
  onOpenChange,
}: SublocationDetailModalProps) {
  const { data: rates, isLoading: ratesLoading } = useQuery({
    queryKey: ["hourly-rates", sublocation?.id],
    queryFn: async () => {
      if (!sublocation?.id) return [];
      const { data, error } = await supabase
        .from("hourly_rates")
        .select("*")
        .eq("sublocation_id", sublocation.id)
        .eq("is_active", true)
        .order("uursoort_naam");
      
      if (error) throw error;
      return data as HourlyRate[];
    },
    enabled: !!sublocation?.id && open,
  });

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
                <div className="text-sm text-muted-foreground mt-1">
                  {organizationName} → {locationName} → {sublocation.naam}
                </div>
              </div>
            </div>
            <Badge variant="outline" className={bemiddelaarColor}>
              {bemiddelaar}
            </Badge>
          </div>
        </DialogHeader>

        <Tabs defaultValue="gegevens" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="gegevens">Gegevens</TabsTrigger>
            <TabsTrigger value="tarieven">
              Tarieven {rates && rates.length > 0 && `(${rates.length})`}
            </TabsTrigger>
            <TabsTrigger value="werk">Werkbeschrijving</TabsTrigger>
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

          <TabsContent value="tarieven" className="space-y-4">
            {ratesLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : rates && rates.length > 0 ? (
              rates.map((rate) => (
                <Card key={rate.id} className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <Euro className="h-5 w-5 text-green-600" />
                      {rate.uursoort_naam}
                    </h3>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Basistarief</p>
                      <p className="text-2xl font-bold text-green-600">
                        €{rate.basis_tarief.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-3 font-medium">Dagtype</th>
                          <th className="text-left p-3 font-medium">Tijd</th>
                          <th className="text-right p-3 font-medium">WTT%</th>
                          <th className="text-right p-3 font-medium">Met WTT</th>
                          <th className="text-right p-3 font-medium">Eindtarief</th>
                        </tr>
                      </thead>
                      <tbody>
                        {WTT_SCHEMA.map((schema, idx) => {
                          const wttRate = calculateWTTRate(rate.basis_tarief, schema.wttPercentage);
                          const finalRate = calculateFinalRate(wttRate);
                          
                          return (
                            <tr key={idx} className="border-t">
                              <td className="p-3">
                                <Badge variant="outline">{schema.label}</Badge>
                              </td>
                              <td className="p-3 text-muted-foreground">
                                {schema.tijdVan} - {schema.tijdTot}
                              </td>
                              <td className="p-3 text-right">
                                <Badge variant={schema.wttPercentage > 0 ? "default" : "secondary"}>
                                  {schema.wttPercentage}%
                                </Badge>
                              </td>
                              <td className="p-3 text-right font-medium">
                                €{wttRate.toFixed(2)}
                              </td>
                              <td className="p-3 text-right">
                                <span className="text-base font-bold text-green-600">
                                  €{finalRate.toFixed(2)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 text-xs text-muted-foreground">
                    <p>* Eindtarief = (Basistarief + WTT%) × 1.20 (werkgeversbijdrage)</p>
                    <p>* BTW: {rate.btw_percentage}% • Kostensoort: {rate.kostensoort}</p>
                  </div>
                </Card>
              ))
            ) : (
              <Card className="p-8 text-center">
                <Euro className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">
                  Geen tarieven gevonden voor deze sublocatie
                </p>
              </Card>
            )}
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
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
