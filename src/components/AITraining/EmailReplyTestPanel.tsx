import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { InterviewFlowDiagram } from "./InterviewFlowDiagram";
import { BatchTestRunner } from "./BatchTestRunner";
import { 
  Send, 
  RefreshCw, 
  RotateCcw, 
  ChevronDown, 
  Mail, 
  User, 
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  FileText,
  Calendar,
  Target
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Application {
  id: string;
  email_from: string;
  email_subject: string;
  pipeline_stage: string;
  interview_status: string | null;
  completeness_score: number;
  missing_info: string[];
  extracted_data: Record<string, any>;
  created_at: string;
}

const EMAIL_TEMPLATES = {
  complete_intake: {
    label: "Complete Intake (telefoon + diploma)",
    subject: "Re: Welkom bij CitoZorg",
    body: "Hallo,\n\nMijn telefoonnummer is 06-87654321.\nIk heb mijn HBO-V diploma behaald in 2019.\n\nMet vriendelijke groet!"
  },
  slot_selection: {
    label: "Interview Slot Selectie",
    subject: "Re: Interview slots",
    body: "Slot 1 graag, dat past mij het beste."
  },
  partial_update: {
    label: "Alleen Telefoon",
    subject: "Re: Welkom",
    body: "Mijn nummer is 06-98765432."
  },
  invalid_phone: {
    label: "Placeholder Telefoon (test detectie)",
    subject: "Re: Test",
    body: "Je kunt mij bereiken op 06-12345678."
  },
  diploma_only: {
    label: "Alleen Diploma",
    subject: "Re: Documenten",
    body: "Ik heb een MBO-4 Verpleegkunde diploma uit 2020."
  }
};

export function EmailReplyTestPanel() {
  const [selectedAppId, setSelectedAppId] = useState<string>("");
  const [fromEmail, setFromEmail] = useState("");
  const [subject, setSubject] = useState("Re: Welkom bij CitoZorg");
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [responseOpen, setResponseOpen] = useState(false);

  // Fetch applications for selector
  const { data: applications, isLoading: appsLoading, refetch: refetchApps } = useQuery({
    queryKey: ["test-applications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professional_applications")
        .select("id, email_from, email_subject, pipeline_stage, interview_status, completeness_score, missing_info, extracted_data, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data as Application[];
    }
  });

  // Get selected application details
  const selectedApp = applications?.find(a => a.id === selectedAppId);

  // Auto-refresh every 5 seconds when sending
  useEffect(() => {
    if (isSending) {
      const interval = setInterval(() => refetchApps(), 5000);
      return () => clearInterval(interval);
    }
  }, [isSending, refetchApps]);

  // Update from email when app is selected
  useEffect(() => {
    if (selectedApp) {
      setFromEmail(selectedApp.email_from || "");
    }
  }, [selectedApp]);

  const loadTemplate = (templateKey: keyof typeof EMAIL_TEMPLATES) => {
    const template = EMAIL_TEMPLATES[templateKey];
    setSubject(template.subject);
    setBody(template.body);
  };

  const sendTestReply = async () => {
    if (!fromEmail || !body) {
      toast.error("Vul email en body in");
      return;
    }

    setIsSending(true);
    setLastResponse(null);

    try {
      const { data, error } = await supabase.functions.invoke('handle-application-reply', {
        body: {
          type: 'email.received',
          data: {
            from: fromEmail,
            subject: subject,
            text: body,
            to: ['sollicitaties@citozorg.nl']
          }
        }
      });

      if (error) throw error;

      setLastResponse(data);
      setResponseOpen(true);
      toast.success("Test email verstuurd en verwerkt!");
      
      // Refresh application data
      await refetchApps();
    } catch (err: any) {
      console.error("Send error:", err);
      setLastResponse({ error: err.message });
      setResponseOpen(true);
      toast.error(`Fout: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const resetApplication = async () => {
    if (!selectedAppId) {
      toast.error("Selecteer eerst een applicatie");
      return;
    }

    setIsResetting(true);
    try {
      const { error } = await supabase
        .from('professional_applications')
        .update({
          completeness_score: 87,
          interview_status: null,
          pipeline_stage: 'nieuw',
          missing_info: ['telefoonnummer (echt nummer, geen placeholder)']
        })
        .eq('id', selectedAppId);

      if (error) throw error;

      // Cancel any pending agent goals
      await supabase
        .from('agent_goals')
        .update({ status: 'cancelled' })
        .eq('input_data->>application_id', selectedAppId)
        .in('status', ['pending', 'running']);

      toast.success("Applicatie gereset naar initial state");
      await refetchApps();
    } catch (err: any) {
      toast.error(`Reset fout: ${err.message}`);
    } finally {
      setIsResetting(false);
    }
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case "nieuw": return "bg-gray-500";
      case "interview": return "bg-blue-500";
      case "screening": return "bg-orange-500";
      case "goedgekeurd": return "bg-green-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email Reply Test Panel
        </CardTitle>
        <CardDescription>
          Test handle-application-reply met custom emails en monitor de resultaten
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="composer" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="composer">Email Composer</TabsTrigger>
            <TabsTrigger value="flow">Interview Flow</TabsTrigger>
            <TabsTrigger value="batch">Batch Testing</TabsTrigger>
          </TabsList>

          {/* EMAIL COMPOSER TAB */}
          <TabsContent value="composer" className="mt-4 space-y-4">
            {/* Application Selector */}
            <div className="space-y-2">
              <Label>Selecteer Applicatie</Label>
              <Select value={selectedAppId} onValueChange={setSelectedAppId}>
                <SelectTrigger>
                  <SelectValue placeholder="Kies een applicatie..." />
                </SelectTrigger>
                <SelectContent>
                  {applications?.map(app => {
                    const naam = app.extracted_data?.naam || app.extracted_data?.voornaam || app.email_from?.split('@')[0] || "Onbekend";
                    return (
                      <SelectItem key={app.id} value={app.id}>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          <span>{naam}</span>
                          <Badge variant="outline" className="ml-2 text-xs">
                            {app.completeness_score}%
                          </Badge>
                          <Badge className={cn("text-xs text-white", getStageColor(app.pipeline_stage))}>
                            {app.pipeline_stage}
                          </Badge>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Selected Application Details */}
            {selectedApp && (
              <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">
                    {selectedApp.extracted_data?.naam || selectedApp.extracted_data?.voornaam || selectedApp.email_from?.split('@')[0] || "Onbekend"}
                  </h4>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={resetApplication}
                      disabled={isResetting}
                      className="gap-1"
                    >
                      {isResetting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3" />
                      )}
                      Reset
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetchApps()}
                      className="gap-1"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Refresh
                    </Button>
                  </div>
                </div>
                
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Completeness</p>
                    <div className="flex items-center gap-2">
                      <Progress value={selectedApp.completeness_score} className="h-2 flex-1" />
                      <span className="text-sm font-medium">{selectedApp.completeness_score}%</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pipeline Stage</p>
                    <Badge className={cn("text-white", getStageColor(selectedApp.pipeline_stage))}>
                      {selectedApp.pipeline_stage}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Interview Status</p>
                    <Badge variant="outline">
                      {selectedApp.interview_status || "geen"}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Missing Info</p>
                    {selectedApp.missing_info?.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {selectedApp.missing_info.slice(0, 2).map((item, i) => (
                          <Badge key={i} variant="destructive" className="text-[10px]">
                            {item.substring(0, 20)}...
                          </Badge>
                        ))}
                        {selectedApp.missing_info.length > 2 && (
                          <Badge variant="outline" className="text-[10px]">
                            +{selectedApp.missing_info.length - 2}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-green-600">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Compleet
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Template Presets */}
            <div className="space-y-2">
              <Label>Quick Templates</Label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(EMAIL_TEMPLATES).map(([key, template]) => (
                  <Button
                    key={key}
                    variant="outline"
                    size="sm"
                    onClick={() => loadTemplate(key as keyof typeof EMAIL_TEMPLATES)}
                  >
                    {template.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Email Form */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>From Email</Label>
                  <Input
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    placeholder="sollicitant@email.nl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Re: Welkom bij CitoZorg"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Body</Label>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Type je test email reply hier..."
                  rows={6}
                />
              </div>
            </div>

            {/* Send Button */}
            <Button 
              onClick={sendTestReply} 
              disabled={isSending || !fromEmail || !body}
              className="w-full gap-2"
            >
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Versturen...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Verstuur Test Reply
                </>
              )}
            </Button>

            {/* Response Log */}
            {lastResponse && (
              <Collapsible open={responseOpen} onOpenChange={setResponseOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Response Log
                    </span>
                    <ChevronDown className={cn("h-4 w-4 transition-transform", responseOpen && "rotate-180")} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ScrollArea className="h-[200px] mt-2 border rounded-lg">
                    <pre className="p-3 text-xs font-mono">
                      {JSON.stringify(lastResponse, null, 2)}
                    </pre>
                  </ScrollArea>
                </CollapsibleContent>
              </Collapsible>
            )}
          </TabsContent>

          {/* INTERVIEW FLOW TAB */}
          <TabsContent value="flow" className="mt-4 space-y-4">
            {selectedApp ? (
              <>
                <div className="p-4 border rounded-lg bg-muted/30">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Interview Pipeline voor {selectedApp.extracted_data?.naam || selectedApp.email_from?.split('@')[0] || "Onbekend"}
                  </h4>
                  <InterviewFlowDiagram
                    pipelineStage={selectedApp.pipeline_stage}
                    interviewStatus={selectedApp.interview_status}
                    completenessScore={selectedApp.completeness_score}
                    missingInfo={selectedApp.missing_info || []}
                  />
                </div>

                {/* Extracted Data Preview */}
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Extracted Data
                      </span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ScrollArea className="h-[300px] mt-2 border rounded-lg">
                      <pre className="p-3 text-xs font-mono">
                        {JSON.stringify(selectedApp.extracted_data, null, 2)}
                      </pre>
                    </ScrollArea>
                  </CollapsibleContent>
                </Collapsible>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Calendar className="h-12 w-12 mb-4" />
                <p>Selecteer eerst een applicatie om de flow te zien</p>
              </div>
            )}
          </TabsContent>

          {/* BATCH TESTING TAB */}
          <TabsContent value="batch" className="mt-4">
            <BatchTestRunner
              applicationId={selectedAppId || null}
              applicationEmail={selectedApp?.email_from || null}
              onRefresh={refetchApps}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
