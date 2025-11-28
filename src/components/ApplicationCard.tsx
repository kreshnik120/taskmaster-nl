import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";

interface Application {
  id: string;
  email_from: string;
  email_subject: string | null;
  pipeline_stage: string;
  status: string;
  completeness_score: number | null;
  created_at: string;
  updated_at: string | null;
  extracted_data?: {
    naam?: string;
    werkvorm?: string;
    functie_niveau?: string;
    assigned_organization?: string;
  } | null;
  professionals?: {
    full_name: string;
    functie_niveau: string;
  } | null;
}

interface ApplicationCardProps {
  application: Application;
  onClick: () => void;
}

export function ApplicationCard({ application, onClick }: ApplicationCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: application.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const candidateName = application.extracted_data?.naam || 'Onbekende kandidaat';
  const werkvorm = application.extracted_data?.werkvorm;
  const functieNiveau = application.extracted_data?.functie_niveau || application.professionals?.functie_niveau;
  const assignedOrg = application.extracted_data?.assigned_organization;
  
  const getDaysInStage = () => {
    const lastUpdate = new Date(application.updated_at || application.created_at);
    const now = new Date();
    const days = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };
  
  const daysInStage = getDaysInStage();
  
  const getStatusDotColor = () => {
    if (daysInStage < 2) return "bg-muted-foreground/30";
    if (daysInStage < 5) return "bg-muted-foreground/50";
    return "bg-destructive/60";
  };
  
  const getHumanizedTime = () => {
    if (daysInStage === 0) return "Vandaag";
    if (daysInStage === 1) return "Gisteren";
    if (daysInStage < 7) return `${daysInStage} dagen`;
    const weeks = Math.floor(daysInStage / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weken'}`;
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="hover:shadow-sm transition-shadow cursor-pointer border-border/50"
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-2" {...attributes} {...listeners}>
        {/* Header: Name + Completeness */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground truncate">
            {candidateName}
          </p>
          <span className={`text-sm font-medium ${
            application.completeness_score === 100 
              ? 'text-primary' 
              : 'text-muted-foreground'
          }`}>
            {application.completeness_score || 0}%
          </span>
        </div>

        {/* Email */}
        <p className="text-xs text-muted-foreground truncate">
          {application.email_from}
        </p>

        {/* Metadata row with bullets */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
          {functieNiveau && <span>{functieNiveau}</span>}
          {functieNiveau && werkvorm && <span>•</span>}
          {werkvorm && <span>{werkvorm}</span>}
          {assignedOrg && (functieNiveau || werkvorm) && <span>•</span>}
          {assignedOrg && <span>{assignedOrg}</span>}
        </div>

        {/* Time in stage */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            {getHumanizedTime()}
          </span>
          <div className={`h-1.5 w-1.5 rounded-full ${getStatusDotColor()}`} />
        </div>
      </CardContent>
    </Card>
  );
}
