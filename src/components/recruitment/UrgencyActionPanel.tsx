import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, Clock, Users, CheckCircle, Phone, Calendar, Zap } from "lucide-react";
import { differenceInDays } from "date-fns";
import { useNavigate } from "react-router-dom";

interface Application {
  id: string;
  pipeline_stage: string;
  created_at: string;
  updated_at: string | null;
}

interface UrgencyActionPanelProps {
  applications: Application[];
}

export function UrgencyActionPanel({ applications }: UrgencyActionPanelProps) {
  const navigate = useNavigate();

  // Calculate stale applications (no activity for over 5 days)
  const staleApps = applications.filter(app => {
    const daysSinceUpdate = differenceInDays(new Date(), new Date(app.updated_at || app.created_at));
    return daysSinceUpdate > 5;
  });

  const screeningApps = applications.filter(app => app.pipeline_stage === 'screening');
  const interviewApps = applications.filter(app => app.pipeline_stage === 'interview');
  const approvedApps = applications.filter(app => app.pipeline_stage === 'goedgekeurd');

  const totalAlerts = staleApps.length + (screeningApps.length > 0 ? 1 : 0) + (interviewApps.length > 0 ? 1 : 0);

  return (
    <Card className="h-full">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertCircle className="h-5 w-5 text-orange-500" />
          Urgente Acties
          {totalAlerts > 0 && (
            <span className="ml-auto inline-flex items-center justify-center w-7 h-7 text-sm font-bold text-white bg-orange-500 rounded-full">
              {totalAlerts}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alerts Section */}
        <div className="space-y-3">
          {staleApps.length > 0 && (
            <div className="p-4 rounded-lg bg-destructive/10 border-2 border-destructive/30 space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-destructive mb-1">Inactieve sollicitaties</h4>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-bold text-lg text-destructive">{staleApps.length}</span> sollicitatie(s) zonder actie sinds meer dan 5 dagen
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {screeningApps.length > 0 && (
            <div className="p-4 rounded-lg bg-yellow-500/10 border-2 border-yellow-500/30 space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-yellow-600" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-yellow-700 mb-1">Screening vereist</h4>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-bold text-lg text-yellow-700">{screeningApps.length}</span> kandidaten wachten op eerste screening
                  </p>
                </div>
              </div>
            </div>
          )}

          {interviewApps.length > 0 && (
            <div className="p-4 rounded-lg bg-purple-500/10 border-2 border-purple-500/30 space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <Users className="h-5 w-5 text-purple-600" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-purple-700 mb-1">Interviews plannen</h4>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-bold text-lg text-purple-700">{interviewApps.length}</span> kandidaten klaar voor interview
                  </p>
                </div>
              </div>
            </div>
          )}

          {approvedApps.length > 0 && (
            <div className="p-4 rounded-lg bg-green-500/10 border-2 border-green-500/30 space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-green-700 mb-1">Klaar voor plaatsing</h4>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-bold text-lg text-green-700">{approvedApps.length}</span> goedgekeurde kandidaten
                  </p>
                </div>
              </div>
            </div>
          )}

          {totalAlerts === 0 && approvedApps.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
              <p className="font-medium">Geen urgente acties</p>
              <p className="text-sm mt-1">Alle sollicitaties lopen op schema</p>
            </div>
          )}
        </div>

        {/* Quick Actions Section */}
        {(screeningApps.length > 0 || interviewApps.length > 0 || approvedApps.length > 0) && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <Zap className="h-4 w-4 text-primary" />
                Snelle Acties
              </h4>
              <div className="grid grid-cols-1 gap-2">
                {screeningApps.length > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="justify-start h-auto py-3"
                    onClick={() => navigate('/sollicitaties?stage=screening')}
                  >
                    <Phone className="h-4 w-4 mr-2" />
                    <div className="text-left">
                      <div className="font-medium">Bekijk screening kandidaten</div>
                      <div className="text-xs text-muted-foreground">{screeningApps.length} kandidaten</div>
                    </div>
                  </Button>
                )}
                {interviewApps.length > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="justify-start h-auto py-3"
                    onClick={() => navigate('/sollicitaties?stage=interview')}
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    <div className="text-left">
                      <div className="font-medium">Plan interviews</div>
                      <div className="text-xs text-muted-foreground">{interviewApps.length} kandidaten</div>
                    </div>
                  </Button>
                )}
                {approvedApps.length > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="justify-start h-auto py-3"
                    onClick={() => navigate('/sollicitaties?stage=goedgekeurd')}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    <div className="text-left">
                      <div className="font-medium">Bekijk plaatsingsmogelijkheden</div>
                      <div className="text-xs text-muted-foreground">{approvedApps.length} kandidaten</div>
                    </div>
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
