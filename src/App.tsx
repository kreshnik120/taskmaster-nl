import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { NotificationService } from "@/components/NotificationService";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Kanban from "./pages/Kanban";
import Lijst from "./pages/Lijst";
import Kalender from "./pages/Kalender";
import Tijdregistratie from "./pages/Tijdregistratie";
import Opvolging from "./pages/Opvolging";
import VerwijderdeTaken from "./pages/VerwijderdeTaken";
import AfgerondeTaken from "./pages/AfgerondeTaken";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <NotificationService />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/kanban/:taskId?" element={<Kanban />} />
          <Route path="/lijst" element={<Lijst />} />
          <Route path="/kalender" element={<Kalender />} />
          <Route path="/tijdregistratie" element={<Tijdregistratie />} />
          <Route path="/opvolging" element={<Opvolging />} />
          <Route path="/verwijderd" element={<VerwijderdeTaken />} />
          <Route path="/afgerond" element={<AfgerondeTaken />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
