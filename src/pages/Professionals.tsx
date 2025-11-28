import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, Upload, Search, Pencil, Trash2, Phone, Mail, MapPin, Briefcase, Car, Users, CheckCircle, Link2, BarChart3, TrendingUp, AlertCircle, X } from "lucide-react";
import { ProfessionalBulkActionBar } from "@/components/recruitment/ProfessionalBulkActionBar";
import { motion } from "framer-motion";
import { useUserRole } from "@/hooks/useUserRole";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProfessionalDetailModal } from "@/components/ProfessionalDetailModal";

interface Professional {
  id: string;
  full_name: string;
  functie_niveau: string;
  regio: string | null;
  skills: string[];
  status: string;
  rating: number | null;
  tags: string[];
  werkvorm: string | null;
  telefoonnummer: string | null;
  email: string | null;
  heeft_auto: boolean | null;
  heeft_rijbewijs: boolean | null;
  beschikbaarheidsnotities: string | null;
  gewenst_uurloon: number | null;
  cao_akkoord: boolean | null;
  kvk_nummer: string | null;
  btw_nummer: string | null;
  created_at: string;
  updated_at: string;
}

const Professionals = () => {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterFunctie, setFilterFunctie] = useState<string>("all");
  const [filterWerkvorm, setFilterWerkvorm] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterRegio, setFilterRegio] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedProfessional, setSelectedProfessional] = useState<Professional | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedProfessionalIds, setSelectedProfessionalIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { canEdit } = useUserRole();

  const [newProfessional, setNewProfessional] = useState({
    full_name: "",
    functie_niveau: "VIG",
    regio: "",
    skills: "",
    rating: "",
    email: "",
    telefoonnummer: "",
  });

  useEffect(() => {
    fetchProfessionals();

    // Real-time subscription
    const channel = supabase
      .channel('professionals-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'professionals',
        },
        (payload) => {
          console.log('Professional change:', payload);
          fetchProfessionals();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchProfessionals = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userOrg } = await supabase
        .from("user_organizations")
        .select("org_id")
        .eq("user_id", user.id)
        .single();

      if (!userOrg) return;

      // Fetch from main professionals table instead of view to get all fields
      const { data, error } = await supabase
        .from("professionals")
        .select("*")
        .eq("org_id", userOrg.org_id)
        .is("deleted_at", null)
        .order("full_name");

      if (error) throw error;
      setProfessionals(data || []);
    } catch (error) {
      console.error("Error fetching professionals:", error);
      toast({
        title: "Fout bij laden",
        description: "Kan professionals niet laden",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddProfessional = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userOrg } = await supabase
        .from("user_organizations")
        .select("org_id")
        .eq("user_id", user.id)
        .single();

      if (!userOrg) return;

      const { error } = await supabase.from("professionals").insert({
        org_id: userOrg.org_id,
        full_name: newProfessional.full_name,
        functie_niveau: newProfessional.functie_niveau,
        regio: newProfessional.regio || null,
        skills: newProfessional.skills ? newProfessional.skills.split(",").map(s => s.trim()) : [],
        rating: newProfessional.rating ? parseFloat(newProfessional.rating) : null,
        status: "actief",
      });

      if (error) throw error;

      toast({
        title: "Toegevoegd",
        description: "Professional succesvol toegevoegd",
      });

      setIsAddDialogOpen(false);
      setNewProfessional({
        full_name: "",
        functie_niveau: "VIG",
        regio: "",
        skills: "",
        rating: "",
        email: "",
        telefoonnummer: "",
      });
      fetchProfessionals();
    } catch (error) {
      console.error("Error adding professional:", error);
      toast({
        title: "Fout",
        description: "Kan professional niet toevoegen",
        variant: "destructive",
      });
    }
  };

  const filteredProfessionals = professionals.filter((p) => {
    const matchesSearch = p.full_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFunctie = filterFunctie === "all" || p.functie_niveau === filterFunctie;
    const matchesWerkvorm = filterWerkvorm === "all" || p.werkvorm === filterWerkvorm;
    const matchesStatus = filterStatus === "all" || p.status === filterStatus;
    const matchesRegio = !filterRegio || (p.regio?.toLowerCase().includes(filterRegio.toLowerCase()) ?? false);
    return matchesSearch && matchesFunctie && matchesWerkvorm && matchesStatus && matchesRegio;
  });

  // Bulk action handlers
  const handleSelectProfessional = (id: string, checked: boolean) => {
    const newSelection = new Set(selectedProfessionalIds);
    if (checked) {
      newSelection.add(id);
    } else {
      newSelection.delete(id);
    }
    setSelectedProfessionalIds(newSelection);
  };

  const handleClearSelection = () => {
    setSelectedProfessionalIds(new Set());
  };

  const handleBulkChangeStatus = async (status: string) => {
    try {
      const ids = Array.from(selectedProfessionalIds);
      const { error } = await supabase
        .from("professionals")
        .update({ status })
        .in("id", ids);

      if (error) throw error;

      toast({
        title: "Status bijgewerkt",
        description: `${ids.length} professional(s) status gewijzigd naar ${status}`,
      });
      
      handleClearSelection();
      fetchProfessionals();
    } catch (error) {
      console.error("Error updating status:", error);
      toast({
        title: "Fout",
        description: "Kan status niet bijwerken",
        variant: "destructive",
      });
    }
  };

  const handleBulkEmail = () => {
    const emails = professionals
      .filter(p => selectedProfessionalIds.has(p.id) && p.email)
      .map(p => p.email)
      .join(",");
    
    if (emails) {
      window.location.href = `mailto:${emails}`;
    } else {
      toast({
        title: "Geen emails",
        description: "Geselecteerde professionals hebben geen email adres",
        variant: "destructive",
      });
    }
  };

  const handleBulkExport = () => {
    const selectedProfs = professionals.filter(p => selectedProfessionalIds.has(p.id));
    const csv = [
      ["Naam", "Functie", "Werkvorm", "Regio", "Email", "Telefoon", "Status"].join(","),
      ...selectedProfs.map(p => [
        p.full_name,
        p.functie_niveau,
        p.werkvorm || "",
        p.regio || "",
        p.email || "",
        p.telefoonnummer || "",
        p.status
      ].join(","))
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `professionals-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    
    toast({
      title: "Geëxporteerd",
      description: `${selectedProfs.length} professional(s) geëxporteerd naar CSV`,
    });
  };

  const handleBulkDelete = async () => {
    toast({
      title: "Nog niet beschikbaar",
      description: "Soft delete functionaliteit wordt toegevoegd in Fase 12 Prioriteit 7",
      variant: "destructive",
    });
  };

  // KPI metrics
  const totalCount = professionals.length;
  const activeCount = professionals.filter(p => p.status === "actief").length;
  const withActivePlacementCount = 0; // TODO: Calculate from professional_clients
  const availableCount = professionals.filter(p => p.status === "actief").length - withActivePlacementCount;
  const avgCompleteness = professionals.length > 0 
    ? Math.round(professionals.reduce((sum, p) => {
        let score = 0;
        if (p.full_name) score += 15;
        if (p.email) score += 15;
        if (p.telefoonnummer) score += 15;
        if (p.functie_niveau) score += 20;
        if (p.werkvorm) score += 15;
        if (p.regio) score += 10;
        if (p.heeft_auto !== null) score += 5;
        if (p.skills && p.skills.length > 0) score += 5;
        return sum + score;
      }, 0) / professionals.length)
    : 0;

  const hasActiveFilters = filterFunctie !== "all" || filterWerkvorm !== "all" || filterStatus !== "all" || filterRegio !== "";

  const resetFilters = () => {
    setFilterFunctie("all");
    setFilterWerkvorm("all");
    setFilterStatus("all");
    setFilterRegio("");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>Laden...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-background rounded-lg p-6 border border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">Professionals</h1>
            <p className="text-muted-foreground">
              Beheer jouw ZZP'ers en flexwerkers
            </p>
          </div>
          {canEdit() && (
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Toevoegen
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Nieuwe Professional</DialogTitle>
                      <DialogDescription>
                        Voeg een nieuwe professional toe aan het systeem
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="full_name">Volledige naam *</Label>
                        <Input
                          id="full_name"
                          value={newProfessional.full_name}
                          onChange={(e) =>
                            setNewProfessional({ ...newProfessional, full_name: e.target.value })
                          }
                          placeholder="John Doe"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="functie_niveau">Functieniveau *</Label>
                        <Select
                          value={newProfessional.functie_niveau}
                          onValueChange={(value) =>
                            setNewProfessional({ ...newProfessional, functie_niveau: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecteer functieniveau" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="VIG">VIG</SelectItem>
                            <SelectItem value="HBO-V">HBO-V</SelectItem>
                            <SelectItem value="Verpleegkundige MBO">Verpleegkundige MBO</SelectItem>
                            <SelectItem value="Helpende">Helpende</SelectItem>
                            <SelectItem value="Begeleider">Begeleider</SelectItem>
                            <SelectItem value="Persoonlijk begeleider">Persoonlijk begeleider</SelectItem>
                            <SelectItem value="GGZ-agoog">GGZ-agoog</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="email">Email</Label>
                          <Input
                            id="email"
                            type="email"
                            value={newProfessional.email}
                            onChange={(e) =>
                              setNewProfessional({ ...newProfessional, email: e.target.value })
                            }
                            placeholder="professional@example.com"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="telefoonnummer">Telefoonnummer</Label>
                          <Input
                            id="telefoonnummer"
                            value={newProfessional.telefoonnummer}
                            onChange={(e) =>
                              setNewProfessional({ ...newProfessional, telefoonnummer: e.target.value })
                            }
                            placeholder="+31612345678"
                          />
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="regio">Regio</Label>
                        <Input
                          id="regio"
                          value={newProfessional.regio}
                          onChange={(e) =>
                            setNewProfessional({ ...newProfessional, regio: e.target.value })
                          }
                          placeholder="Amsterdam"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="skills">Vaardigheden (kommagescheiden)</Label>
                        <Input
                          id="skills"
                          value={newProfessional.skills}
                          onChange={(e) =>
                            setNewProfessional({ ...newProfessional, skills: e.target.value })
                          }
                          placeholder="Wondverzorging, Medicatie, ..."
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                        Annuleren
                      </Button>
                      <Button onClick={handleAddProfessional}>Toevoegen</Button>
                    </div>
                  </DialogContent>
                </Dialog>
            )}
          </div>
        </div>

        {/* KPI Dashboard */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* Total Professionals */}
              <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-200/50 hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Totaal Professionals</p>
                      <p className="text-3xl font-bold">{totalCount}</p>
                    </div>
                    <Users className="h-8 w-8 text-blue-600" />
                  </div>
                </CardContent>
              </Card>

              {/* Active & Available */}
              <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-200/50 hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Actief & Beschikbaar</p>
                      <p className="text-3xl font-bold">{availableCount}</p>
                      <p className="text-xs text-muted-foreground mt-1">{activeCount} totaal actief</p>
                    </div>
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  </div>
                </CardContent>
              </Card>

              {/* With Active Placement */}
              <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-200/50 hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Met Actieve Plaatsing</p>
                      <p className="text-3xl font-bold">{withActivePlacementCount}</p>
                      <p className="text-xs text-muted-foreground mt-1">Momenteel ingezet</p>
                    </div>
                    <Link2 className="h-8 w-8 text-purple-600" />
                  </div>
                </CardContent>
              </Card>

              {/* Profile Completeness */}
              <Card className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-200/50 hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Profiel Volledigheid</p>
                      <p className="text-3xl font-bold">{avgCompleteness}%</p>
                      <p className="text-xs text-muted-foreground mt-1">Gemiddeld</p>
                    </div>
                    <BarChart3 className="h-8 w-8 text-orange-600" />
                  </div>
                </CardContent>
              </Card>
            </div>
        </div>

        {/* Search & Filters */}
        <div className="space-y-3">
            <div className="flex gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Zoek op naam..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={filterFunctie} onValueChange={setFilterFunctie}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Functie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle functies</SelectItem>
                  <SelectItem value="VIG">VIG</SelectItem>
                  <SelectItem value="HBO-V">HBO-V</SelectItem>
                  <SelectItem value="Verpleegkundige MBO">Verpleegkundige MBO</SelectItem>
                  <SelectItem value="Helpende">Helpende</SelectItem>
                  <SelectItem value="Begeleider">Begeleider</SelectItem>
                  <SelectItem value="Persoonlijk begeleider">Persoonlijk begeleider</SelectItem>
                  <SelectItem value="GGZ-agoog">GGZ-agoog</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterWerkvorm} onValueChange={setFilterWerkvorm}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Werkvorm" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle werkvormen</SelectItem>
                  <SelectItem value="ZZP">ZZP</SelectItem>
                  <SelectItem value="Uitzendkracht">Uitzendkracht</SelectItem>
                  <SelectItem value="ABCito constructie">ABCito constructie</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle statussen</SelectItem>
                  <SelectItem value="actief">Actief</SelectItem>
                  <SelectItem value="inactief">Inactief</SelectItem>
                  <SelectItem value="op_pauze">Op pauze</SelectItem>
                </SelectContent>
              </Select>

              <Input
                placeholder="Filter regio..."
                value={filterRegio}
                onChange={(e) => setFilterRegio(e.target.value)}
                className="w-[160px]"
              />

              {hasActiveFilters && (
                <Button variant="outline" onClick={resetFilters}>
                  <X className="w-4 h-4 mr-2" />
                  Reset filters
                </Button>
              )}
            </div>

            {/* Active Filter Indicator */}
            {hasActiveFilters && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                <span>{filteredProfessionals.length} van {professionals.length} professionals getoond</span>
              </div>
            )}
          </div>

        {/* Professional Cards */}
        {filteredProfessionals.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground mb-4">
                    Geen professionals gevonden
                  </p>
                  <Button onClick={() => setIsAddDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Eerste professional toevoegen
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredProfessionals.map((professional, idx) => (
                   <motion.div
                     key={professional.id}
                     initial={{ opacity: 0, y: 20 }}
                     animate={{ opacity: 1, y: 0 }}
                     transition={{ duration: 0.3, delay: idx * 0.05 }}
                   >
                     <Card className="hover:scale-[1.02] hover:shadow-lg transition-all duration-200 relative">
                       {/* Checkbox for bulk selection */}
                       <div className="absolute top-3 left-3 z-10">
                         <Checkbox
                           checked={selectedProfessionalIds.has(professional.id)}
                           onCheckedChange={(checked) => handleSelectProfessional(professional.id, !!checked)}
                           className="bg-background border-2"
                         />
                       </div>

                       <CardHeader className="pl-12">
                         <CardTitle className="flex items-center justify-between">
                           <span>{professional.full_name}</span>
                           {professional.rating && (
                             <Badge variant="secondary">
                               ⭐ {professional.rating}
                             </Badge>
                           )}
                         </CardTitle>
                       </CardHeader>
                      <CardContent className="space-y-2">
                        <div>
                          <Badge>{professional.functie_niveau}</Badge>
                          {professional.status === "actief" && (
                            <Badge variant="outline" className="ml-2">
                              Actief
                            </Badge>
                          )}
                        </div>
                        {professional.werkvorm && (
                          <div className="flex items-center gap-2 text-sm">
                            <Badge variant="secondary">{professional.werkvorm}</Badge>
                          </div>
                        )}
                        {professional.regio && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {professional.regio}
                          </p>
                        )}
                        {professional.telefoonnummer && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {professional.telefoonnummer}
                          </p>
                        )}
                        {professional.email && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                            <Mail className="h-3 w-3" />
                            {professional.email}
                          </p>
                        )}
                        {professional.heeft_auto && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Car className="h-3 w-3" />
                            Eigen vervoer
                          </p>
                        )}
                        {professional.skills.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {professional.skills.slice(0, 3).map((skill, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {skill}
                              </Badge>
                            ))}
                            {professional.skills.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{professional.skills.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}
                        <div className="flex gap-2 mt-4 pt-4 border-t">
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="flex-1"
                            onClick={() => {
                              setSelectedProfessional(professional);
                              setDetailModalOpen(true);
                            }}
                          >
                            Bekijk Details
                          </Button>
                        </div>
                      </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}

      <ProfessionalDetailModal
        professional={selectedProfessional}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        onSuccess={() => {
          fetchProfessionals();
          setDetailModalOpen(false);
        }}
      />

      <ProfessionalBulkActionBar
        selectedCount={selectedProfessionalIds.size}
        onClearSelection={handleClearSelection}
        onBulkChangeStatus={handleBulkChangeStatus}
        onBulkEmail={handleBulkEmail}
        onBulkExport={handleBulkExport}
        onBulkDelete={handleBulkDelete}
      />
    </div>
  );
};

export default Professionals;