import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApplicationCard } from "./ApplicationCard";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Inbox, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";

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
  searchQuery?: string;
  selectedApplicationIds?: Set<string>;
  onSelectApplication?: (id: string, selected: boolean) => void;
}

export function ApplicationKanbanColumn({
  id,
  title,
  applications,
  color: _color,
  borderColor,
  countColor: _countColor,
  onApplicationClick,
  searchQuery = "",
  selectedApplicationIds = new Set(),
  onSelectApplication,
}: ApplicationKanbanColumnProps) {
  const { setNodeRef } = useDroppable({
    id: id,
  });

  // Collapsible state with localStorage
  const [isOpen, setIsOpen] = useState(() => {
    const stored = localStorage.getItem(`kanban-column-${id}-open`);
    return stored === null ? true : stored === "true";
  });

  useEffect(() => {
    localStorage.setItem(`kanban-column-${id}-open`, String(isOpen));
  }, [isOpen, id]);

  return (
    <Card className={`min-w-[320px] flex flex-col bg-card border shadow-none ${borderColor}`} id={`column-${id}`}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3 sticky top-0 z-10 bg-card/95 backdrop-blur-sm border-b">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full p-0 h-auto hover:bg-transparent">
              <CardTitle className="flex items-center justify-between text-base w-full">
                <div className="flex items-center gap-2">
                  <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                  <span className="font-medium text-foreground">{title}</span>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  id === 'nieuw' ? 'bg-recruitment-nieuw/10 text-recruitment-nieuw' :
                  id === 'screening' ? 'bg-recruitment-screening/10 text-recruitment-screening' :
                  id === 'interview' ? 'bg-recruitment-interview/10 text-recruitment-interview' :
                  id === 'goedgekeurd' ? 'bg-recruitment-goedgekeurd/10 text-recruitment-goedgekeurd' :
                  id === 'geplaatst' ? 'bg-recruitment-geplaatst/10 text-recruitment-geplaatst' :
                  'bg-recruitment-afgewezen/10 text-recruitment-afgewezen'
                }`}>
                  {applications.length}
                </span>
              </CardTitle>
            </Button>
          </CollapsibleTrigger>
        </CardHeader>
        
        <CollapsibleContent>
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
                      searchQuery={searchQuery}
                      isSelected={selectedApplicationIds.has(application.id)}
                      onSelect={onSelectApplication ? (selected) => onSelectApplication(application.id, selected) : undefined}
                    />
                  ))
                )}
              </div>
            </SortableContext>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
