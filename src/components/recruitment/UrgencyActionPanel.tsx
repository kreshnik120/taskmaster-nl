import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Mail, Calendar, CheckCircle2 } from "lucide-react";

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
  // Calculate time in current stage
  const getStaleApplications = () => {
    const now = new Date();
    return applications.filter(app => {
      const lastUpdate = new Date(app.updated_at || app.created_at);
      const daysDiff = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));
      return daysDiff > 5 && app.pipeline_stage !== 'geplaatst';
    });
  };

  const staleApps = getStaleApplications();
  const screeningApps = applications.filter(a => a.pipeline_stage === 'screening');
  const interviewApps = applications.filter(a => a.pipeline_stage === 'interview');
  const approvedApps = applications.filter(a => a.pipeline_stage === 'goedgekeurd');

  const alerts = [
    {
      id: 'stale',
      severity: 'high',
      icon: AlertTriangle,
      title: `${staleApps.length} sollicitaties > 5 dagen zonder actie`,
      visible: staleApps.length > 0,
      color: 'text-red-600 bg-red-500/10'
    },
    {
      id: 'screening',
      severity: 'medium',
      icon: Mail,
      title: `${screeningApps.length} kandidaten wachten op screening`,
      visible: screeningApps.length > 0,
      color: 'text-orange-600 bg-orange-500/10'
    }
  ].filter(alert => alert.visible);

  const quickActions = [
    {
      id: 'screening-emails',
      label: `Verstuur screening emails (${screeningApps.length})`,
      count: screeningApps.length,
      icon: Mail,
      variant: 'outline' as const,
      visible: screeningApps.length > 0
    },
    {
      id: 'plan-interviews',
      label: `Plan interviews (${interviewApps.length})`,
      count: interviewApps.length,
      icon: Calendar,
      variant: 'outline' as const,
      visible: interviewApps.length > 0
    },
    {
      id: 'review-approved',
      label: `Review goedgekeurde kandidaten (${approvedApps.length})`,
      count: approvedApps.length,
      icon: CheckCircle2,
      variant: 'outline' as const,
      visible: approvedApps.length > 0
    }
  ].filter(action => action.visible);

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          Urgente Acties
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alerts */}
        {alerts.length > 0 ? (
          <div className="space-y-2">
            {alerts.map(alert => (
              <div
                key={alert.id}
                className={`flex items-start gap-3 p-3 rounded-lg border ${alert.color}`}
              >
                <alert.icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span className="text-sm font-medium">{alert.title}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">Geen urgente acties</span>
          </div>
        )}

        {/* Quick Actions */}
        {quickActions.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Snelle Acties
            </div>
            {quickActions.map(action => (
              <Button
                key={action.id}
                variant={action.variant}
                size="sm"
                className="w-full justify-start gap-2"
              >
                <action.icon className="h-4 w-4" />
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
