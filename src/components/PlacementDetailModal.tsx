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
  client_id: string;
  status: string;
  match_score: number | null;
  match_reasoning: any;
  created_at: string;
  updated_at: string;
  professionals: {
    full_name: string;
    functie_niveau: string;
    werkvorm: string | null;
    regio: string | null;
    telefoonnummer: string | null;
    email: string | null;
  };
  clients: {
    name: string;
    company: string;
    regio: string[];
    sector: string[];
  };
}

interface PlacementDetailModalProps {
  placement: Placement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange?: (placementId: string, newStatus: string) => void;
}

const getStatusVariant = (status: string) => {
  switch (status) {
    case "active": return "default";
    case "suggested": return "secondary";
    case "completed": return "outline";
    default: return "secondary";
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "active": return "Actief";
    case "suggested": return "Voorgesteld";
    case "completed": return "Afgerond";
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
    { status: "suggested", date: placement.created_at, label: "Voorgesteld" },
    { status: "active", date: placement.status === "active" || placement.status === "completed" ? placement.updated_at : null, label: "Geactiveerd" },
    { status: "completed", date: placement.status === "completed" ? placement.updated_at : null, label: "Afgerond" },
  ];

  const handleStatusChange = (newStatus: string) => {
    if (onStatusChange) {
      onStatusChange(placement.id, newStatus);
    }
  };

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
          {/* Professional & Client Side-by-Side */}
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
                    <p className="font-medium text-lg">{placement.professionals.full_name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-700 border-blue-200">
                        {placement.professionals.functie_niveau}
                      </Badge>
                      {placement.professionals.werkvorm && (
                        <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-700 border-emerald-200">
                          {placement.professionals.werkvorm}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {placement.professionals.regio && (
                    <p className="text-sm flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      {placement.professionals.regio}
                    </p>
                  )}

                  {placement.professionals.telefoonnummer && (
                    <p className="text-sm flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      {placement.professionals.telefoonnummer}
                    </p>
                  )}

                  {placement.professionals.email && (
                    <p className="text-sm flex items-center gap-2 text-muted-foreground truncate">
                      <Mail className="h-4 w-4" />
                      {placement.professionals.email}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Client Card */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="h-5 w-5 text-green-600" />
                  <h3 className="font-semibold">Klant</h3>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <p className="font-medium text-lg">{placement.clients.name}</p>
                    <p className="text-sm text-muted-foreground">{placement.clients.company}</p>
                  </div>

                  {placement.clients.regio && placement.clients.regio.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Regio's:</p>
                      <div className="flex flex-wrap gap-1">
                        {placement.clients.regio.map((r, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {placement.clients.sector && placement.clients.sector.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Sectoren:</p>
                      <div className="flex flex-wrap gap-1">
                        {placement.clients.sector.map((s, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs bg-purple-500/10 text-purple-700 border-purple-200">
                            {s}
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
          {placement.match_score !== null && placement.match_reasoning && (
            <>
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Award className="h-4 w-4" />
                  Match Score Analyse
                </h3>
                <MatchScoreBreakdown
                  breakdown={placement.match_reasoning}
                  totalScore={Math.round(placement.match_score * 100)}
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
              {placement.status === "suggested" && (
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
