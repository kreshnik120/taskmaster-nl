import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SECTOR_SIMILARITY, functieMatchesAny } from "@/lib/constants/matchingConstants";

interface Application {
  id: string;
  email_from: string;
  extracted_data: any;
  completeness_score: number | null;
  pipeline_stage: string;
}

interface Client {
  id: string;
  name: string;
  company: string;
  regio: string[] | null;
  sector: string[] | null;
  doelgroep: string[] | null;
  gezochte_functies: string[] | null;
  org_id: string;
}

// Simple match score calculator for notifications
function calculateQuickMatchScore(application: Application, client: Client): number {
  let score = 0;
  const extractedData = application.extracted_data || {};
  
  // Regio match (30 points)
  const applicantRegio = extractedData.regio?.toLowerCase() || '';
  const clientRegios = (client.regio || []).map((r: string) => r.toLowerCase());
  if (clientRegios.some((r: string) => r.includes(applicantRegio) || applicantRegio.includes(r))) {
    score += 30;
  }
  
  // Sector match (25 points)
  const applicantSectoren = extractedData.ervaring_sector || [];
  const clientSectoren = client.sector || [];
  const sectorOverlap = applicantSectoren.filter((s: string) => 
    clientSectoren.some((cs: string) => cs.toLowerCase() === s.toLowerCase())
  );
  if (sectorOverlap.length > 0) {
    score += 25;
  } else {
    // Check related sectors
    for (const appSector of applicantSectoren) {
      const similarity = SECTOR_SIMILARITY[appSector];
      if (similarity?.related.some((r: string) => clientSectoren.includes(r))) {
        score += 15;
        break;
      }
    }
  }
  
  // Functie match (20 points)
  const applicantFunctie = extractedData.functie_niveau;
  const clientFuncties = client.gezochte_functies || [];
  if (functieMatchesAny(applicantFunctie, clientFuncties)) {
    score += 20;
  }
  
  // Doelgroep match (15 points)
  const applicantDoelgroepen = extractedData.doelgroep_ervaring || [];
  const clientDoelgroepen = client.doelgroep || [];
  if (applicantDoelgroepen.some((d: string) => clientDoelgroepen.includes(d))) {
    score += 15;
  }
  
  // Completeness bonus (10 points max)
  const completeness = application.completeness_score || 0;
  score += Math.min(10, completeness / 10);
  
  return score;
}

export function useProactiveMatchNotifications(
  onApplicationClick?: (applicationId: string) => void
) {
  const clientsCache = useRef<Client[]>([]);
  const notifiedApplicationIds = useRef<Set<string>>(new Set());

  // Load clients once
  useEffect(() => {
    const loadClients = async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, name, company, regio, sector, doelgroep, gezochte_functies, org_id")
        .eq("is_active", true);
      
      if (data) {
        clientsCache.current = data;
      }
    };
    loadClients();
  }, []);

  // Subscribe to new applications
  useEffect(() => {
    const channel = supabase
      .channel('proactive-match-notifications')
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'professional_applications' 
        },
        async (payload) => {
          const newApp = payload.new as Application;
          
          // Skip if already notified
          if (notifiedApplicationIds.current.has(newApp.id)) return;
          
          // Skip if low completeness
          if ((newApp.completeness_score || 0) < 50) return;
          
          // Find best match
          const matches = clientsCache.current
            .map(client => ({
              client,
              score: calculateQuickMatchScore(newApp, client)
            }))
            .filter(m => m.score >= 70)
            .sort((a, b) => b.score - a.score);
          
          if (matches.length > 0) {
            const bestMatch = matches[0];
            const candidateName = newApp.extracted_data?.naam || newApp.email_from;
            
            notifiedApplicationIds.current.add(newApp.id);
            
            toast.success(`🌟 Nieuwe match gevonden!`, {
              description: `${candidateName} (${bestMatch.score}% match met ${bestMatch.client.name || bestMatch.client.company})`,
              action: onApplicationClick ? {
                label: "Bekijk",
                onClick: () => onApplicationClick(newApp.id)
              } : undefined,
              duration: 8000,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onApplicationClick]);
}
