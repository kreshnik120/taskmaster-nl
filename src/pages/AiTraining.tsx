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
import { ProfessionalClientLinks } from "@/components/AITraining/ProfessionalClientLinks";
import { SystemMonitor } from "@/components/SystemMonitor";
import { ManualFunctionTrigger } from "@/components/AITraining/ManualFunctionTrigger";
import { AdminOnly } from "@/components/auth/AdminOnly";
import { MailgunDNSSetup } from "@/components/AITraining/MailgunDNSSetup";

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

            <Tabs defaultValue="dashboard" className="w-full">
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="dashboard">📊 Dashboard</TabsTrigger>
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
                <TabsContent value="system" className="mt-6">
                  <div className="space-y-6">
                    <MailgunDNSSetup />
                    <ManualFunctionTrigger />
                    <SystemMonitor />
                  </div>
                </TabsContent>
              </AdminOnly>

              <TabsContent value="links" className="mt-6">
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
