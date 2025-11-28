import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Archive,
  Search,
  RotateCcw,
  Trash2,
  Calendar,
  Mail,
  Phone,
  Briefcase,
  Building2,
  MapPin,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ArchivedApplication {
  id: string;
  email_from: string;
  extracted_data: any;
  pipeline_stage: string;
  deleted_at: string;
  rejected_at: string | null;
  rejection_reason: string | null;
  completeness_score: number;
}

export default function SollicitatiesArchief() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [applications, setApplications] = useState<ArchivedApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [reasonFilter, setReasonFilter] = useState<string>("all");
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [permanentDeleteId, setPermanentDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadArchivedApplications();
  }, []);

  const loadArchivedApplications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("professional_applications")
        .select("*")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

      if (error) throw error;
      setApplications(data || []);
    } catch (error: any) {
      console.error("Error loading archived applications:", error);
      toast({
        title: "Fout bij laden",
        description: "Kon archief niet laden",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      const { error } = await supabase
        .from("professional_applications")
        .update({ 
          deleted_at: null, 
          deleted_by: null,
          rejected_at: null,
          rejection_reason: null,
        })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Hersteld",
        description: "Sollicitatie is hersteld naar actieve lijst",
      });

      loadArchivedApplications();
    } catch (error) {
      console.error("Error restoring application:", error);
      toast({
        title: "Fout",
        description: "Kon sollicitatie niet herstellen",
        variant: "destructive",
      });
    } finally {
      setRestoreId(null);
    }
  };

  const handlePermanentDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("professional_applications")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Permanent verwijderd",
        description: "Sollicitatie is definitief verwijderd",
      });

      loadArchivedApplications();
    } catch (error) {
      console.error("Error deleting application:", error);
      toast({
        title: "Fout",
        description: "Kon sollicitatie niet verwijderen",
        variant: "destructive",
      });
    } finally {
      setPermanentDeleteId(null);
    }
  };

  const getFilteredApplications = () => {
    return applications.filter((app) => {
      const matchesSearch =
        !searchQuery ||
        app.extracted_data?.naam?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.email_from.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesReason =
        reasonFilter === "all" ||
        (reasonFilter === "rejected" && app.rejected_at) ||
        (reasonFilter === "deleted" && !app.rejected_at) ||
        app.rejection_reason === reasonFilter;

      return matchesSearch && matchesReason;
    });
  };

  const filteredApplications = getFilteredApplications();
  const rejectedCount = applications.filter((a) => a.rejected_at).length;
  const deletedCount = applications.filter((a) => !a.rejected_at).length;

  if (loading) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Laden...</p>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <div className="flex-1 overflow-auto">
        <div className="container max-w-7xl mx-auto p-6 space-y-6">
          {/* Hero Section */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Archive className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Archief</h1>
                <p className="text-muted-foreground">
                  Verwijderde en afgewezen sollicitaties
                </p>
              </div>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Totaal</div>
              <div className="text-2xl font-bold">{applications.length}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Afgewezen</div>
              <div className="text-2xl font-bold text-orange-600">{rejectedCount}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Verwijderd</div>
              <div className="text-2xl font-bold text-red-600">{deletedCount}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Getoond</div>
              <div className="text-2xl font-bold">{filteredApplications.length}</div>
            </Card>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Zoek op naam of email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={reasonFilter} onValueChange={setReasonFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter op reden" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alles</SelectItem>
                <SelectItem value="rejected">Afgewezen</SelectItem>
                <SelectItem value="deleted">Verwijderd</SelectItem>
                <SelectItem value="niet_geschikt">Niet geschikt</SelectItem>
                <SelectItem value="geen_reactie">Geen reactie</SelectItem>
                <SelectItem value="teruggetrokken">Teruggetrokken</SelectItem>
                <SelectItem value="andere">Andere</SelectItem>
              </SelectContent>
            </Select>
            {(searchQuery || reasonFilter !== "all") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setReasonFilter("all");
                }}
              >
                Reset
              </Button>
            )}
          </div>

          {/* Applications List */}
          <div className="space-y-3">
            {filteredApplications.length === 0 ? (
              <Card className="p-12 text-center">
                <Archive className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Geen gearchiveerde sollicitaties</h3>
                <p className="text-muted-foreground">
                  {searchQuery || reasonFilter !== "all"
                    ? "Geen sollicitaties gevonden met deze filters"
                    : "Verwijderde sollicitaties verschijnen hier"}
                </p>
              </Card>
            ) : (
              filteredApplications.map((app) => (
                <Card key={app.id} className="p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      {/* Header */}
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-lg">
                          {app.extracted_data?.naam || "Naam onbekend"}
                        </h3>
                        {app.rejected_at && (
                          <Badge variant="destructive" className="bg-orange-500/10 text-orange-700">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Afgewezen
                          </Badge>
                        )}
                        {app.extracted_data?.assigned_organization && (
                          <Badge variant="outline">
                            <Building2 className="h-3 w-3 mr-1" />
                            {app.extracted_data.assigned_organization}
                          </Badge>
                        )}
                      </div>

                      {/* Details Grid */}
                      <div className="grid grid-cols-3 gap-3 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          {app.email_from}
                        </div>
                        {app.extracted_data?.telefoon && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            {app.extracted_data.telefoon}
                          </div>
                        )}
                        {app.extracted_data?.functie_niveau && (
                          <div className="flex items-center gap-2">
                            <Briefcase className="h-4 w-4" />
                            {app.extracted_data.functie_niveau}
                          </div>
                        )}
                        {app.extracted_data?.regio && (
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            {app.extracted_data.regio}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Verwijderd: {format(new Date(app.deleted_at), "d MMM yyyy", { locale: nl })}
                        </div>
                      </div>

                      {/* Rejection Reason */}
                      {app.rejection_reason && (
                        <div className="text-sm bg-orange-500/5 text-orange-700 p-2 rounded">
                          <strong>Reden:</strong>{" "}
                          {app.rejection_reason === "niet_geschikt" && "Niet geschikt"}
                          {app.rejection_reason === "geen_reactie" && "Geen reactie"}
                          {app.rejection_reason === "teruggetrokken" && "Teruggetrokken"}
                          {app.rejection_reason === "andere" && "Andere"}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRestoreId(app.id)}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Herstel
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setPermanentDeleteId(app.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={!!restoreId} onOpenChange={() => setRestoreId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sollicitatie herstellen?</AlertDialogTitle>
            <AlertDialogDescription>
              De sollicitatie wordt teruggezet naar de actieve lijst en kan weer normaal bewerkt worden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleer</AlertDialogCancel>
            <AlertDialogAction onClick={() => restoreId && handleRestore(restoreId)}>
              Herstel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent Delete Confirmation Dialog */}
      <AlertDialog open={!!permanentDeleteId} onOpenChange={() => setPermanentDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanent verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Deze actie kan niet ongedaan gemaakt worden. De sollicitatie wordt definitief verwijderd uit het systeem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleer</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => permanentDeleteId && handlePermanentDelete(permanentDeleteId)}
            >
              Permanent verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
