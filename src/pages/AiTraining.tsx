import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Loader2, CheckCircle, Target, TrendingUp, BarChart3, Coins, Settings, Database, MessageSquare } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot, Sparkles } from "lucide-react";
import { ChatWidget } from "@/components/AIAssistant/ChatWidget";
import { DocumentUpload } from "@/components/AITraining/DocumentUpload";
import { KnowledgeOverview } from "@/components/AITraining/KnowledgeOverview";
import { SeedClientKnowledge } from "@/components/AITraining/SeedClientKnowledge";
import { LearningDashboard } from "@/components/AITraining/LearningDashboard";
import { SmartKnowledgeSearch } from "@/components/AITraining/SmartKnowledgeSearch";
import { ConflictResolutionPanel } from "@/components/AITraining/ConflictResolutionPanel";
import { ConflictMonitor } from "@/components/AITraining/ConflictMonitor";
import { ProfessionalClientLinks } from "@/components/AITraining/ProfessionalClientLinks";
import { AdminOnly } from "@/components/auth/AdminOnly";
import { Week1To2TestPanel } from "@/components/AITraining/Week1To2TestPanel";
import { AlertTriageSystem } from "@/components/AITraining/AlertTriageSystem";
import { AlertPriorityRanker } from "@/components/AITraining/AlertPriorityRanker";
import { KnowledgeValidator } from "@/components/AITraining/KnowledgeValidator";
import { ValidationWorkflowGuide } from "@/components/AITraining/ValidationWorkflowGuide";
import { ValidationOnboardingWizard } from "@/components/AITraining/ValidationOnboardingWizard";
import { AutoResolveMonitor } from "@/components/AITraining/AutoResolveMonitor";
import { AutoLearnedKnowledgeDashboard } from "@/components/AITraining/AutoLearnedKnowledgeDashboard";
import { BudgetDashboard } from "@/components/AITraining/BudgetDashboard";
import { BudgetConfiguration } from "@/components/AITraining/BudgetConfiguration";
import { CleanupDeletedKnowledge } from "@/components/AITraining/CleanupDeletedKnowledge";

import { ManualFunctionTrigger } from "@/components/AITraining/ManualFunctionTrigger";
import { SystemHealthDashboard } from "@/components/AITraining/SystemHealthDashboard";
import { EmbeddingCoverageDashboard } from "@/components/AITraining/EmbeddingCoverageDashboard";
import { KvKCostDashboard } from "@/components/AITraining/KvKCostDashboard";
import { CleanupDuplicateFields } from "@/components/AITraining/CleanupDuplicateFields";
import { SystemLearningDashboard } from "@/components/AITraining/SystemLearningDashboard";
import { EvaluationLearningWidget } from "@/components/AITraining/EvaluationLearningWidget";
import { toast } from "sonner";

const AiTraining = () => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [seedLoading, setSeedLoading] = useState(false);
  const navigate = useNavigate();

  // ⚡ EFFICIENT BANNER QUERY: Server-side HEAD count (uses idx_ai_knowledge_validation_deleted)
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ["validation-stats-banner"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("ai_knowledge_base")
        .select("*", { count: "exact", head: true })
        .eq("validation_status", "unverified")
        .is("deleted_at", null);
      
      if (error) {
        console.error("⚠️ Failed to fetch validation stats:", error.code, error.message);
        return { unverified: 0 };
      }
      
      return { unverified: count || 0 };
    },
    staleTime: 60000, // ⚡ CACHE: 60s
  });

  const handleSeedOrgProfiles = async () => {
    setSeedLoading(true);
    try {
      // ✅ Haal huidige session + token op
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.error('❌ No active session:', sessionError);
        toast.error('Niet ingelogd. Log opnieuw in.');
        setSeedLoading(false);
        return;
      }

      console.log('🌱 Starting org-profile seed with auth token...');
      
      // ✅ Expliciet Authorization header meesturen
      const { data, error } = await supabase.functions.invoke('seed-org-profile-knowledge', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      
      if (error) {
        console.error('❌ Seed error:', error);
        toast.error(`Seed mislukt: ${error.message}`);
        return;
      }
      
      console.log('✅ Seed success:', data);
      toast.success(`✅ ${data.created || 0} org-profiles gemigreerd. ${data.errors?.length || 0} fouten.`);
      
      // Refresh validation stats
      refetchStats();
    } catch (err: any) {
      console.error('❌ Unexpected seed error:', err);
      toast.error(`Onverwachte fout: ${err.message}`);
    } finally {
      setSeedLoading(false);
    }
  };

  useEffect(() => {
    // ⚡ AUTH FALLBACK: Prevent infinite spinner on slow auth
    const fallbackTimer = setTimeout(() => {
      console.warn("⚠️ Auth check timeout - showing page anyway");
      setLoading(false);
    }, 10000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(fallbackTimer);
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
    <>
      <ValidationOnboardingWizard />
      <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold">AI Training</h1>
              <p className="text-muted-foreground text-sm">
                Kennisbeheer en AI training dashboard
              </p>
            </div>

            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="overview" className="gap-2">
                  <BarChart3 className="h-4 w-4" /> Overzicht
                </TabsTrigger>
                <TabsTrigger value="budget" className="gap-2">
                  <Coins className="h-4 w-4" /> Budget
                </TabsTrigger>
                <TabsTrigger value="management" className="gap-2">
                  <Settings className="h-4 w-4" /> Beheer
                </TabsTrigger>
                <TabsTrigger value="knowledge" className="gap-2">
                  <Database className="h-4 w-4" /> Kennis
                </TabsTrigger>
                <TabsTrigger value="training" className="gap-2">
                  <MessageSquare className="h-4 w-4" /> Training
                </TabsTrigger>
              </TabsList>

              {/* 📊 OVERZICHT */}
              <TabsContent value="overview" className="mt-6">
                <Tabs defaultValue="dashboard" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                    <TabsTrigger value="health">Systeem Health</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="dashboard" className="mt-4">
                    <div className="space-y-6">
                      <AutoResolveMonitor />
                      <EvaluationLearningWidget />
                      <SystemLearningDashboard />
                      <AutoLearnedKnowledgeDashboard />
                      <LearningDashboard />
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="health" className="mt-4">
                    <div className="space-y-6">
                      <EmbeddingCoverageDashboard />
                      <SystemHealthDashboard />
                    </div>
                  </TabsContent>
                </Tabs>
              </TabsContent>

              {/* 💰 BUDGET */}
              <TabsContent value="budget" className="mt-6">
                <div className="space-y-6">
                  <BudgetDashboard />
                  <AdminOnly>
                    <BudgetConfiguration />
                  </AdminOnly>
                </div>
              </TabsContent>

              {/* 🔧 BEHEER (AdminOnly) */}
              <TabsContent value="management" className="mt-6">
                <AdminOnly fallback={
                  <Card className="p-8 text-center">
                    <p className="text-muted-foreground">Alleen toegankelijk voor administrators</p>
                  </Card>
                }>
                  <Tabs defaultValue="validation" className="w-full">
                    <TabsList className="grid w-full grid-cols-5">
                      <TabsTrigger value="validation">Validation</TabsTrigger>
                      <TabsTrigger value="alerts">Alerts</TabsTrigger>
                      <TabsTrigger value="kvk">KVK API</TabsTrigger>
                      <TabsTrigger value="week1-2">Week 1-2 Test</TabsTrigger>
                      <TabsTrigger value="cleanup">Cleanup</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="validation" className="mt-4">
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
                    
                    <TabsContent value="alerts" className="mt-4">
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
                    
                    <TabsContent value="kvk" className="mt-4">
                      <Card className="mb-6">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            💼 KVK API Cost Optimization
                          </CardTitle>
                          <CardDescription>
                            Smart caching strategie: Database First → KVK Cache → KVK API (€0.30)
                          </CardDescription>
                        </CardHeader>
                      </Card>
                      <KvKCostDashboard />
                    </TabsContent>
                    
                    <TabsContent value="week1-2" className="mt-4">
                      <Week1To2TestPanel />
                    </TabsContent>
                    
                    <TabsContent value="cleanup" className="mt-4">
                      <div className="space-y-6">
                        <CleanupDuplicateFields />
                        <CleanupDeletedKnowledge />
                      </div>
                    </TabsContent>
                  </Tabs>
                </AdminOnly>
              </TabsContent>

              {/* 🗄️ KENNIS */}
              <TabsContent value="knowledge" className="mt-6">
                <Tabs defaultValue="search" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="search">Zoeken</TabsTrigger>
                    <TabsTrigger value="conflicts">Conflicten</TabsTrigger>
                    <TabsTrigger value="links">Links</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="search" className="mt-4">
                    <div className="space-y-6">
                      <SmartKnowledgeSearch />
                      <KnowledgeOverview />
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="conflicts" className="mt-4">
                    <div className="space-y-6">
                      <ConflictMonitor />
                      <ConflictResolutionPanel />
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="links" className="mt-4">
                    <ProfessionalClientLinks />
                  </TabsContent>
                </Tabs>
              </TabsContent>

              {/* 💬 TRAINING */}
              <TabsContent value="training" className="mt-6">
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Bot className="h-5 w-5" />
                        AI Training Chat
                      </CardTitle>
                      <CardDescription>
                        Train de AI door vragen te stellen en correcties te geven. Je antwoorden worden automatisch opgeslagen in de knowledge base.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="border rounded-lg p-4 bg-muted/30">
                        <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
                          <Sparkles className="h-4 w-4" />
                          <span>Training modus actief - je correcties worden automatisch opgeslagen</span>
                        </div>
                        <ChatWidget embedded={true} trainingMode={true} />
                      </div>
                    </CardContent>
                  </Card>
                  
                  <DocumentUpload />
                  <SeedClientKnowledge />
                  
                  <AdminOnly>
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Sparkles className="h-5 w-5" />
                          🌱 Organisatiegegevens Seeden
                        </CardTitle>
                        <CardDescription>
                          Migreer org_profiles (ABCzorg, CitoZorg) naar AI knowledge base voor accurate bedrijfsinformatie
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex flex-col gap-2">
                          <p className="text-sm text-muted-foreground">
                            Dit proces:
                          </p>
                          <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                            <li>Haalt KvK, bedrijfstype, domeinen uit org_profiles</li>
                            <li>Maakt verified knowledge items (category='org_profile')</li>
                            <li>Genereert embeddings voor semantic search</li>
                            <li>Duurt ~30-60 seconden</li>
                          </ul>
                        </div>
                        <Button 
                          onClick={handleSeedOrgProfiles}
                          disabled={seedLoading}
                          className="w-full"
                        >
                          {seedLoading ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Seeding...
                            </>
                          ) : (
                            <>
                              <Sparkles className="mr-2 h-4 w-4" />
                              Seed Nu
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                    
                    <ManualFunctionTrigger hideBackfill />
                  </AdminOnly>
                </div>
              </TabsContent>
            </Tabs>
          </div>
    </>
  );
};

export default AiTraining;
