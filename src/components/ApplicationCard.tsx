import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { GripVertical } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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
  const completenessScore = application.completeness_score || 0;
  
  const getCompletenessColor = (score: number) => {
    if (score === 100) return "text-emerald-600";
    if (score >= 80) return "text-blue-600";
    return "text-amber-600";
  };
  
  const getCardBorder = (score: number) => {
    if (score === 100) return "border-l-2 border-l-emerald-400";
    return "";
  };
  
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

  // Get initials from candidate name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  // Generate consistent color based on name
  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-blue-100 text-blue-700',
      'bg-green-100 text-green-700',
      'bg-purple-100 text-purple-700',
      'bg-amber-100 text-amber-700',
      'bg-rose-100 text-rose-700',
      'bg-cyan-100 text-cyan-700',
    ];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`hover:scale-[1.01] hover:shadow-md active:scale-[0.99] transition-all duration-200 ease-out border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 ${getCardBorder(completenessScore)}`}
    >
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start gap-2">
          {/* Drag Handle - Only this part is draggable */}
          <div
            {...attributes}
            {...listeners}
            className="flex-shrink-0 pt-1 cursor-grab active:cursor-grabbing opacity-30 hover:opacity-60 transition-opacity"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>

          {/* Card Content - Clickable */}
          <div className="flex-1 min-w-0 space-y-2 cursor-pointer" onClick={onClick}>
            {/* Header: Avatar + Name + Completeness */}
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6 flex-shrink-0">
                <AvatarFallback className={`text-xs font-medium ${getAvatarColor(candidateName)}`}>
                  {getInitials(candidateName)}
                </AvatarFallback>
              </Avatar>
              <p className="text-sm font-medium text-foreground truncate flex-1">
                {candidateName}
              </p>
              <span className={`text-sm font-medium flex-shrink-0 ${getCompletenessColor(completenessScore)}`}>
                {completenessScore}%
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
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Skeleton loading component
export function ApplicationCardSkeleton() {
  return (
    <Card className="border-border/50">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start gap-2">
          <Skeleton className="h-4 w-4 mt-1" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-4 w-32 flex-1" />
              <Skeleton className="h-4 w-10" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-24" />
            <div className="flex justify-between pt-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-1.5 w-1.5 rounded-full" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
