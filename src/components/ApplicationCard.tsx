import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GripVertical, User, FileText, Calendar } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface Application {
  id: string;
  email_from: string;
  email_subject: string | null;
  pipeline_stage: string;
  status: string;
  completeness_score: number | null;
  created_at: string;
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

  const getCompletenessColor = (score: number | null) => {
    if (!score) return "bg-gray-500";
    if (score >= 80) return "bg-green-500";
    if (score >= 50) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      nieuw: "Nieuw",
      in_behandeling: "In behandeling",
      wacht_op_info: "Wacht op info",
      compleet: "Compleet",
      afgerond: "Afgerond",
    };
    return labels[status] || status;
  };

  const candidateName = application.extracted_data?.naam || 'Onbekende kandidaat';
  const werkvorm = application.extracted_data?.werkvorm;
  const functieNiveau = application.extracted_data?.functie_niveau || application.professionals?.functie_niveau;

  const getWerkvormColor = (werkvorm: string | undefined) => {
    if (!werkvorm) return "bg-gray-100 text-gray-700";
    if (werkvorm.toLowerCase().includes('zzp')) return "bg-blue-100 text-blue-700";
    if (werkvorm.toLowerCase().includes('uitzend')) return "bg-purple-100 text-purple-700";
    if (werkvorm.toLowerCase().includes('abcito')) return "bg-green-100 text-green-700";
    return "bg-gray-100 text-gray-700";
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        {/* Drag Handle */}
        <div 
          {...attributes} 
          {...listeners}
          className="flex items-center justify-center cursor-grab active:cursor-grabbing -mx-4 -mt-4 mb-2 px-4 pt-3 pb-2 border-b"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Kandidaat Naam */}
        <div className="flex items-start gap-2">
          <User className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{candidateName}</p>
            <p className="text-xs text-muted-foreground truncate">{application.email_from}</p>
          </div>
        </div>

        {/* Werkvorm & Functieniveau */}
        <div className="flex items-center gap-2 flex-wrap">
          {werkvorm && (
            <Badge className={`text-xs ${getWerkvormColor(werkvorm)}`}>
              {werkvorm}
            </Badge>
          )}
          {functieNiveau && (
            <span className="text-xs text-muted-foreground">{functieNiveau}</span>
          )}
          {application.extracted_data?.assigned_organization && (
            <Badge 
              className={`text-xs ${
                application.extracted_data.assigned_organization === "ABCzorg" 
                  ? "bg-blue-600 hover:bg-blue-700 text-white" 
                  : "bg-orange-500 hover:bg-orange-600 text-white"
              }`}
            >
              {application.extracted_data.assigned_organization}
            </Badge>
          )}
        </div>

        {/* Professional Link (if assigned) */}
        {application.professionals && (
          <div className="flex items-center gap-2 pt-1 border-t">
            <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <p className="text-xs font-medium text-muted-foreground">
              Gekoppeld: {application.professionals.full_name}
            </p>
          </div>
        )}

        {/* Status & Completeness */}
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline" className="text-xs">
            {getStatusLabel(application.status)}
          </Badge>
          
          {application.completeness_score !== null && (
            <div className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">{application.completeness_score}%</span>
              <div className={`h-2 w-2 rounded-full ${getCompletenessColor(application.completeness_score)}`} />
            </div>
          )}
        </div>

        {/* Created Date */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span>{format(new Date(application.created_at), "d MMM yyyy", { locale: nl })}</span>
        </div>
      </CardContent>
    </Card>
  );
}
