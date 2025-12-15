import { AlertCircle, Phone, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { resolveApplicationName } from "@/lib/utils";

interface Application {
  id: string;
  pipeline_stage: string;
  updated_at: string;
  extracted_data?: {
    naam?: string;
    telefoonnummer?: string;
    regio?: string;
  };
}

interface UrgencyBannerProps {
  applications: Application[];
  onViewDetails?: () => void;
  onApplicationClick?: (application: Application) => void;
}

export function UrgencyBanner({ applications, onViewDetails, onApplicationClick }: UrgencyBannerProps) {
  const { toast } = useToast();

  // Count urgency items
  const screeningApps = applications.filter(app => 
    app.pipeline_stage === 'screening'
  );

  const interviewApps = applications.filter(app => 
    app.pipeline_stage === 'interview'
  );

  const staleApps = applications.filter(app => {
    const daysSinceUpdate = (Date.now() - new Date(app.updated_at).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate > 5 && app.pipeline_stage !== 'geplaatst';
  });

  const totalUrgent = screeningApps.length + interviewApps.length + staleApps.length;

  if (totalUrgent === 0) {
    return null;
  }

  // Get first urgent application for avatar
  const firstUrgentApp = interviewApps[0] || screeningApps[0] || staleApps[0];
  const candidateName = firstUrgentApp ? resolveApplicationName({ extracted_data: firstUrgentApp.extracted_data, email_from: '' }) : 'Onbekend';
  
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  const urgencyItems = [];
  if (interviewApps.length > 0) urgencyItems.push(`${interviewApps.length} interview${interviewApps.length > 1 ? 's' : ''} te plannen`);
  if (screeningApps.length > 0) urgencyItems.push(`${screeningApps.length} screening${screeningApps.length > 1 ? 's' : ''}`);
  if (staleApps.length > 0) urgencyItems.push(`${staleApps.length} inactieve kandidaten`);

  const handleCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    const phone = firstUrgentApp?.extracted_data?.telefoonnummer;
    if (phone) {
      toast({ title: "Bellen", description: `Bel ${candidateName} op ${phone}` });
    } else {
      toast({ title: "Geen telefoonnummer", description: "Voeg eerst een telefoonnummer toe", variant: "destructive" });
    }
  };

  const handleSchedule = (e: React.MouseEvent) => {
    e.stopPropagation();
    toast({ title: "Interview plannen", description: `Plan interview met ${candidateName}` });
  };

  const handleClick = () => {
    if (onApplicationClick && firstUrgentApp) {
      onApplicationClick(firstUrgentApp);
    } else if (onViewDetails) {
      onViewDetails();
    }
  };

  return (
    <div 
      className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-50/50 to-transparent rounded-lg border border-amber-100/50 cursor-pointer hover:bg-amber-50/70 hover:scale-[1.01] transition-all duration-200 group"
      onClick={handleClick}
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <Avatar className="h-8 w-8 border border-amber-200">
            <AvatarFallback className="bg-amber-100 text-amber-700 text-xs">
              {getInitials(candidateName)}
            </AvatarFallback>
          </Avatar>
          {staleApps.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-destructive rounded-full animate-pulse opacity-75" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <p className="text-sm text-foreground">
            {urgencyItems.join(' • ')}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-7 w-7 hover:bg-amber-100/50"
          onClick={handleCall}
          title="Bel kandidaat"
        >
          <Phone className="h-3.5 w-3.5" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-7 w-7 hover:bg-amber-100/50"
          onClick={handleSchedule}
          title="Plan interview"
        >
          <Calendar className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
