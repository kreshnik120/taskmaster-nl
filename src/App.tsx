import { useState, useEffect } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { NotificationService } from "@/components/NotificationService";
import { ChatWidget } from "@/components/AIAssistant/ChatWidget";
import { supabase } from "@/integrations/supabase/client";
import UnifiedDashboard from "./pages/UnifiedDashboard";
import Auth from "./pages/Auth";
import Bijlagen from "./pages/Bijlagen";
import Notulen from "./pages/Notulen";
import Facturatie from "./pages/Facturatie";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Layout } from "./components/Layout";
import Kanban from "./pages/Kanban";
import Tijdregistratie from "./pages/Tijdregistratie";
import VerwijderdeTaken from "./pages/VerwijderdeTaken";
import AfgerondeTaken from "./pages/AfgerondeTaken";
import AiTraining from "./pages/AiTraining";
import Professionals from "./pages/Professionals";
import Sollicitaties from "./pages/Sollicitaties";
import SollicitatiesArchief from "./pages/SollicitatiesArchief";
import Klanten from "./pages/Klanten";
import Plaatsingen from "./pages/Plaatsingen";
import Gebruikers from "./pages/Gebruikers";
import NotFound from "./pages/NotFound";
import WhatsApp from "./pages/WhatsApp";

const queryClient = new QueryClient();

// ⚡ SMART SERVICE MOUNTING: Only mount when session exists
const GlobalServicesMounter = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted && session) {
        setReady(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (mounted) {
          setReady(!!session);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!ready) return null;

  return (
    <>
      <NotificationService />
      <ChatWidget />
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <div id="sonner-container">
        <Sonner />
      </div>
      <BrowserRouter>
        <GlobalServicesMounter />
        <Routes>
          <Route path="/auth" element={
            <ErrorBoundary fallbackTitle="Login pagina crashte">
              <Auth />
            </ErrorBoundary>
          } />
          
          {/* All authenticated routes wrapped in Layout */}
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/dashboard?tab=mijn-werk" replace />} />
            <Route path="/dashboard" element={<UnifiedDashboard />} />
            <Route path="/whatsapp" element={<WhatsApp />} />
            <Route path="/whatsapp/chat/:chatId" element={<WhatsApp />} />
            <Route path="/kanban/:taskId?" element={<Kanban />} />
            <Route path="/lijst" element={<Navigate to="/dashboard?tab=lijst" replace />} />
            <Route path="/kalender" element={<Navigate to="/dashboard?tab=kalender" replace />} />
            <Route path="/tijdregistratie" element={<Tijdregistratie />} />
            <Route path="/opvolging" element={<Navigate to="/dashboard?tab=opvolging" replace />} />
            <Route path="/verwijderd" element={<VerwijderdeTaken />} />
            <Route path="/afgerond" element={<AfgerondeTaken />} />
            <Route path="/ai-training" element={<AiTraining />} />
            <Route path="/professionals" element={<Professionals />} />
            <Route path="/sollicitaties" element={<Sollicitaties />} />
            <Route path="/sollicitaties/archief" element={<SollicitatiesArchief />} />
            <Route path="/klanten" element={<Klanten />} />
            <Route path="/plaatsingen" element={<Plaatsingen />} />
            <Route path="/gebruikers" element={<Gebruikers />} />
            <Route path="/bijlagen" element={<Bijlagen />} />
            <Route path="/notulen" element={<Notulen />} />
            <Route path="/facturatie" element={<Facturatie />} />
          </Route>
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
