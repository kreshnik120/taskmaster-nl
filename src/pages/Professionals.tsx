import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Upload, Search, Pencil, Trash2, Phone, Mail, MapPin, Briefcase, Car, Users } from "lucide-react";
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
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedProfessional, setSelectedProfessional] = useState<Professional | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
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
    return matchesSearch && matchesFunctie;
  });

  // Stats berekeningen
  const activeCount = professionals.filter(p => p.status === "actief").length;
  const withCarCount = professionals.filter(p => p.heeft_auto).length;

  if (loading) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <main className="flex-1 p-8">
            <div className="flex items-center justify-center h-full">
              <p>Laden...</p>
            </div>
          </main>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          <SidebarTrigger className="mb-4" />

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

          {/* Compact Stats Bar */}
          <div className="flex items-center gap-4 text-sm flex-wrap">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{professionals.length}</span>
              <span className="text-muted-foreground">professionals</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="font-medium text-green-600">{activeCount}</span>
              <span className="text-muted-foreground">actief</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <Car className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{withCarCount}</span>
              <span className="text-muted-foreground">met eigen vervoer</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">
                {filteredProfessionals.length} van {professionals.length} getoond
              </span>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="flex gap-3 flex-wrap">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Zoek op naam..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterFunctie} onValueChange={setFilterFunctie}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter functie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle functies</SelectItem>
                  <SelectItem value="Helpende 2">Helpende 2</SelectItem>
                  <SelectItem value="VIG">VIG</SelectItem>
                  <SelectItem value="VP3">VP3</SelectItem>
                  <SelectItem value="VP4">VP4</SelectItem>
                  <SelectItem value="HBO-V">HBO-V</SelectItem>
                </SelectContent>
              </Select>
            </div>

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
                    <Card className="hover:scale-[1.02] hover:shadow-lg transition-all duration-200">
                      <CardHeader>
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
          </div>
        </main>
      </div>
      
      <ProfessionalDetailModal
        professional={selectedProfessional}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        onSuccess={() => {
          fetchProfessionals();
          setDetailModalOpen(false);
        }}
      />
    </SidebarProvider>
  );
};

export default Professionals;