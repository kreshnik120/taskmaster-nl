import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Plug, 
  Send, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Mail, 
  Calendar,
  FileText,
  Loader2
} from "lucide-react";

type ActionType = 
  | "send_followup_question" 
  | "send_interview_email" 
  | "send_document_request" 
  | "send_general_email" 
  | "create_calendar_event";

interface TestResult {
  timestamp: string;
  actionType: ActionType;
  status: "success" | "error" | "pending";
  response?: Record<string, unknown>;
  error?: string;
}

const ACTION_CONFIG: Record<ActionType, { label: string; icon: React.ReactNode; description: string }> = {
  send_followup_question: {
    label: "Followup Vraag",
    icon: <Mail className="h-4 w-4" />,
    description: "Stuur een vervolgvraag naar kandidaat"
  },
  send_interview_email: {
    label: "Interview Email",
    icon: <Calendar className="h-4 w-4" />,
    description: "Stuur interview uitnodiging"
  },
  send_document_request: {
    label: "Document Verzoek",
    icon: <FileText className="h-4 w-4" />,
    description: "Vraag documenten op bij kandidaat"
  },
  send_general_email: {
    label: "Algemene Email",
    icon: <Mail className="h-4 w-4" />,
    description: "Stuur algemene email"
  },
  create_calendar_event: {
    label: "Calendar Event",
    icon: <Calendar className="h-4 w-4" />,
    description: "Maak een agenda afspraak"
  }
};

export function N8nIntegrationTestPanel() {
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"unknown" | "connected" | "error">("unknown");
  const [selectedAction, setSelectedAction] = useState<ActionType>("send_followup_question");
  const [testEmail, setTestEmail] = useState("");
  const [testSubject, setTestSubject] = useState("Test vanuit Lovable");
  const [testBody, setTestBody] = useState("Dit is een test bericht om de n8n integratie te verifiëren.");
  const [isSending, setIsSending] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    try {
      const { data, error } = await supabase.functions.invoke("n8n-webhook-bridge", {
        body: { action: "test" }  // Fixed: was "test_connection", must be "test"
      });

      if (error) throw error;

      // Fixed: check for status === 'connected' instead of success
      if (data?.status === "connected") {
        setConnectionStatus("connected");
        toast.success("n8n verbinding succesvol!");
      } else if (data?.status === "not_configured") {
        setConnectionStatus("error");
        toast.error("N8N_WEBHOOK_URL secret niet geconfigureerd");
      } else {
        setConnectionStatus("error");
        toast.error(data?.message || data?.error || "Verbinding mislukt");
      }
    } catch (err) {
      setConnectionStatus("error");
      toast.error(`Verbinding mislukt: ${err instanceof Error ? err.message : "Onbekende fout"}`);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSendTestAction = async () => {
    if (!testEmail) {
      toast.error("Vul een test email adres in");
      return;
    }

    setIsSending(true);
    const newResult: TestResult = {
      timestamp: new Date().toISOString(),
      actionType: selectedAction,
      status: "pending"
    };
    setTestResults(prev => [newResult, ...prev]);

    try {
      const inputData: Record<string, string> = {
        to_email: testEmail,
        subject: testSubject,
        body: `<p>${testBody}</p>`,
        candidate_name: "Test Kandidaat"
      };

      // Add calendar-specific fields if needed
      if (selectedAction === "create_calendar_event") {
        const startTime = new Date();
        startTime.setHours(startTime.getHours() + 24);
        const endTime = new Date(startTime);
        endTime.setHours(endTime.getHours() + 1);
        
        inputData.start_time = startTime.toISOString();
        inputData.end_time = endTime.toISOString();
      }

      const { data, error } = await supabase.functions.invoke("n8n-webhook-bridge", {
        body: {
          action: "trigger",
          action_type: selectedAction,
          input_data: inputData
        }
      });

      if (error) throw error;

      setTestResults(prev => 
        prev.map((r, i) => 
          i === 0 ? { ...r, status: "success", response: data } : r
        )
      );
      toast.success(`${ACTION_CONFIG[selectedAction].label} verzonden!`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Onbekende fout";
      setTestResults(prev => 
        prev.map((r, i) => 
          i === 0 ? { ...r, status: "error", error: errorMessage } : r
        )
      );
      toast.error(`Actie mislukt: ${errorMessage}`);
    } finally {
      setIsSending(false);
    }
  };

  const getStatusBadge = (status: TestResult["status"]) => {
    switch (status) {
      case "success":
        return <Badge variant="default" className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Succes</Badge>;
      case "error":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Fout</Badge>;
      case "pending":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Bezig...</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="h-5 w-5" />
          n8n Integratie Test Panel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Connection Test */}
        <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
          <div className="flex-1">
            <p className="font-medium">Verbinding Status</p>
            <p className="text-sm text-muted-foreground">
              Test de verbinding met n8n webhook
            </p>
          </div>
          <div className="flex items-center gap-2">
            {connectionStatus === "connected" && (
              <Badge variant="default" className="bg-green-500">
                <CheckCircle2 className="h-3 w-3 mr-1" />Verbonden
              </Badge>
            )}
            {connectionStatus === "error" && (
              <Badge variant="destructive">
                <XCircle className="h-3 w-3 mr-1" />Fout
              </Badge>
            )}
            <Button 
              variant="outline" 
              onClick={handleTestConnection}
              disabled={isTestingConnection}
            >
              {isTestingConnection ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plug className="h-4 w-4 mr-2" />
              )}
              Test Verbinding
            </Button>
          </div>
        </div>

        {/* Action Type Selector */}
        <div className="space-y-2">
          <Label>Action Type</Label>
          <Select value={selectedAction} onValueChange={(v) => setSelectedAction(v as ActionType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ACTION_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    {config.icon}
                    <span>{config.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {ACTION_CONFIG[selectedAction].description}
          </p>
        </div>

        {/* Test Form */}
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="test-email">Test Email Adres</Label>
            <Input
              id="test-email"
              type="email"
              placeholder="test@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="test-subject">Onderwerp</Label>
            <Input
              id="test-subject"
              value={testSubject}
              onChange={(e) => setTestSubject(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="test-body">Bericht</Label>
            <Textarea
              id="test-body"
              value={testBody}
              onChange={(e) => setTestBody(e.target.value)}
              rows={3}
            />
          </div>

          <Button 
            onClick={handleSendTestAction} 
            disabled={isSending || !testEmail}
            className="w-full"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Verstuur Test {ACTION_CONFIG[selectedAction].label}
          </Button>
        </div>

        {/* Test Results */}
        {testResults.length > 0 && (
          <div className="space-y-2">
            <Label>Test Resultaten</Label>
            <ScrollArea className="h-48 rounded-lg border">
              <div className="p-4 space-y-3">
                {testResults.map((result, index) => (
                  <div 
                    key={index} 
                    className="flex items-start justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {ACTION_CONFIG[result.actionType].icon}
                        <span className="font-medium text-sm">
                          {ACTION_CONFIG[result.actionType].label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(result.timestamp).toLocaleTimeString("nl-NL")}
                      </p>
                      {result.error && (
                        <p className="text-xs text-destructive">{result.error}</p>
                      )}
                    </div>
                    {getStatusBadge(result.status)}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
