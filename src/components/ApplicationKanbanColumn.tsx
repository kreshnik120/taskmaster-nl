import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApplicationCard } from "./ApplicationCard";
import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";

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
  borderColor: string;
  countColor: string;
  onApplicationClick: (application: Application) => void;
}

export function ApplicationKanbanColumn({
  id,
  title,
  applications,
  color,
  borderColor,
  countColor,
  onApplicationClick,
}: ApplicationKanbanColumnProps) {
  const { setNodeRef } = useDroppable({
    id: id,
  });

  return (
    <Card className={`min-w-[320px] flex flex-col bg-card border shadow-none ${borderColor}`}>
      <CardHeader className="pb-3 sticky top-0 z-10 bg-card/95 backdrop-blur-sm border-b">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="font-medium text-foreground">{title}</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            id === 'nieuw' ? 'bg-blue-50 text-blue-600' :
            id === 'screening' ? 'bg-amber-50 text-amber-600' :
            id === 'interview' ? 'bg-sky-50 text-sky-600' :
            id === 'goedgekeurd' ? 'bg-emerald-50 text-emerald-600' :
            'bg-green-50 text-green-700'
          }`}>
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
            {applications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Inbox className="h-8 w-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground/60">Geen sollicitaties</p>
                <p className="text-xs text-muted-foreground/40 mt-1">Sleep hier om toe te voegen</p>
              </div>
            ) : (
              applications.map((application) => (
                <ApplicationCard
                  key={application.id}
                  application={application}
                  onClick={() => onApplicationClick(application)}
                />
              ))
            )}
          </div>
        </SortableContext>
      </CardContent>
    </Card>
  );
}
