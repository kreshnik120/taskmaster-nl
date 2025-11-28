import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";

interface PipelineFunnelMiniProps {
  applications: any[];
  onStageClick?: (stageKey: string) => void;
}

export function PipelineFunnelMini({ applications, onStageClick }: PipelineFunnelMiniProps) {
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('pipeline-funnel-open');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('pipeline-funnel-open', JSON.stringify(isOpen));
  }, [isOpen]);

  // Calculate stage counts
  const stages = [
    { key: 'nieuw', label: 'Nieuw', color: 'bg-blue-500' },
    { key: 'screening', label: 'Screening', color: 'bg-purple-500' },
    { key: 'interview', label: 'Interview', color: 'bg-orange-500' },
    { key: 'goedgekeurd', label: 'Goedgekeurd', color: 'bg-green-500' },
    { key: 'geplaatst', label: 'Geplaatst', color: 'bg-emerald-500' },
  ];

  const stageCounts = stages.map(stage => ({
    ...stage,
    count: applications.filter(app => app.pipeline_stage === stage.key).length,
  }));

  const totalApplications = applications.length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-0 shadow-none bg-transparent">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 rounded-lg transition-all duration-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-sm font-medium">Pipeline Conversie</CardTitle>
                {!isOpen && (
                  <div className="flex items-center gap-1">
                    {stageCounts.map((stage) => {
                      const percentage = totalApplications > 0 ? (stage.count / totalApplications) * 100 : 0;
                      return (
                        <div
                          key={stage.key}
                          className={`h-1.5 rounded-full ${stage.color} transition-all duration-300`}
                          style={{ width: `${Math.max(percentage * 0.8, 4)}px` }}
                          title={`${stage.label}: ${stage.count}`}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent className="animate-accordion-down">
          <CardContent className="px-4 pb-4 pt-2">
            <div className="space-y-2">
              {stageCounts.map((stage, index) => {
                const percentage = totalApplications > 0 ? (stage.count / totalApplications) * 100 : 0;
                const prevCount = index > 0 ? stageCounts[index - 1].count : totalApplications;
                const conversionRate = prevCount > 0 ? (stage.count / prevCount) * 100 : 0;

                return (
                  <div key={stage.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <button
                        onClick={() => onStageClick?.(stage.key)}
                        className="text-muted-foreground hover:text-foreground transition-colors duration-200 hover:scale-[1.02] transform"
                      >
                        {stage.label}
                      </button>
                      <div className="flex items-center gap-2">
                        <span className="font-medium tabular-nums">{stage.count}</span>
                        {index > 0 && prevCount > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            ({conversionRate.toFixed(0)}%)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden group">
                      <div
                        className={`h-full ${stage.color} transition-all duration-700 ease-out group-hover:shadow-[0_0_8px_rgba(59,130,246,0.5)]`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
