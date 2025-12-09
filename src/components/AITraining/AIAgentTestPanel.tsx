import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bot, Send, Loader2, CheckCircle2, XCircle, Clock, Activity, RefreshCw, Zap, Mail, Copy, FileText, Code } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface GeneratedEmail {
  subject: string;
  htmlContent: string;
  plainTextContent: string;
  fieldsAsked: string[];
}

export function AIAgentTestPanel() {
  const [testEmail, setTestEmail] = useState("");
  const [testName, setTestName] = useState("Test Kandidaat");
  const [sending, setSending] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [generatedEmail, setGeneratedEmail] = useState<GeneratedEmail | null>(null);

  // Fetch recent AI agent activity
  const { data: recentActivity, isLoading, refetch } = useQuery({
    queryKey: ["ai-agent-activity"],
    queryFn: async () => {
      // Recent goals
      const { data: goals } = await supabase
        .from("agent_goals")
        .select("id, goal_type, goal_description, status, created_at, completed_at, input_data")
        .order("created_at", { ascending: false })
        .limit(10);

      // Recent actions
      const { data: actions } = await supabase
        .from("agent_actions")
        .select("id, action_type, action_description, status, created_at, completed_at, error_message")
        .order("created_at", { ascending: false })
        .limit(10);

      // Stats
      const { count: totalGoals } = await supabase
        .from("agent_goals")
        .select("*", { count: "exact", head: true });

      const { count: pendingGoals } = await supabase
        .from("agent_goals")
        .select("*", { count: "exact", head: true })
        .in("status", ["pending", "in_progress"]);

      const { count: completedGoals } = await supabase
        .from("agent_goals")
        .select("*", { count: "exact", head: true })
        .eq("status", "completed");

      return {
        goals: goals || [],
        actions: actions || [],
        stats: {
          total: totalGoals || 0,
          pending: pendingGoals || 0,
          completed: completedGoals || 0,
        },
      };
    },
    refetchInterval: 10000,
  });

  const handleSendTestEmail = async () => {
    if (!testEmail) {
      toast.error("Vul een email adres in");
      return;
    }

    setSending(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Niet ingelogd");

      // Call the generate-followup-email function directly for testing
      const { data, error } = await supabase.functions.invoke("generate-followup-email", {
        body: {
          application_id: "test-" + Date.now(),
          candidate_name: testName,
          candidate_email: testEmail,
          fields_to_ask: ["telefoon", "regio", "functie_niveau"],
          current_completeness: 65,
          follow_up_count: 0,
        },
      });

      if (error) throw error;

      // Store generated email for preview
      setGeneratedEmail({
        subject: data.emailSubject || "Geen onderwerp",
        htmlContent: data.emailHtml || "",
        plainTextContent: data.emailPlainText || "",
        fieldsAsked: data.fieldsAsked || ["telefoon", "regio", "functie_niveau"],
      });

      toast.success("✅ Test email gegenereerd", {
        description: "Bekijk de preview hieronder",
      });

      console.log("Generated email:", data);
    } catch (error: any) {
      console.error("Test email error:", error);
      toast.error("Fout bij genereren test email", {
        description: error.message,
      });
    } finally {
      setSending(false);
    }
  };

  const handleActuallySendEmail = async () => {
    // STAP 1: Bevestig dat functie wordt aangeroepen
    console.log("🚀 handleActuallySendEmail CALLED!");
    toast.info("📧 Email versturen gestart...");

    // STAP 2: Validatie met duidelijke errors
    if (!generatedEmail) {
      console.error("❌ No generatedEmail object");
      toast.error("Geen email gegenereerd - genereer eerst een email");
      return;
    }
    
    if (!testEmail) {
      console.error("❌ No testEmail");
      toast.error("Geen email adres ingevuld");
      return;
    }

    console.log("✅ Validation passed, generatedEmail:", generatedEmail);
    console.log("✅ testEmail:", testEmail);

    setSendingEmail(true);
    
    try {
      // STAP 3: Log exacte payload
      const requestBody = {
        email_type: "followup_question",
        recipient_email: testEmail,
        recipient_name: testName || "Kandidaat",
        subject: generatedEmail.subject,
        html_content: generatedEmail.htmlContent,
        plain_text: generatedEmail.plainTextContent,
        org_id: "650e8400-e29b-41d4-a716-446655440001", // CitoZorg UUID
        metadata: {
          test_panel: true,
          fields_asked: generatedEmail.fieldsAsked,
        },
      };

      console.log("📧 REQUEST BODY:", JSON.stringify(requestBody, null, 2));
      toast.info("Verbinden met server...");

      // STAP 4: Edge function call met timing
      const startTime = Date.now();
      console.log("🔄 Calling supabase.functions.invoke('send-ai-email')...");
      
      const { data, error } = await supabase.functions.invoke("send-ai-email", {
        body: requestBody,
      });

      const duration = Date.now() - startTime;
      console.log(`📧 RESPONSE (${duration}ms):`, { data, error });

      if (error) {
        console.error("❌ Edge function returned error:", error);
        toast.error(`Server error: ${error.message}`);
        return;
      }

      console.log("✅ Email sent successfully!");
      toast.success("✅ Email verzonden via Resend!", {
        description: `Verstuurd naar ${testEmail}`,
      });

    } catch (error: any) {
      console.error("❌ CATCH BLOCK ERROR:", error);
      console.error("Error stack:", error.stack);
      toast.error(`Onverwachte fout: ${error.message}`);
    } finally {
      setSendingEmail(false);
      console.log("🏁 handleActuallySendEmail FINISHED");
    }
  };

  const handleTriggerOrchestrator = async () => {
    setSending(true);
    console.log("🚀 Triggering AI Agent Orchestrator (2-step process)...");
    
    try {
      // STAP 1: Process pending goals (planning fase)
      console.log("📋 Step 1: Processing pending goals...");
      toast.info("Stap 1/2: Goals verwerken...");
      
      const { data: planData, error: planError } = await supabase.functions.invoke(
        "ai-agent-orchestrator",
        { body: { action: 'process_pending_goals' } }
      );
      
      console.log("📋 Plan result:", planData, planError);
      
      if (planError) {
        console.error("❌ Plan error:", planError);
        throw planError;
      }

      const goalsProcessed = planData?.goalsProcessed || planData?.processed || 0;
      
      // STAP 2: Execute queued actions (dit stuurt de emails!)
      console.log("⚡ Step 2: Executing queued actions...");
      toast.info("Stap 2/2: Acties uitvoeren (emails versturen)...");
      
      const { data: execData, error: execError } = await supabase.functions.invoke(
        "ai-agent-orchestrator",
        { body: { action: 'execute_actions' } }
      );
      
      console.log("⚡ Execute result:", execData, execError);
      
      if (execError) {
        console.error("❌ Execute error:", execError);
        // Don't throw - still show partial success
        toast.warning("Goals verwerkt, maar acties gefaald", {
          description: execError.message,
        });
      } else {
        const actionsExecuted = execData?.executed || execData?.actionsExecuted || 0;
        
        toast.success("🤖 Orchestrator complete!", {
          description: `${goalsProcessed} goals gepland, ${actionsExecuted} acties uitgevoerd`,
        });
        
        console.log("✅ Orchestrator complete:", { goalsProcessed, actionsExecuted });
      }

      refetch();
    } catch (error: any) {
      console.error("❌ Orchestrator error:", error);
      toast.error("Fout bij triggeren orchestrator", {
        description: error.message,
      });
    } finally {
      setSending(false);
      console.log("🏁 handleTriggerOrchestrator FINISHED");
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
      pending: { variant: "secondary", icon: <Clock className="h-3 w-3" /> },
      in_progress: { variant: "default", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
      completed: { variant: "outline", icon: <CheckCircle2 className="h-3 w-3 text-green-500" /> },
      failed: { variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
    };
    const config = variants[status] || variants.pending;
    return (
      <Badge variant={config.variant} className="gap-1 text-[10px]">
        {config.icon}
        {status}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          AI Agent Test Panel
        </CardTitle>
        <CardDescription>
          Test de AI Agent intake flow en bekijk recente activiteit
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-muted/50 rounded-lg text-center">
            <div className="text-2xl font-bold">{recentActivity?.stats.total || 0}</div>
            <div className="text-xs text-muted-foreground">Totaal Goals</div>
          </div>
          <div className="p-4 bg-blue-500/10 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-600">{recentActivity?.stats.pending || 0}</div>
            <div className="text-xs text-muted-foreground">Actief</div>
          </div>
          <div className="p-4 bg-green-500/10 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-600">{recentActivity?.stats.completed || 0}</div>
            <div className="text-xs text-muted-foreground">Voltooid</div>
          </div>
        </div>

        <Separator />

        {/* Test Email Form */}
        <div className="space-y-4">
          <h3 className="font-medium flex items-center gap-2">
            <Send className="h-4 w-4" />
            Test Follow-up Email Genereren
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="testEmail">Test Email Adres</Label>
              <Input
                id="testEmail"
                type="email"
                placeholder="jouw-email@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="testName">Kandidaat Naam</Label>
              <Input
                id="testName"
                placeholder="Test Kandidaat"
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSendTestEmail} disabled={sending} className="gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Genereer Test Email
            </Button>
            <Button variant="outline" onClick={handleTriggerOrchestrator} disabled={sending} className="gap-2">
              <Zap className="h-4 w-4" />
              Trigger Orchestrator
            </Button>
            <Button variant="ghost" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Email Preview Section */}
        {generatedEmail && (
          <>
            <Separator />
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  Gegenereerde Email Preview
                </h3>
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-1 text-xs"
                    onClick={handleActuallySendEmail}
                    disabled={sendingEmail}
                  >
                    {sendingEmail ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3" />
                    )}
                    Verstuur naar {testEmail || "..."}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedEmail.plainTextContent);
                      toast.success("Gekopieerd naar klembord");
                    }}
                  >
                    <Copy className="h-3 w-3" />
                    Kopiëren
                  </Button>
                </div>
              </div>

              {/* Subject */}
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Onderwerp</div>
                <div className="font-medium">{generatedEmail.subject}</div>
              </div>

              {/* Fields Asked */}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-muted-foreground">Gevraagde velden:</span>
                {generatedEmail.fieldsAsked.map((field) => (
                  <Badge key={field} variant="secondary" className="text-xs">
                    {field}
                  </Badge>
                ))}
              </div>

              {/* HTML/Plain Text Tabs */}
              <Tabs defaultValue="html" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="html" className="gap-1 text-xs">
                    <Code className="h-3 w-3" />
                    HTML Preview
                  </TabsTrigger>
                  <TabsTrigger value="plain" className="gap-1 text-xs">
                    <FileText className="h-3 w-3" />
                    Plain Text
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="html" className="mt-3">
                  <div 
                    className="p-4 bg-background border rounded-lg max-h-[300px] overflow-auto prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: generatedEmail.htmlContent }}
                  />
                </TabsContent>
                <TabsContent value="plain" className="mt-3">
                  <pre className="p-4 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap max-h-[300px] overflow-auto font-mono">
                    {generatedEmail.plainTextContent}
                  </pre>
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}

        <Separator />

        {/* Recent Activity */}
        <div className="space-y-4">
          <h3 className="font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Recente AI Agent Activiteit
          </h3>
          
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                {recentActivity?.goals.length === 0 && recentActivity?.actions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nog geen AI Agent activiteit
                  </div>
                ) : (
                  <>
                    {recentActivity?.goals.map((goal: any) => (
                      <div key={goal.id} className="p-3 bg-muted/30 rounded-lg space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="text-sm font-medium">{goal.goal_type}</div>
                            <div className="text-xs text-muted-foreground line-clamp-1">
                              {goal.goal_description}
                            </div>
                          </div>
                          {getStatusBadge(goal.status)}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{format(new Date(goal.created_at), "dd MMM HH:mm", { locale: nl })}</span>
                          {goal.completed_at && (
                            <>
                              <span>→</span>
                              <span>{format(new Date(goal.completed_at), "HH:mm", { locale: nl })}</span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}

                    {recentActivity?.actions.map((action: any) => (
                      <div key={action.id} className="p-3 bg-primary/5 rounded-lg space-y-2 border-l-2 border-primary/30">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="text-sm font-medium">{action.action_type}</div>
                            <div className="text-xs text-muted-foreground line-clamp-1">
                              {action.action_description}
                            </div>
                          </div>
                          {getStatusBadge(action.status)}
                        </div>
                        {action.error_message && (
                          <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                            {action.error_message}
                          </div>
                        )}
                        <div className="text-[10px] text-muted-foreground">
                          {format(new Date(action.created_at), "dd MMM HH:mm", { locale: nl })}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
