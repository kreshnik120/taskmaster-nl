import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, User, FileText, Calendar } from "lucide-react";
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

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-move hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        {/* Email From */}
        <div className="flex items-start gap-2">
          <Mail className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{application.email_from}</p>
            {application.email_subject && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {application.email_subject}
              </p>
            )}
          </div>
        </div>

        {/* Professional Link */}
        {application.professionals && (
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-medium">{application.professionals.full_name}</p>
              <p className="text-xs text-muted-foreground">{application.professionals.functie_niveau}</p>
            </div>
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
