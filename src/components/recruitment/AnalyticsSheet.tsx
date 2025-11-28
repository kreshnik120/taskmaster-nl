import { BarChart3 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PipelineFunnelMini } from "./PipelineFunnelMini";
import { RecruitmentAnalytics } from "./RecruitmentAnalytics";
import { UrgencyBanner } from "./UrgencyBanner";
import { RecentMovementsWidget } from "./RecentMovementsWidget";

interface Application {
  id: string;
  email_from: string;
  email_subject: string | null;
  email_body: string | null;
  pipeline_stage: string;
  status: string;
  completeness_score: number | null;
  missing_info: any;
  extracted_data: any;
  professional_id: string | null;
  cv_file_path: string | null;
  cv_file_name: string | null;
  created_at: string;
  updated_at: string | null;
  professionals?: {
    full_name: string;
    functie_niveau: string;
  } | null;
}

interface AnalyticsSheetProps {
  applications: Application[];
  isLoading: boolean;
  onApplicationClick: (app: Application) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AnalyticsSheet({ 
  applications, 
  isLoading, 
  onApplicationClick,
  open,
  onOpenChange 
}: AnalyticsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <BarChart3 className="h-4 w-4" />
          <span className="hidden sm:inline">Analytics</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Recruitment Analytics</SheetTitle>
          <SheetDescription>
            Conversie percentages, bottlenecks, en recente activiteit
          </SheetDescription>
        </SheetHeader>
        
        <ScrollArea className="h-[calc(100vh-8rem)] mt-6">
          <div className="space-y-6 pr-4">
            {/* Pipeline Funnel */}
            <div>
              <h3 className="text-sm font-medium mb-3">Pipeline Conversie</h3>
              <PipelineFunnelMini 
                applications={applications}
                onStageClick={(stageKey) => {
                  const element = document.getElementById(`column-${stageKey}`);
                  element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }}
              />
            </div>

            {/* Recruitment Analytics */}
            <div>
              <h3 className="text-sm font-medium mb-3">Stage Metrics</h3>
              <RecruitmentAnalytics applications={applications} />
            </div>

            {/* Urgency Banner */}
            <div>
              <h3 className="text-sm font-medium mb-3">Urgente Acties</h3>
              <UrgencyBanner 
                applications={applications}
                onApplicationClick={onApplicationClick}
              />
            </div>

            {/* Recent Movements */}
            <div>
              <h3 className="text-sm font-medium mb-3">Recente Bewegingen</h3>
              <RecentMovementsWidget 
                applications={applications}
                isLoading={isLoading}
              />
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
