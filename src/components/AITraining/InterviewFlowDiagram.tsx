import { CheckCircle, Circle, Clock, ArrowRight, User, Calendar, FileCheck, ThumbsUp, FileText, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface FlowStage {
  id: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  requirements: string[];
}

/**
 * CORRECTE RECRUITMENT FLOW (januari 2026):
 * nieuw → intake_verstuurd → docs_compleet → gesprek_gepland → screening → goedgekeurd → geplaatst
 * 
 * KRITIEKE PUNTEN:
 * - docs_compleet: CV + diploma geverifieerd, klaar voor fysiek gesprek
 * - gesprek_gepland: Fysiek gesprek datum ingepland
 * - screening: Alleen na POSITIEVE gesprek feedback (menselijke goedkeuring!)
 * - VOG wordt aangevraagd bij screening (max 3 maanden oud)
 */
const FLOW_STAGES: FlowStage[] = [
  {
    id: "nieuw",
    label: "Nieuw",
    icon: <User className="h-4 w-4" />,
    description: "Sollicitatie ontvangen, intake gestart",
    requirements: ["Email ontvangen", "Basis gegevens verzameld"]
  },
  {
    id: "docs_compleet",
    label: "Docs Compleet",
    icon: <FileText className="h-4 w-4" />,
    description: "Alle documenten binnen en geverifieerd",
    requirements: ["CV aanwezig", "Diploma geverifieerd (DUO/EMREX)", "Completeness ≥ 70%"]
  },
  {
    id: "gesprek_gepland",
    label: "Gesprek Gepland",
    icon: <Calendar className="h-4 w-4" />,
    description: "Fysiek sollicitatiegesprek ingepland",
    requirements: ["Gesprek datum gezet", "Kandidaat bevestigd"]
  },
  {
    id: "screening",
    label: "Screening",
    icon: <FileCheck className="h-4 w-4" />,
    description: "Na positief gesprek, VOG wordt aangevraagd",
    requirements: ["Gesprek positief ✓", "VOG aangevraagd (max 3 mnd)"]
  },
  {
    id: "goedgekeurd",
    label: "Goedgekeurd",
    icon: <ThumbsUp className="h-4 w-4" />,
    description: "Klaar voor plaatsing bij klant",
    requirements: ["VOG geverifieerd", "Alle checks passed"]
  },
  {
    id: "geplaatst",
    label: "Geplaatst",
    icon: <Briefcase className="h-4 w-4" />,
    description: "Actief werkzaam bij klant",
    requirements: ["Contract getekend", "Startdatum bevestigd"]
  }
];

interface InterviewFlowDiagramProps {
  pipelineStage: string;
  interviewStatus: string | null;
  completenessScore: number;
  missingInfo: string[];
  gesprekDatum?: string | null;
  gesprekFeedback?: string | null;
  className?: string;
}

export function InterviewFlowDiagram({
  pipelineStage,
  interviewStatus,
  completenessScore,
  missingInfo,
  gesprekDatum = null,
  gesprekFeedback = null,
  className
}: InterviewFlowDiagramProps) {
  // Determine active stage based on pipeline_stage
  const getActiveStageIndex = () => {
    if (pipelineStage === "geplaatst") return 5;
    if (pipelineStage === "goedgekeurd") return 4;
    if (pipelineStage === "screening") return 3;
    if (pipelineStage === "gesprek_gepland" || pipelineStage === "interview") return 2;
    if (pipelineStage === "docs_compleet") return 1;
    if (pipelineStage === "intake_verstuurd") return 0;
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
    
    if (stage.id === "nieuw" && completenessScore < 70) {
      return `Completeness: ${completenessScore}% (documenten nog niet compleet)`;
    }
    if (stage.id === "docs_compleet" && missingInfo.length > 0) {
      return `Ontbrekend: ${missingInfo.slice(0, 3).join(', ')}`;
    }
    if (stage.id === "gesprek_gepland" && !gesprekDatum) {
      return "Gesprek datum moet nog ingepland worden";
    }
    if (stage.id === "screening" && gesprekFeedback !== 'positive') {
      if (!gesprekFeedback || gesprekFeedback === 'pending') {
        return "Wacht op gesprek feedback van recruiter";
      }
      if (gesprekFeedback === 'negative') {
        return "Gesprek was negatief - afwijzing pending";
      }
    }
    return null;
  };

  return (
    <TooltipProvider>
      <div className={cn("w-full", className)}>
        {/* Flow Diagram */}
        <div className="flex items-center justify-between gap-1">
          {FLOW_STAGES.map((stage, index) => {
            const status = getStageStatus(index);
            const blocker = getBlockerInfo(stage, index);
            
            return (
              <div key={stage.id} className="flex items-center flex-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-all cursor-pointer flex-1 min-w-0",
                        status === "completed" && "bg-green-500/10 border-green-500 text-green-700 dark:text-green-400",
                        status === "active" && "bg-primary/10 border-primary text-primary animate-pulse",
                        status === "pending" && "bg-muted/50 border-muted-foreground/20 text-muted-foreground"
                      )}
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                          status === "completed" && "bg-green-500 text-white",
                          status === "active" && "bg-primary text-primary-foreground",
                          status === "pending" && "bg-muted text-muted-foreground"
                        )}
                      >
                        {status === "completed" ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : (
                          stage.icon
                        )}
                      </div>
                      <span className="text-[10px] font-medium text-center truncate w-full">{stage.label}</span>
                      {blocker && (
                        <span className="text-[9px] text-amber-600 dark:text-amber-400 text-center truncate w-full">
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
                      {stage.id === "screening" && (
                        <p className="text-blue-600 dark:text-blue-400 text-xs mt-2">
                          💡 VOG wordt hier aangevraagd (max 3 maanden oud bij plaatsing)
                        </p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
                
                {/* Arrow between stages */}
                {index < FLOW_STAGES.length - 1 && (
                  <ArrowRight
                    className={cn(
                      "h-3 w-3 mx-0.5 flex-shrink-0",
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
        <div className="mt-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Circle className="h-2.5 w-2.5 fill-green-500 text-green-500" />
              <span className="text-muted-foreground">Voltooid</span>
            </div>
            <div className="flex items-center gap-1">
              <Circle className="h-2.5 w-2.5 fill-primary text-primary animate-pulse" />
              <span className="text-muted-foreground">Actief</span>
            </div>
            <div className="flex items-center gap-1">
              <Circle className="h-2.5 w-2.5 fill-muted text-muted-foreground" />
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
