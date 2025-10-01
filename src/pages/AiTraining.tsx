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

            <Tabs defaultValue="chat" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="chat">Training Chat</TabsTrigger>
                <TabsTrigger value="documents">Documenten</TabsTrigger>
                <TabsTrigger value="knowledge">Kennisbank</TabsTrigger>
              </TabsList>

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
