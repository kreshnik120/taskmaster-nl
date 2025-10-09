import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Loader2, CheckCircle, Target, TrendingUp } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrainingChat } from "@/components/AITraining/TrainingChat";
import { DocumentUpload } from "@/components/AITraining/DocumentUpload";
import { KnowledgeOverview } from "@/components/AITraining/KnowledgeOverview";
import { SeedClientKnowledge } from "@/components/AITraining/SeedClientKnowledge";
import { LearningDashboard } from "@/components/AITraining/LearningDashboard";
import { SmartKnowledgeSearch } from "@/components/AITraining/SmartKnowledgeSearch";
import { ConflictResolutionPanel } from "@/components/AITraining/ConflictResolutionPanel";
import { ProfessionalClientLinks } from "@/components/AITraining/ProfessionalClientLinks";
import { SystemMonitor } from "@/components/SystemMonitor";
import { ManualFunctionTrigger } from "@/components/AITraining/ManualFunctionTrigger";
import { AdminOnly } from "@/components/auth/AdminOnly";
import { Week1To2TestPanel } from "@/components/AITraining/Week1To2TestPanel";
import { AlertTriageSystem } from "@/components/AITraining/AlertTriageSystem";
import { AlertPriorityRanker } from "@/components/AITraining/AlertPriorityRanker";
import { KnowledgeValidator } from "@/components/AITraining/KnowledgeValidator";
import { ValidationWorkflowGuide } from "@/components/AITraining/ValidationWorkflowGuide";

const AiTraining = () => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();

  // Fetch validation stats for banner
  const { data: stats } = useQuery({
    queryKey: ["validation-stats-banner"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_knowledge_base")
        .select("validation_status")
        .is("deleted_at", null);
      
      if (error) throw error;
      
      const unverified = data.filter(d => d.validation_status === "unverified").length;
      return { unverified };
    },
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
      } else {
        navigate("/auth");
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user);
      } else {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 p-6 overflow-auto">
          <SidebarTrigger className="mb-4" />
          <div className="max-w-6xl mx-auto space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">AI Training & Kennisbeheer</h1>
              <p className="text-muted-foreground">
                Train het AI systeem met bedrijfsspecifieke kennis en documenten
              </p>
            </div>

            <Tabs defaultValue="dashboard" className="w-full">
              <TabsList className="grid w-full grid-cols-9">
                <TabsTrigger value="dashboard">📊 Dashboard</TabsTrigger>
                <AdminOnly>
                  <TabsTrigger value="alerts">🚨 Alerts</TabsTrigger>
                </AdminOnly>
                <AdminOnly>
                  <TabsTrigger value="validation">📋 Validation</TabsTrigger>
                </AdminOnly>
                <TabsTrigger value="week1-2">🧪 Week 1-2</TabsTrigger>
                <AdminOnly>
                  <TabsTrigger value="system">🔧 Systeem</TabsTrigger>
                </AdminOnly>
                <TabsTrigger value="links">🔗 Links</TabsTrigger>
                <TabsTrigger value="conflicts">⚠️ Conflicten</TabsTrigger>
                <TabsTrigger value="training">💬 Training</TabsTrigger>
                <TabsTrigger value="knowledge">🗄️ Kennisbank</TabsTrigger>
              </TabsList>

              <TabsContent value="dashboard" className="mt-6">
                <LearningDashboard />
              </TabsContent>

              <AdminOnly>
                <TabsContent value="alerts" className="mt-6">
                  <Tabs defaultValue="triage" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="triage">Alert Triage</TabsTrigger>
                      <TabsTrigger value="priority">Priority Ranker</TabsTrigger>
                    </TabsList>
                    <TabsContent value="triage" className="mt-4">
                      <AlertTriageSystem />
                    </TabsContent>
                    <TabsContent value="priority" className="mt-4">
                      <AlertPriorityRanker />
                    </TabsContent>
                  </Tabs>
                </TabsContent>
              </AdminOnly>

              <AdminOnly>
                <TabsContent value="validation" className="mt-6">
                  {/* Validation Adoption Banner */}
                  <Card className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/20 mb-6">
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-blue-500 rounded-full">
                          <CheckCircle className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-lg mb-2">
                            🎯 Start met Valideren - Boost AI Kwaliteit!
                          </h3>
                          <p className="text-sm text-muted-foreground mb-3">
                            Er zijn <strong>{stats?.unverified || 0} unverified items</strong> klaar voor review. 
                            Begin met de "Quick Wins" filter voor items met 80%+ confidence - deze zijn het makkelijkst te valideren!
                          </p>
                          <div className="flex gap-2">
                            <Badge variant="outline" className="gap-1">
                              <Target className="h-3 w-3" />
                              Doel: 100 validaties deze week
                            </Badge>
                            <Badge variant="outline" className="gap-1">
                              <TrendingUp className="h-3 w-3" />
                              Impact: Directe kwaliteitsverbetering
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <ValidationWorkflowGuide />
                  <KnowledgeValidator />
                </TabsContent>
              </AdminOnly>

              <TabsContent value="week1-2" className="mt-6">
                <Week1To2TestPanel />
              </TabsContent>

              <AdminOnly>
                <TabsContent value="system" className="mt-6">
                  <div className="space-y-6">
                    <ManualFunctionTrigger />
                    <SystemMonitor />
                  </div>
                </TabsContent>
              </AdminOnly>

              <TabsContent value="links" className="mt-6 space-y-6">
                <ProfessionalClientLinks />
              </TabsContent>

              <TabsContent value="conflicts" className="mt-6">
                <ConflictResolutionPanel />
              </TabsContent>

              <TabsContent value="training" className="mt-6">
                <div className="space-y-6">
                  <TrainingChat />
                  <DocumentUpload />
                  <SeedClientKnowledge />
                </div>
              </TabsContent>

              <TabsContent value="knowledge" className="mt-6">
                <div className="space-y-6">
                  <SmartKnowledgeSearch />
                  <KnowledgeOverview />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default AiTraining;
