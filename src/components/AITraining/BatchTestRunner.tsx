import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Play, 
  Square, 
  CheckCircle, 
  XCircle, 
  Clock, 
  RotateCcw,
  Download,
  Loader2,
  AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TestStep {
  type: "reset" | "email" | "verify" | "wait";
  description: string;
  template?: string;
  field?: string;
  expected?: string | number;
  seconds?: number;
}

interface TestScenario {
  id: string;
  name: string;
  description: string;
  steps: TestStep[];
  expectedOutcome: Record<string, any>;
}

interface TestResult {
  scenarioId: string;
  status: "pending" | "running" | "passed" | "failed";
  duration?: number;
  error?: string;
  stepResults: {
    step: TestStep;
    status: "passed" | "failed" | "skipped";
    details?: string;
  }[];
}

const TEST_SCENARIOS: TestScenario[] = [
  {
    id: "complete_intake",
    name: "Complete Intake Flow",
    description: "Test volledige intake met telefoon en diploma",
    steps: [
      { type: "reset", description: "Reset applicatie naar initial state" },
      { type: "email", template: "complete_intake", description: "Stuur complete intake email" },
      { type: "wait", seconds: 2, description: "Wacht op verwerking" },
      { type: "verify", field: "completeness_score", expected: 100, description: "Verify completeness = 100" },
    ],
    expectedOutcome: { completeness_score: 100 }
  },
  {
    id: "slot_selection",
    name: "Interview Slot Selectie",
    description: "Test slot selectie en stage transitie",
    steps: [
      { type: "email", template: "slot_selection", description: "Stuur slot selectie email" },
      { type: "wait", seconds: 2, description: "Wacht op verwerking" },
      { type: "verify", field: "pipeline_stage", expected: "interview", description: "Verify stage = interview" },
    ],
    expectedOutcome: { pipeline_stage: "interview" }
  },
  {
    id: "placeholder_detection",
    name: "Placeholder Telefoon Detectie",
    description: "Test dat placeholders correct worden gedetecteerd",
    steps: [
      { type: "reset", description: "Reset applicatie" },
      { type: "email", template: "invalid_phone", description: "Stuur placeholder telefoon" },
      { type: "wait", seconds: 2, description: "Wacht op verwerking" },
      { type: "verify", field: "completeness_score", expected: "<100", description: "Verify completeness < 100" },
    ],
    expectedOutcome: { completeness_lt: 100 }
  },
  {
    id: "full_e2e_flow",
    name: "Volledige E2E Flow",
    description: "Test complete flow van intake tot interview",
    steps: [
      { type: "reset", description: "Reset applicatie" },
      { type: "email", template: "complete_intake", description: "Complete intake" },
      { type: "wait", seconds: 3, description: "Wacht op slots" },
      { type: "email", template: "slot_selection", description: "Selecteer slot" },
      { type: "wait", seconds: 2, description: "Wacht op bevestiging" },
      { type: "verify", field: "pipeline_stage", expected: "interview", description: "Verify interview stage" },
    ],
    expectedOutcome: { pipeline_stage: "interview" }
  }
];

const EMAIL_TEMPLATES: Record<string, { subject: string; body: string }> = {
  complete_intake: {
    subject: "Re: Welkom bij CitoZorg",
    body: "Hallo, mijn telefoonnummer is 06-87654321. Ik heb mijn HBO-V diploma behaald in 2019. Met vriendelijke groet!"
  },
  slot_selection: {
    subject: "Re: Interview slots",
    body: "Slot 1 graag, dat past mij het beste."
  },
  partial_update: {
    subject: "Re: Welkom",
    body: "Mijn nummer is 06-98765432."
  },
  invalid_phone: {
    subject: "Re: Test",
    body: "Je kunt mij bereiken op 06-12345678."
  }
};

interface BatchTestRunnerProps {
  applicationId: string | null;
  applicationEmail: string | null;
  onRefresh: () => void;
}

export function BatchTestRunner({ applicationId, applicationEmail, onRefresh }: BatchTestRunnerProps) {
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>(["complete_intake"]);
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentScenario, setCurrentScenario] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const toggleScenario = (scenarioId: string) => {
    setSelectedScenarios(prev => 
      prev.includes(scenarioId) 
        ? prev.filter(id => id !== scenarioId)
        : [...prev, scenarioId]
    );
  };

  const resetApplication = async () => {
    if (!applicationId) return;
    
    await supabase.from('professional_applications').update({
      completeness_score: 87,
      interview_status: null,
      pipeline_stage: 'nieuw',
      missing_info: ['telefoonnummer (echt nummer, geen placeholder)']
    }).eq('id', applicationId);
  };

  const sendTestEmail = async (template: string) => {
    if (!applicationEmail) throw new Error("Geen email beschikbaar");
    
    const emailTemplate = EMAIL_TEMPLATES[template];
    if (!emailTemplate) throw new Error(`Template ${template} niet gevonden`);

    const { data, error } = await supabase.functions.invoke('handle-application-reply', {
      body: {
        type: 'email.received',
        data: {
          from: applicationEmail,
          subject: emailTemplate.subject,
          text: emailTemplate.body,
          to: ['sollicitaties@citozorg.nl']
        }
      }
    });

    if (error) throw error;
    return data;
  };

  const verifyField = async (field: string, expected: string | number): Promise<boolean> => {
    if (!applicationId) return false;
    
    const { data } = await supabase
      .from('professional_applications')
      .select(field)
      .eq('id', applicationId)
      .single();

    if (!data) return false;

    const value = data[field as keyof typeof data];
    
    // Handle comparison operators
    if (typeof expected === "string" && expected.startsWith("<")) {
      const num = parseInt(expected.substring(1));
      return typeof value === "number" && value < num;
    }
    if (typeof expected === "string" && expected.startsWith(">")) {
      const num = parseInt(expected.substring(1));
      return typeof value === "number" && value > num;
    }
    
    return value === expected;
  };

  const wait = (seconds: number) => new Promise(resolve => setTimeout(resolve, seconds * 1000));

  const runScenario = async (scenario: TestScenario): Promise<TestResult> => {
    const startTime = Date.now();
    const stepResults: TestResult["stepResults"] = [];

    try {
      for (const step of scenario.steps) {
        try {
          switch (step.type) {
            case "reset":
              await resetApplication();
              stepResults.push({ step, status: "passed", details: "Applicatie gereset" });
              break;
            
            case "email":
              if (step.template) {
                await sendTestEmail(step.template);
                stepResults.push({ step, status: "passed", details: `Email ${step.template} verstuurd` });
              }
              break;
            
            case "wait":
              if (step.seconds) {
                await wait(step.seconds);
                stepResults.push({ step, status: "passed", details: `${step.seconds}s gewacht` });
              }
              break;
            
            case "verify":
              if (step.field && step.expected !== undefined) {
                const passed = await verifyField(step.field, step.expected);
                stepResults.push({ 
                  step, 
                  status: passed ? "passed" : "failed",
                  details: passed ? `${step.field} = ${step.expected} ✓` : `${step.field} ≠ ${step.expected}`
                });
                if (!passed) {
                  return {
                    scenarioId: scenario.id,
                    status: "failed",
                    duration: Date.now() - startTime,
                    error: `Verificatie gefaald: ${step.field}`,
                    stepResults
                  };
                }
              }
              break;
          }
        } catch (stepError: any) {
          stepResults.push({ step, status: "failed", details: stepError.message });
          return {
            scenarioId: scenario.id,
            status: "failed",
            duration: Date.now() - startTime,
            error: stepError.message,
            stepResults
          };
        }
      }

      return {
        scenarioId: scenario.id,
        status: "passed",
        duration: Date.now() - startTime,
        stepResults
      };
    } catch (error: any) {
      return {
        scenarioId: scenario.id,
        status: "failed",
        duration: Date.now() - startTime,
        error: error.message,
        stepResults
      };
    }
  };

  const runAllTests = async () => {
    if (!applicationId || !applicationEmail) {
      toast.error("Selecteer eerst een applicatie");
      return;
    }

    setIsRunning(true);
    setResults([]);
    setProgress(0);

    const scenariosToRun = TEST_SCENARIOS.filter(s => selectedScenarios.includes(s.id));
    const newResults: TestResult[] = [];

    for (let i = 0; i < scenariosToRun.length; i++) {
      const scenario = scenariosToRun[i];
      setCurrentScenario(scenario.id);
      
      const result = await runScenario(scenario);
      newResults.push(result);
      setResults([...newResults]);
      
      setProgress(((i + 1) / scenariosToRun.length) * 100);
    }

    setIsRunning(false);
    setCurrentScenario(null);
    onRefresh();

    const passed = newResults.filter(r => r.status === "passed").length;
    const failed = newResults.filter(r => r.status === "failed").length;
    
    if (failed === 0) {
      toast.success(`Alle ${passed} tests geslaagd!`);
    } else {
      toast.error(`${failed} van ${passed + failed} tests gefaald`);
    }
  };

  const exportResults = () => {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-test-results-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = (status: TestResult["status"]) => {
    switch (status) {
      case "passed": return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed": return <XCircle className="h-4 w-4 text-destructive" />;
      case "running": return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5" />
          Batch Test Runner
        </CardTitle>
        <CardDescription>
          Voer automatisch meerdere test scenarios uit en vergelijk resultaten
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!applicationId && (
          <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">Selecteer eerst een applicatie in het Email Reply Test Panel</span>
          </div>
        )}

        {/* Scenario Selection */}
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Selecteer Scenarios</h4>
          <div className="grid grid-cols-2 gap-2">
            {TEST_SCENARIOS.map(scenario => (
              <div
                key={scenario.id}
                className={cn(
                  "flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors",
                  selectedScenarios.includes(scenario.id) 
                    ? "border-primary bg-primary/5" 
                    : "border-border hover:border-primary/50"
                )}
                onClick={() => toggleScenario(scenario.id)}
              >
                <Checkbox 
                  checked={selectedScenarios.includes(scenario.id)}
                  onCheckedChange={() => toggleScenario(scenario.id)}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{scenario.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{scenario.description}</p>
                  <Badge variant="outline" className="mt-1 text-[10px]">
                    {scenario.steps.length} stappen
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button 
            onClick={runAllTests} 
            disabled={isRunning || !applicationId || selectedScenarios.length === 0}
            className="gap-2"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run {selectedScenarios.length} Test{selectedScenarios.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>
          
          {results.length > 0 && (
            <Button variant="outline" onClick={exportResults} className="gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          )}
        </div>

        {/* Progress */}
        {isRunning && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Running: {currentScenario}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Resultaten</h4>
            <ScrollArea className="h-[300px] border rounded-lg">
              <div className="p-2 space-y-2">
                {results.map(result => {
                  const scenario = TEST_SCENARIOS.find(s => s.id === result.scenarioId);
                  return (
                    <div 
                      key={result.scenarioId}
                      className={cn(
                        "p-3 border rounded-lg space-y-2",
                        result.status === "passed" && "border-green-500/20 bg-green-500/5",
                        result.status === "failed" && "border-destructive/20 bg-destructive/5"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(result.status)}
                          <span className="font-medium text-sm">{scenario?.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {result.duration && (
                            <Badge variant="outline" className="text-xs">
                              {(result.duration / 1000).toFixed(1)}s
                            </Badge>
                          )}
                          <Badge 
                            variant={result.status === "passed" ? "default" : "destructive"}
                            className="text-xs"
                          >
                            {result.status.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                      
                      {/* Step Results */}
                      <div className="pl-6 space-y-1">
                        {result.stepResults.map((sr, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs">
                            {sr.status === "passed" ? (
                              <CheckCircle className="h-3 w-3 text-green-500" />
                            ) : sr.status === "failed" ? (
                              <XCircle className="h-3 w-3 text-destructive" />
                            ) : (
                              <Clock className="h-3 w-3 text-muted-foreground" />
                            )}
                            <span className={cn(
                              sr.status === "failed" && "text-destructive"
                            )}>
                              {sr.step.description}
                              {sr.details && <span className="text-muted-foreground ml-1">({sr.details})</span>}
                            </span>
                          </div>
                        ))}
                      </div>

                      {result.error && (
                        <p className="text-xs text-destructive pl-6">
                          ❌ {result.error}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            
            {/* Summary */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-sm font-medium">Totaal</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  {results.filter(r => r.status === "passed").length} passed
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <XCircle className="h-3 w-3 text-destructive" />
                  {results.filter(r => r.status === "failed").length} failed
                </Badge>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
