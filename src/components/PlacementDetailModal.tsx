import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { 
  User, Building2, Calendar, TrendingUp, CheckCircle2, 
  Clock, Phone, Mail, MapPin, Award, Briefcase
} from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { MatchScoreBreakdown } from "./recruitment/MatchScoreBreakdown";

interface Placement {
  id: string;
  professional_id: string;
  sublocation_id: string;
  status: string;
  werkvorm: string | null;
  plaatsing_type: string | null;
  start_date: string | null;
  end_date: string | null;
  weekly_hours: number | null;
  ai_match_score: number | null;
  ai_match_reasoning: any;
  created_at: string;
  updated_at: string;
  professionals: {
    id: string;
    full_name: string;
    functie_niveau: string;
    werkvorm: string | null;
    regio: string | null;
    telefoonnummer: string | null;
    email: string | null;
  } | null;
  client_sublocations: {
    id: string;
    naam: string;
    plaats: string | null;
    doelgroep: string[] | null;
    sector: string[] | null;
    client_locations: {
      id: string;
      naam: string;
      client_organizations: {
        id: string;
        name: string;
      } | null;
    } | null;
  } | null;
}

interface PlacementDetailModalProps {
  placement: Placement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange?: (placementId: string, newStatus: string) => void;
}

const WERKVORM_LABELS: Record<string, string> = {
  ZZP: "ZZP",
  Uitzendkracht: "Uitzendkracht",
  "ABCito constructie": "ABCito constructie"
};

const PLAATSING_TYPE_LABELS: Record<string, string> = {
  periode_opdracht: "Periode opdracht",
  langdurig: "Langdurige plaatsing",
  flexibel: "Flexibele inzet"
};

const getStatusVariant = (status: string) => {
  switch (status) {
    case "active": return "default";
    case "draft": return "secondary";
    case "completed": return "outline";
    default: return "secondary";
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "active": return "Actief";
    case "draft": return "Concept";
    case "completed": return "Afgerond";
    case "cancelled": return "Geannuleerd";
    default: return status;
  }
};

export function PlacementDetailModal({ 
  placement, 
  open, 
  onOpenChange,
  onStatusChange 
}: PlacementDetailModalProps) {
  if (!placement) return null;

  const statusHistory = [
    { status: "draft", date: placement.created_at, label: "Aangemaakt" },
    { status: "active", date: placement.status === "active" || placement.status === "completed" ? placement.updated_at : null, label: "Geactiveerd" },
    { status: "completed", date: placement.status === "completed" ? placement.updated_at : null, label: "Afgerond" },
  ];

  const handleStatusChange = (newStatus: string) => {
    if (onStatusChange) {
      onStatusChange(placement.id, newStatus);
    }
  };

  const sublocation = placement.client_sublocations;
  const location = sublocation?.client_locations;
  const organization = location?.client_organizations;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Plaatsing Details
            </span>
            <Badge variant={getStatusVariant(placement.status)}>
              {getStatusLabel(placement.status)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Werkvorm & Plaatsing Type Info */}
          <div className="flex items-center gap-3 flex-wrap">
            {placement.werkvorm && (
              <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-800">
                {WERKVORM_LABELS[placement.werkvorm] || placement.werkvorm}
              </Badge>
            )}
            {placement.plaatsing_type && (
              <Badge className="bg-blue-500/10 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-800">
                {PLAATSING_TYPE_LABELS[placement.plaatsing_type] || placement.plaatsing_type}
              </Badge>
            )}
            {placement.weekly_hours && (
              <Badge variant="outline">
                {placement.weekly_hours} uur/week
              </Badge>
            )}
          </div>

          {/* Periode Info */}
          {(placement.start_date || placement.end_date) && (
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Periode:</span>
                  {placement.start_date && (
                    <span>{format(new Date(placement.start_date), "d MMMM yyyy", { locale: nl })}</span>
                  )}
                  {placement.end_date && (
                    <>
                      <span className="text-muted-foreground">→</span>
                      <span>{format(new Date(placement.end_date), "d MMMM yyyy", { locale: nl })}</span>
                    </>
                  )}
                  {!placement.end_date && placement.start_date && (
                    <span className="text-muted-foreground">(doorlopend)</span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Professional & Werklocatie Side-by-Side */}
          <div className="grid grid-cols-2 gap-4">
            {/* Professional Card */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <User className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Professional</h3>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <p className="font-medium text-lg">{placement.professionals?.full_name || "Onbekend"}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {placement.professionals?.functie_niveau && (
                        <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-800">
                          {placement.professionals.functie_niveau}
                        </Badge>
                      )}
                      {placement.professionals?.werkvorm && (
                        <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-800">
                          {placement.professionals.werkvorm}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {placement.professionals?.regio && (
                    <p className="text-sm flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      {placement.professionals.regio}
                    </p>
                  )}

                  {placement.professionals?.telefoonnummer && (
                    <p className="text-sm flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      {placement.professionals.telefoonnummer}
                    </p>
                  )}

                  {placement.professionals?.email && (
                    <p className="text-sm flex items-center gap-2 text-muted-foreground truncate">
                      <Mail className="h-4 w-4" />
                      {placement.professionals.email}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Werklocatie Card */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="h-5 w-5 text-green-600" />
                  <h3 className="font-semibold">Werklocatie</h3>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <p className="font-medium text-lg">{sublocation?.naam || "Onbekend"}</p>
                    {sublocation?.plaats && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {sublocation.plaats}
                      </p>
                    )}
                  </div>

                  {/* Locatie hiërarchie */}
                  {(location || organization) && (
                    <div className="text-sm text-muted-foreground">
                      {location?.naam && <span>{location.naam}</span>}
                      {organization?.name && (
                        <span className="font-medium"> ({organization.name})</span>
                      )}
                    </div>
                  )}

                  {sublocation?.sector && sublocation.sector.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Sectoren:</p>
                      <div className="flex flex-wrap gap-1">
                        {sublocation.sector.map((s, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs bg-purple-500/10 text-purple-700 border-purple-200 dark:bg-purple-500/20 dark:text-purple-400 dark:border-purple-800">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {sublocation?.doelgroep && sublocation.doelgroep.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Doelgroepen:</p>
                      <div className="flex flex-wrap gap-1">
                        {sublocation.doelgroep.map((d, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {d}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Separator />

          {/* Match Score Breakdown */}
          {placement.ai_match_score !== null && placement.ai_match_reasoning && (
            <>
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Award className="h-4 w-4" />
                  Match Score Analyse
                </h3>
                <MatchScoreBreakdown
                  breakdown={placement.ai_match_reasoning}
                  totalScore={Math.round(placement.ai_match_score)}
                />
              </div>
              <Separator />
            </>
          )}

          {/* Status Timeline */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Status Tijdlijn
            </h3>
            <div className="relative space-y-4 pl-6">
              {/* Vertical line */}
              <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
              
              {statusHistory.map((item, idx) => (
                <div key={idx} className="relative">
                  {/* Dot */}
                  <div className={`absolute left-[-23px] top-1 w-3 h-3 rounded-full border-2 ${
                    item.date 
                      ? "bg-primary border-primary" 
                      : "bg-background border-muted-foreground"
                  }`} />
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-sm font-medium ${item.date ? "" : "text-muted-foreground"}`}>
                        {item.label}
                      </p>
                      {item.date && (
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(item.date), "d MMM yyyy, HH:mm", { locale: nl })}
                        </p>
                      )}
                    </div>
                    {item.date && (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Quick Actions */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Acties</h3>
            <div className="flex gap-2">
              {placement.status === "draft" && (
                <Button onClick={() => handleStatusChange("active")}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Activeer Plaatsing
                </Button>
              )}
              {placement.status === "active" && (
                <Button variant="outline" onClick={() => handleStatusChange("completed")}>
                  <Calendar className="h-4 w-4 mr-2" />
                  Rond Af
                </Button>
              )}
              <Button variant="ghost">
                <Briefcase className="h-4 w-4 mr-2" />
                Bekijk Taken
              </Button>
            </div>
          </div>

          {/* Metadata */}
          <div className="text-sm text-muted-foreground flex items-center gap-4">
            <div>
              <span className="font-medium">Aangemaakt:</span>{" "}
              {format(new Date(placement.created_at), "d MMM yyyy, HH:mm", { locale: nl })}
            </div>
            <div>
              <span className="font-medium">Laatst bijgewerkt:</span>{" "}
              {format(new Date(placement.updated_at), "d MMM yyyy, HH:mm", { locale: nl })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
