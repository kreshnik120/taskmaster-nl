import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Application {
  id: string;
  pipeline_stage: string;
  updated_at: string;
  extracted_data?: {
    telefoonnummer?: string;
    regio?: string;
  };
}

interface UrgencyBannerProps {
  applications: Application[];
  onViewDetails?: () => void;
}

export function UrgencyBanner({ applications, onViewDetails }: UrgencyBannerProps) {
  // Count urgency items
  const screeningApps = applications.filter(app => 
    app.pipeline_stage === 'screening'
  ).length;

  const interviewApps = applications.filter(app => 
    app.pipeline_stage === 'interview'
  ).length;

  const staleApps = applications.filter(app => {
    const daysSinceUpdate = (Date.now() - new Date(app.updated_at).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate > 5 && app.pipeline_stage !== 'geplaatst';
  }).length;

  const totalUrgent = screeningApps + interviewApps + staleApps;

  if (totalUrgent === 0) {
    return null;
  }

  const urgencyItems = [];
  if (interviewApps > 0) urgencyItems.push(`${interviewApps} interview${interviewApps > 1 ? 's' : ''} te plannen`);
  if (screeningApps > 0) urgencyItems.push(`${screeningApps} screening${screeningApps > 1 ? 's' : ''}`);
  if (staleApps > 0) urgencyItems.push(`${staleApps} inactieve kandidaten`);

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-50/50 to-transparent rounded-lg border border-amber-100/50">
      <div className="flex items-center gap-3">
        <div className="relative">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          {staleApps > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-destructive rounded-full animate-pulse" />
          )}
        </div>
        <p className="text-sm text-foreground">
          {urgencyItems.join(' • ')}
        </p>
      </div>
      {onViewDetails && (
        <Button variant="ghost" size="sm" onClick={onViewDetails} className="text-sm hover:bg-amber-100/50 transition-colors">
          Bekijk →
        </Button>
      )}
    </div>
  );
}
