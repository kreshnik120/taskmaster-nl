import React, { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { NotificationService } from "@/components/NotificationService";
import { ChatWidget } from "@/components/AIAssistant/ChatWidget";
import { supabase } from "@/integrations/supabase/client";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Kanban from "./pages/Kanban";
import Lijst from "./pages/Lijst";
import Kalender from "./pages/Kalender";
import Tijdregistratie from "./pages/Tijdregistratie";
import Opvolging from "./pages/Opvolging";
import VerwijderdeTaken from "./pages/VerwijderdeTaken";
import AfgerondeTaken from "./pages/AfgerondeTaken";
import AiTraining from "./pages/AiTraining";
import Professionals from "./pages/Professionals";
import Sollicitaties from "./pages/Sollicitaties";
import NotFound from "./pages/NotFound";

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
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <GlobalServicesMounter />
        <Routes>
          <Route path="/" element={<Index />} />
            <Route path="/auth" element={
              <ErrorBoundary fallbackTitle="Login pagina crashte">
                <Auth />
              </ErrorBoundary>
            } />
          <Route path="/kanban/:taskId?" element={<Kanban />} />
          <Route path="/lijst" element={<Lijst />} />
          <Route path="/kalender" element={<Kalender />} />
          <Route path="/tijdregistratie" element={<Tijdregistratie />} />
          <Route path="/opvolging" element={<Opvolging />} />
          <Route path="/verwijderd" element={<VerwijderdeTaken />} />
          <Route path="/afgerond" element={<AfgerondeTaken />} />
          <Route path="/ai-training" element={<AiTraining />} />
          <Route path="/professionals" element={<Professionals />} />
          <Route path="/sollicitaties" element={<Sollicitaties />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
