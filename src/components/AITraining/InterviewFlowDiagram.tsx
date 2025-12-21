import { CheckCircle, Circle, Clock, ArrowRight, User, Calendar, FileCheck, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface FlowStage {
  id: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  requirements: string[];
}

const FLOW_STAGES: FlowStage[] = [
  {
    id: "nieuw",
    label: "Nieuw",
    icon: <User className="h-4 w-4" />,
    description: "Sollicitatie ontvangen, intake bezig",
    requirements: ["Email ontvangen", "Basis gegevens verzameld"]
  },
  {
    id: "slots_offered",
    label: "Slots Aangeboden",
    icon: <Clock className="h-4 w-4" />,
    description: "Interview slots verstuurd, wacht op keuze",
    requirements: ["Completeness ≥ 100%", "Alle documenten aanwezig"]
  },
  {
    id: "interview",
    label: "Interview",
    icon: <Calendar className="h-4 w-4" />,
    description: "Interview ingepland",
    requirements: ["Slot geselecteerd", "Bevestiging verstuurd"]
  },
  {
    id: "screening",
    label: "Screening",
    icon: <FileCheck className="h-4 w-4" />,
    description: "Documenten worden geverifieerd",
    requirements: ["Interview voltooid", "VOG/diploma check"]
  },
  {
    id: "goedgekeurd",
    label: "Goedgekeurd",
    icon: <ThumbsUp className="h-4 w-4" />,
    description: "Klaar voor plaatsing",
    requirements: ["Alle checks passed", "Contract getekend"]
  }
];

interface InterviewFlowDiagramProps {
  pipelineStage: string;
  interviewStatus: string | null;
  completenessScore: number;
  missingInfo: string[];
  className?: string;
}

export function InterviewFlowDiagram({
  pipelineStage,
  interviewStatus,
  completenessScore,
  missingInfo,
  className
}: InterviewFlowDiagramProps) {
  // Determine active stage based on pipeline_stage and interview_status
  const getActiveStageIndex = () => {
    if (pipelineStage === "goedgekeurd") return 4;
    if (pipelineStage === "screening") return 3;
    if (pipelineStage === "interview") return 2;
    if (interviewStatus === "awaiting_response" || interviewStatus === "slots_offered") return 1;
    return 0; // nieuw
  };

  const activeIndex = getActiveStageIndex();

  const getStageStatus = (index: number): "completed" | "active" | "pending" => {
    if (index < activeIndex) return "completed";
    if (index === activeIndex) return "active";
    return "pending";
  };

  const getBlockerInfo = (stage: FlowStage, index: number): string | null => {
    if (getStageStatus(index) !== "active") return null;
    
    if (stage.id === "nieuw" && completenessScore < 100) {
      return `Completeness: ${completenessScore}% (${missingInfo.length} items missen)`;
    }
    if (stage.id === "slots_offered" && interviewStatus === "awaiting_response") {
      return "Wacht op slot selectie van kandidaat";
    }
    return null;
  };

  return (
    <TooltipProvider>
      <div className={cn("w-full", className)}>
        {/* Flow Diagram */}
        <div className="flex items-center justify-between gap-2">
          {FLOW_STAGES.map((stage, index) => {
            const status = getStageStatus(index);
            const blocker = getBlockerInfo(stage, index);
            
            return (
              <div key={stage.id} className="flex items-center flex-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all cursor-pointer flex-1",
                        status === "completed" && "bg-green-500/10 border-green-500 text-green-700 dark:text-green-400",
                        status === "active" && "bg-primary/10 border-primary text-primary animate-pulse",
                        status === "pending" && "bg-muted/50 border-muted-foreground/20 text-muted-foreground"
                      )}
                    >
                      <div
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center",
                          status === "completed" && "bg-green-500 text-white",
                          status === "active" && "bg-primary text-primary-foreground",
                          status === "pending" && "bg-muted text-muted-foreground"
                        )}
                      >
                        {status === "completed" ? (
                          <CheckCircle className="h-5 w-5" />
                        ) : (
                          stage.icon
                        )}
                      </div>
                      <span className="text-xs font-medium text-center">{stage.label}</span>
                      {blocker && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 text-center max-w-[80px] truncate">
                          ⚠️ Blocker
                        </span>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <div className="space-y-2">
                      <p className="font-semibold">{stage.label}</p>
                      <p className="text-sm text-muted-foreground">{stage.description}</p>
                      <div className="text-xs">
                        <p className="font-medium mb-1">Vereisten:</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {stage.requirements.map((req, i) => (
                            <li key={i}>{req}</li>
                          ))}
                        </ul>
                      </div>
                      {blocker && (
                        <p className="text-amber-600 dark:text-amber-400 text-xs font-medium mt-2">
                          ⚠️ {blocker}
                        </p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
                
                {/* Arrow between stages */}
                {index < FLOW_STAGES.length - 1 && (
                  <ArrowRight
                    className={cn(
                      "h-4 w-4 mx-1 flex-shrink-0",
                      index < activeIndex
                        ? "text-green-500"
                        : "text-muted-foreground/30"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Status Summary */}
        <div className="mt-4 flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Circle className="h-3 w-3 fill-green-500 text-green-500" />
              <span className="text-muted-foreground">Voltooid</span>
            </div>
            <div className="flex items-center gap-2">
              <Circle className="h-3 w-3 fill-primary text-primary animate-pulse" />
              <span className="text-muted-foreground">Actief</span>
            </div>
            <div className="flex items-center gap-2">
              <Circle className="h-3 w-3 fill-muted text-muted-foreground" />
              <span className="text-muted-foreground">Wachtend</span>
            </div>
          </div>
          <div className="text-muted-foreground">
            Stage {activeIndex + 1} van {FLOW_STAGES.length}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
