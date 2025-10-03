import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrainingChat } from "@/components/AITraining/TrainingChat";
import { DocumentUpload } from "@/components/AITraining/DocumentUpload";
import { KnowledgeOverview } from "@/components/AITraining/KnowledgeOverview";
import { SeedClientKnowledge } from "@/components/AITraining/SeedClientKnowledge";
import { LearningDashboard } from "@/components/AITraining/LearningDashboard";
import { SmartKnowledgeSearch } from "@/components/AITraining/SmartKnowledgeSearch";
import { ConflictResolutionPanel } from "@/components/AITraining/ConflictResolutionPanel";
import { PerformanceMetrics } from "@/components/AITraining/PerformanceMetrics";
import { SystemMonitor } from "@/components/SystemMonitor";
import { ManualFunctionTrigger } from "@/components/AITraining/ManualFunctionTrigger";

const AiTraining = () => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();

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

            <Tabs defaultValue="monitor" className="w-full">
              <TabsList className="grid w-full grid-cols-8">
                <TabsTrigger value="monitor">🚀 Monitor</TabsTrigger>
                <TabsTrigger value="dashboard">📊 Dashboard</TabsTrigger>
                <TabsTrigger value="metrics">📈 Metrics</TabsTrigger>
                <TabsTrigger value="conflicts">⚠️ Conflicten</TabsTrigger>
                <TabsTrigger value="search">🔍 Zoeken</TabsTrigger>
                <TabsTrigger value="chat">💬 Training</TabsTrigger>
                <TabsTrigger value="documents">📄 Docs</TabsTrigger>
                <TabsTrigger value="knowledge">🗄️ Kennis</TabsTrigger>
              </TabsList>

              <TabsContent value="monitor" className="mt-6">
                <div className="space-y-6">
                  <ManualFunctionTrigger />
                  <SystemMonitor />
                </div>
              </TabsContent>

              <TabsContent value="dashboard" className="mt-6">
                <LearningDashboard />
              </TabsContent>

              <TabsContent value="metrics" className="mt-6">
                <PerformanceMetrics />
              </TabsContent>

              <TabsContent value="conflicts" className="mt-6">
                <ConflictResolutionPanel />
              </TabsContent>

              <TabsContent value="search" className="mt-6">
                <SmartKnowledgeSearch />
              </TabsContent>

              <TabsContent value="chat" className="mt-6">
                <TrainingChat />
              </TabsContent>

              <TabsContent value="documents" className="mt-6">
                <DocumentUpload />
              </TabsContent>

              <TabsContent value="knowledge" className="mt-6">
                <div className="space-y-6">
                  <SeedClientKnowledge />
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
