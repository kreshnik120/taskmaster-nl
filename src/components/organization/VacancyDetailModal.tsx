import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Briefcase,
  Clock,
  Calendar,
  AlertTriangle,
  Users,
  CheckCircle2,
  Edit,
  MapPin,
} from "lucide-react";
import { format, differenceInDays, isPast } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import { VacancyMatchingPanel } from "./VacancyMatchingPanel";
import { VacancyEditDialog } from "./VacancyEditDialog";

interface Vacancy {
  id: string;
  sublocation_id: string;
  titel: string;
  functie_niveau: string;
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
}

interface VacancyDetailModalProps {
  vacancy: Vacancy | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sublocationName: string;
  onUpdate?: () => void;
}

const statusOptions = [
  { value: "open", label: "Open", color: "bg-green-500" },
  { value: "in_review", label: "In Review", color: "bg-amber-500" },
  { value: "vervuld", label: "Vervuld", color: "bg-blue-500" },
  { value: "gesloten", label: "Gesloten", color: "bg-muted" },
];

const urgentieColors: Record<string, string> = {
  kritiek: "bg-red-500 text-white",
  hoog: "bg-orange-500 text-white",
  normaal: "bg-blue-500 text-white",
  laag: "bg-muted text-muted-foreground",
};

export function VacancyDetailModal({
  vacancy,
  open,
  onOpenChange,
  sublocationName,
  onUpdate,
}: VacancyDetailModalProps) {
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Fetch applications count
  const { data: applicationsCount } = useQuery({
    queryKey: ["vacancy-applications-count", vacancy?.id],
    queryFn: async () => {
      if (!vacancy) return 0;
      const { count, error } = await supabase
        .from("vacancy_applications")
        .select("*", { count: "exact", head: true })
        .eq("vacancy_id", vacancy.id);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!vacancy,
  });

  if (!vacancy) return null;

  const deadlineDays = vacancy.deadline
    ? differenceInDays(new Date(vacancy.deadline), new Date())
    : null;
  const isDeadlinePast = vacancy.deadline ? isPast(new Date(vacancy.deadline)) : false;

  const handleStatusChange = async (newStatus: string) => {
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from("vacancies")
        .update({ status: newStatus })
        .eq("id", vacancy.id);

      if (error) throw error;

      toast.success(`Status gewijzigd naar ${statusOptions.find(s => s.value === newStatus)?.label}`);
      queryClient.invalidateQueries({ queryKey: ["vacancies"] });
      queryClient.invalidateQueries({ queryKey: ["vacancy-applications-count"] });
      onUpdate?.();
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Kon status niet wijzigen");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-xl">{vacancy.titel}</DialogTitle>
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                <MapPin className="h-3 w-3" />
                {sublocationName}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditDialogOpen(true)}
              >
                <Edit className="h-3 w-3 mr-1" />
                Bewerken
              </Button>
              <Badge className={urgentieColors[vacancy.urgentie] || "bg-muted"}>
                {vacancy.urgentie}
              </Badge>
              <Select
                value={vacancy.status}
                onValueChange={handleStatusChange}
                disabled={isUpdating}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${opt.color}`} />
                        {opt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="details" className="mt-4">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="matching" className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              Matching ({applicationsCount || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-6 mt-4">
            {/* Deadline Warning */}
            {vacancy.deadline && (
              <div
                className={`flex items-center gap-2 p-3 rounded-lg ${
                  isDeadlinePast
                    ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                    : deadlineDays !== null && deadlineDays <= 7
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    : "bg-muted"
                }`}
              >
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {isDeadlinePast
                    ? "Deadline verstreken"
                    : `Deadline over ${deadlineDays} dagen`}
                </span>
                <span className="text-sm ml-auto">
                  {format(new Date(vacancy.deadline), "d MMMM yyyy", { locale: nl })}
                </span>
              </div>
            )}

            {/* Key Info Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Functieniveau</p>
                <p className="font-medium flex items-center gap-1">
                  <Briefcase className="h-3 w-3" />
                  {vacancy.functie_niveau}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Uren per week</p>
                <p className="font-medium flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {vacancy.uren_per_week || "Flexibel"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Startdatum</p>
                <p className="font-medium flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {vacancy.start_datum
                    ? format(new Date(vacancy.start_datum), "d MMM yyyy", { locale: nl })
                    : "Per direct"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Kandidaten</p>
                <p className="font-medium flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {applicationsCount || 0} voorgesteld
                </p>
              </div>
            </div>

            <Separator />

            {/* Description */}
            {vacancy.beschrijving && (
              <div className="space-y-2">
                <h4 className="font-medium">Beschrijving</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {vacancy.beschrijving}
                </p>
              </div>
            )}

            {/* Requirements */}
            <div className="grid md:grid-cols-3 gap-4">
              {vacancy.gewenste_sector_ervaring.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Sector ervaring</h4>
                  <div className="flex flex-wrap gap-1">
                    {vacancy.gewenste_sector_ervaring.map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {vacancy.gewenste_doelgroep_ervaring.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Doelgroep ervaring</h4>
                  <div className="flex flex-wrap gap-1">
                    {vacancy.gewenste_doelgroep_ervaring.map((d) => (
                      <Badge key={d} variant="secondary" className="text-xs">
                        {d}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {vacancy.vereiste_certificaten.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Vereiste certificaten</h4>
                  <div className="flex flex-wrap gap-1">
                    {vacancy.vereiste_certificaten.map((c) => (
                      <Badge key={c} variant="outline" className="text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Metadata */}
            <div className="text-xs text-muted-foreground pt-4 border-t">
              Aangemaakt op {format(new Date(vacancy.created_at), "d MMMM yyyy", { locale: nl })}
            </div>
          </TabsContent>

          <TabsContent value="matching" className="mt-4">
            <VacancyMatchingPanel
              vacancy={vacancy}
              sublocationName={sublocationName}
            />
          </TabsContent>
        </Tabs>

        <VacancyEditDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          vacancy={vacancy}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["vacancies"] });
            onUpdate?.();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
