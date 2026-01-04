import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { KPICard } from "@/components/ui/kpi-card";
import { Inbox, Users, Building2, Link } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function RecruitmentKPIs() {
  const navigate = useNavigate();

  const { data: recruitmentStats, isLoading } = useQuery({
    queryKey: ["recruitment-stats"],
    queryFn: async () => {
      const [applicationsRes, professionalsRes, clientsRes, placementsRes] = await Promise.all([
        supabase
          .from("professional_applications")
          .select("id, pipeline_stage", { count: "exact" })
          .is("deleted_at", null),
        supabase
          .from("professionals")
          .select("id", { count: "exact" })
          .is("deleted_at", null),
        supabase
          .from("client_sublocations")
          .select("id", { count: "exact" })
          .eq("is_active", true),
        supabase
          .from("professional_clients")
          .select("id", { count: "exact" })
          .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      ]);

      const newApplications = applicationsRes.data?.filter(a => a.pipeline_stage === "nieuw" || a.pipeline_stage === "intake_verstuurd").length || 0;
      
      return {
        newApplications,
        totalApplications: applicationsRes.count || 0,
        activeProfessionals: professionalsRes.count || 0,
        totalClients: clientsRes.count || 0,
        placementsThisMonth: placementsRes.count || 0,
      };
    },
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  if (isLoading || !recruitmentStats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 bg-muted/50 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KPICard
        icon={Inbox}
        title="Sollicitaties"
        value={recruitmentStats.newApplications}
        subtitle={`${recruitmentStats.totalApplications} totaal`}
        variant="count"
        onClick={() => navigate("/sollicitaties")}
      />
      <KPICard
        icon={Users}
        title="Professionals"
        value={recruitmentStats.activeProfessionals}
        subtitle="actief"
        variant="success"
        onClick={() => navigate("/professionals")}
      />
      <KPICard
        icon={Building2}
        title="Klanten"
        value={recruitmentStats.totalClients}
        subtitle="totaal"
        variant="time"
        onClick={() => navigate("/klanten")}
      />
      <KPICard
        icon={Link}
        title="Plaatsingen"
        value={recruitmentStats.placementsThisMonth}
        subtitle="deze maand"
        variant="urgent"
        onClick={() => navigate("/plaatsingen")}
      />
    </div>
  );
}
