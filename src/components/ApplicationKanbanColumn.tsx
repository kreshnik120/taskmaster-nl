import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApplicationCard } from "./ApplicationCard";
import { cn } from "@/lib/utils";

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
  } | null;
  professionals?: {
    full_name: string;
    functie_niveau: string;
  } | null;
}

interface ApplicationKanbanColumnProps {
  id: string;
  title: string;
  applications: Application[];
  color: string;
  onApplicationClick: (application: Application) => void;
}

export function ApplicationKanbanColumn({
  id,
  title,
  applications,
  color,
  onApplicationClick,
}: ApplicationKanbanColumnProps) {
  const { setNodeRef } = useDroppable({
    id: id,
  });

  return (
    <Card className="min-w-[320px] flex flex-col bg-card border shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="font-medium text-foreground">{title}</span>
          <span className="text-sm font-normal text-muted-foreground">
            {applications.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto pt-0">
        <SortableContext
          id={id}
          items={applications.map((app) => app.id)}
          strategy={verticalListSortingStrategy}
        >
          <div ref={setNodeRef} className="space-y-2 min-h-[200px]">
            {applications.map((application) => (
              <ApplicationCard
                key={application.id}
                application={application}
                onClick={() => onApplicationClick(application)}
              />
            ))}
          </div>
        </SortableContext>
      </CardContent>
    </Card>
  );
}
