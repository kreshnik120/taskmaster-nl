import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Briefcase } from "lucide-react";
import { VacancyCard } from "./VacancyCard";
import { NewVacancyDialog } from "./NewVacancyDialog";
import { VacancyDetailModal } from "./VacancyDetailModal";

interface VacanciesPanelProps {
  sublocationId: string;
  sublocationName: string;
  gezochte_functies?: string[];
  sector?: string[];
  doelgroep?: string[];
}

interface VacancyWithCount {
  id: string;
  sublocation_id: string;
  titel: string;
  functie_niveau: string;
  aantal_fte: number | null;
  uren_per_week: number | null;
  uurtarief_indicatie: number | null;
  start_datum: string | null;
  eind_datum: string | null;
  deadline: string | null;
  vereiste_certificaten: string[];
  gewenste_sector_ervaring: string[];
  gewenste_doelgroep_ervaring: string[];
  beschrijving: string | null;
  status: string;
  urgentie: string;
  created_at: string;
  created_by: string | null;
  vacancy_applications: { count: number }[];
}

export function VacanciesPanel({
  sublocationId,
  sublocationName,
  gezochte_functies = [],
  sector = [],
  doelgroep = [],
}: VacanciesPanelProps) {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [selectedVacancy, setSelectedVacancy] = useState<VacancyWithCount | null>(null);

  const { data: vacancies, isLoading, refetch } = useQuery({
    queryKey: ["vacancies", sublocationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vacancies")
        .select(`
          *,
          vacancy_applications(count)
        `)
        .eq("sublocation_id", sublocationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as VacancyWithCount[];
    },
  });

  const openVacancies = vacancies?.filter(v => v.status === 'open') || [];
  const otherVacancies = vacancies?.filter(v => v.status !== 'open') || [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Briefcase className="h-4 w-4" />
          Vacatures ({openVacancies.length} open)
        </h3>
        <Button size="sm" onClick={() => setShowNewDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Nieuwe vacature
        </Button>
      </div>

      {vacancies?.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
          <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Geen vacatures voor deze locatie</p>
          <Button 
            variant="link" 
            className="mt-2"
            onClick={() => setShowNewDialog(true)}
          >
            Maak eerste vacature aan
          </Button>
        </div>
      ) : (
        <>
          {openVacancies.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Open vacatures</p>
              {openVacancies.map((vacancy) => (
                <VacancyCard
                  key={vacancy.id}
                  vacancy={{
                    ...vacancy,
                    applications_count: vacancy.vacancy_applications?.[0]?.count || 0,
                  } as any}
                  onClick={() => setSelectedVacancy(vacancy)}
                />
              ))}
            </div>
          )}

          {otherVacancies.length > 0 && (
            <div className="space-y-2 mt-4">
              <p className="text-sm font-medium text-muted-foreground">Overige vacatures</p>
              {otherVacancies.map((vacancy) => (
                <VacancyCard
                  key={vacancy.id}
                  vacancy={{
                    ...vacancy,
                    applications_count: vacancy.vacancy_applications?.[0]?.count || 0,
                  } as any}
                  onClick={() => setSelectedVacancy(vacancy)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <NewVacancyDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        sublocationId={sublocationId}
        sublocationName={sublocationName}
        defaultFuncties={gezochte_functies}
        defaultSector={sector}
        defaultDoelgroep={doelgroep}
        onSuccess={() => refetch()}
      />

      <VacancyDetailModal
        vacancy={selectedVacancy}
        open={!!selectedVacancy}
        onOpenChange={(open) => !open && setSelectedVacancy(null)}
        sublocationName={sublocationName}
        onUpdate={() => refetch()}
      />
    </div>
  );
}
