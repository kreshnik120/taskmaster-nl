import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";
import { 
  Phone, Mail, MapPin, Briefcase, Car, Calendar, User,
  Star, Edit, Trash2, CheckCircle2, X, Link2, ChevronDown, Award
} from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { MatchingPanel } from "./MatchingPanel";

interface Professional {
  id: string;
  full_name: string;
  functie_niveau: string;
  werkvorm: string | null;
  regio: string | null;
  telefoonnummer: string | null;
  email: string | null;
  heeft_auto: boolean | null;
  heeft_rijbewijs: boolean | null;
  skills: string[];
  rating: number | null;
  status: string;
  beschikbaarheidsnotities: string | null;
  gewenst_uurloon: number | null;
  cao_akkoord: boolean | null;
  kvk_nummer: string | null;
  btw_nummer: string | null;
  created_at: string;
  updated_at: string;
}

interface ProfessionalDetailModalProps {
  professional: Professional | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const FUNCTIE_NIVEAUS = ["VIG", "HBO-V", "Verpleegkundige MBO", "Helpende", "Begeleider", "Persoonlijk begeleider", "GGZ-agoog"];
const WERKVORMEN = ["ZZP", "Uitzendkracht", "ABCito constructie"];
const SECTOREN = ["VVT", "GGZ", "GHZ", "Jeugdzorg", "Ziekenhuis", "Thuiszorg"];

// Semantic badge colors for functie niveau
const getFunctieColor = (functie: string) => {
  const colors: Record<string, string> = {
    "VIG": "bg-blue-500/10 text-blue-700 border-blue-200",
    "HBO-V": "bg-purple-500/10 text-purple-700 border-purple-200",
    "Verpleegkundige MBO": "bg-green-500/10 text-green-700 border-green-200",
    "Helpende": "bg-orange-500/10 text-orange-700 border-orange-200",
    "Begeleider": "bg-cyan-500/10 text-cyan-700 border-cyan-200",
    "Persoonlijk begeleider": "bg-pink-500/10 text-pink-700 border-pink-200",
    "GGZ-agoog": "bg-indigo-500/10 text-indigo-700 border-indigo-200",
  };
  return colors[functie] || "bg-muted";
};

// Semantic badge colors for werkvorm
const getWerkvormColor = (werkvorm: string) => {
  const colors: Record<string, string> = {
    "ZZP": "bg-emerald-500/10 text-emerald-700 border-emerald-200",
    "Uitzendkracht": "bg-blue-500/10 text-blue-700 border-blue-200",
    "ABCito constructie": "bg-violet-500/10 text-violet-700 border-violet-200",
  };
  return colors[werkvorm] || "bg-muted";
};

// Semantic badge colors for sectoren
const getSectorColor = (sector: string) => {
  const colors: Record<string, string> = {
    "VVT": "bg-blue-500/10 text-blue-700 border-blue-200",
    "GGZ": "bg-purple-500/10 text-purple-700 border-purple-200",
    "GHZ": "bg-green-500/10 text-green-700 border-green-200",
    "Jeugdzorg": "bg-orange-500/10 text-orange-700 border-orange-200",
    "Ziekenhuis": "bg-red-500/10 text-red-700 border-red-200",
    "Thuiszorg": "bg-teal-500/10 text-teal-700 border-teal-200",
  };
  return colors[sector] || "bg-muted";
};

// Helper functions for avatar
const getInitials = (name: string) => {
  return name
    .split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

const getFunctieAvatarColor = (functieNiveau: string) => {
  switch (functieNiveau) {
    case "VIG": return "bg-blue-600 text-white";
    case "HBO-V": return "bg-purple-600 text-white";
    case "Verpleegkundige MBO": return "bg-green-600 text-white";
    case "Helpende": return "bg-orange-500 text-white";
    case "Begeleider": return "bg-cyan-600 text-white";
    case "Persoonlijk begeleider": return "bg-pink-600 text-white";
    case "GGZ-agoog": return "bg-indigo-600 text-white";
    default: return "bg-gray-500 text-white";
  }
};

export function ProfessionalDetailModal({ 
  professional, 
  open, 
  onOpenChange,
  onSuccess 
}: ProfessionalDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [basicsOpen, setBasicsOpen] = useState(true);
  const [contactOpen, setContactOpen] = useState(true);
  const [financialOpen, setFinancialOpen] = useState(false);
  
  const [editData, setEditData] = useState({
    full_name: "",
    functie_niveau: "",
    werkvorm: "",
    regio: "",
    telefoonnummer: "",
    email: "",
    heeft_auto: false,
    heeft_rijbewijs: false,
    skills: [] as string[],
    beschikbaarheidsnotities: "",
    gewenst_uurloon: "",
    cao_akkoord: false,
    kvk_nummer: "",
    btw_nummer: ""
  });

  const handleEdit = () => {
    if (!professional) return;
    
    setEditData({
      full_name: professional.full_name,
      functie_niveau: professional.functie_niveau,
      werkvorm: professional.werkvorm || "",
      regio: professional.regio || "",
      telefoonnummer: professional.telefoonnummer || "",
      email: professional.email || "",
      heeft_auto: professional.heeft_auto || false,
      heeft_rijbewijs: professional.heeft_rijbewijs || false,
      skills: professional.skills || [],
      beschikbaarheidsnotities: professional.beschikbaarheidsnotities || "",
      gewenst_uurloon: professional.gewenst_uurloon?.toString() || "",
      cao_akkoord: professional.cao_akkoord || false,
      kvk_nummer: professional.kvk_nummer || "",
      btw_nummer: professional.btw_nummer || ""
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!professional) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("professionals")
        .update({
          full_name: editData.full_name,
          functie_niveau: editData.functie_niveau,
          werkvorm: editData.werkvorm || null,
          regio: editData.regio || null,
          telefoonnummer: editData.telefoonnummer || null,
          email: editData.email || null,
          heeft_auto: editData.heeft_auto,
          heeft_rijbewijs: editData.heeft_rijbewijs,
          skills: editData.skills,
          beschikbaarheidsnotities: editData.beschikbaarheidsnotities || null,
          gewenst_uurloon: editData.gewenst_uurloon ? parseFloat(editData.gewenst_uurloon) : null,
          cao_akkoord: editData.cao_akkoord,
          kvk_nummer: editData.kvk_nummer || null,
          btw_nummer: editData.btw_nummer || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", professional.id);

      if (error) throw error;

      toast.success("Professional succesvol bijgewerkt");
      setIsEditing(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error updating professional:", error);
      toast.error(`Fout bij bijwerken: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!professional) return;
    
    if (!confirm(`Weet je zeker dat je ${professional.full_name} wilt verwijderen?`)) {
      return;
    }
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("professionals")
        .delete()
        .eq("id", professional.id);

      if (error) throw error;

      toast.success("Professional succesvol verwijderd");
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error deleting professional:", error);
      toast.error(`Fout bij verwijderen: ${error.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSkill = (sector: string) => {
    setEditData(prev => ({
      ...prev,
      skills: prev.skills.includes(sector)
        ? prev.skills.filter(s => s !== sector)
        : [...prev.skills, sector]
    }));
  };

  // Calculate completeness score
  const calculateCompleteness = () => {
    if (!professional) return 0;
    const fields = [
      professional.full_name,
      professional.functie_niveau,
      professional.werkvorm,
      professional.regio,
      professional.telefoonnummer,
      professional.email,
      professional.skills?.length > 0
    ];
    const filledFields = fields.filter(Boolean).length;
    return Math.round((filledFields / fields.length) * 100);
  };

  if (!professional) return null;

  const completeness = calculateCompleteness();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarFallback className={getFunctieAvatarColor(professional.functie_niveau)}>
                  {getInitials(professional.full_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="text-xl font-semibold">
                  {isEditing ? "Bewerk Professional" : professional.full_name}
                </div>
                {!isEditing && (
                  <div className="text-sm text-muted-foreground font-normal">
                    {professional.functie_niveau}
                  </div>
                )}
              </div>
              {/* Completeness indicator */}
              <div className="relative w-10 h-10">
                <svg className="w-10 h-10 -rotate-90">
                  <circle
                    cx="20"
                    cy="20"
                    r="16"
                    stroke="currentColor"
                    strokeWidth="3"
                    fill="none"
                    className="text-muted"
                  />
                  <circle
                    cx="20"
                    cy="20"
                    r="16"
                    stroke="currentColor"
                    strokeWidth="3"
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * 16}`}
                    strokeDashoffset={`${2 * Math.PI * 16 * (1 - completeness / 100)}`}
                    className={`transition-all ${completeness === 100 ? 'text-green-500' : 'text-primary'} ${completeness < 100 ? 'animate-pulse' : ''}`}
                  />
                </svg>
                {completeness === 100 ? (
                  <CheckCircle2 className="absolute inset-0 m-auto h-4 w-4 text-green-500" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                    {completeness}
                  </span>
                )}
              </div>
            </div>
            {!isEditing && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleEdit}>
                  <Edit className="h-4 w-4 mr-1" />
                  Bewerken
                </Button>
                <Button 
                  size="sm" 
                  variant="destructive" 
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Verwijderen
                </Button>
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="profiel" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profiel">
              <User className="h-4 w-4 mr-2" />
              Profiel
            </TabsTrigger>
            <TabsTrigger value="ervaring">
              <Award className="h-4 w-4 mr-2" />
              Ervaring
            </TabsTrigger>
            <TabsTrigger value="plaatsing">
              <Link2 className="h-4 w-4 mr-2" />
              Plaatsing
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profiel" className="space-y-4 mt-6">
            {/* Basis Info - Collapsible */}
            <Collapsible open={basicsOpen} onOpenChange={setBasicsOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-muted/50 rounded-lg transition-colors">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Basis Informatie
                </h3>
                <ChevronDown className={`h-4 w-4 transition-transform ${basicsOpen ? '' : '-rotate-90'}`} />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 mt-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Naam</Label>
                    {isEditing ? (
                      <Input
                        value={editData.full_name}
                        onChange={(e) => setEditData({ ...editData, full_name: e.target.value })}
                        className="focus:ring-2 focus:ring-primary transition-all"
                      />
                    ) : (
                      <p className="text-sm mt-1 p-2 bg-muted/30 rounded-md">{professional.full_name}</p>
                    )}
                  </div>
                  
                  <div>
                    <Label>Functieniveau</Label>
                    {isEditing ? (
                      <Select
                        value={editData.functie_niveau}
                        onValueChange={(value) => setEditData({ ...editData, functie_niveau: value })}
                      >
                        <SelectTrigger className="focus:ring-2 focus:ring-primary transition-all">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FUNCTIE_NIVEAUS.map(niveau => (
                            <SelectItem key={niveau} value={niveau}>{niveau}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="mt-1">
                        <Badge className={getFunctieColor(professional.functie_niveau)}>
                          {professional.functie_niveau}
                        </Badge>
                      </div>
                    )}
                  </div>

                  <div>
                    <Label>Werkvorm</Label>
                    {isEditing ? (
                      <Select
                        value={editData.werkvorm}
                        onValueChange={(value) => setEditData({ ...editData, werkvorm: value })}
                      >
                        <SelectTrigger className="focus:ring-2 focus:ring-primary transition-all">
                          <SelectValue placeholder="Selecteer werkvorm" />
                        </SelectTrigger>
                        <SelectContent>
                          {WERKVORMEN.map(vorm => (
                            <SelectItem key={vorm} value={vorm}>{vorm}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="mt-1">
                        {professional.werkvorm && (
                          <Badge className={getWerkvormColor(professional.werkvorm)}>
                            {professional.werkvorm}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <Label>Status</Label>
                    <div className="mt-1">
                      <Badge variant={professional.status === "actief" ? "default" : "secondary"}>
                        {professional.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            {/* Contact Info - Collapsible */}
            <Collapsible open={contactOpen} onOpenChange={setContactOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-muted/50 rounded-lg transition-colors">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Contact & Locatie
                </h3>
                <ChevronDown className={`h-4 w-4 transition-transform ${contactOpen ? '' : '-rotate-90'}`} />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 mt-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Email</Label>
                    {isEditing ? (
                      <Input
                        type="email"
                        value={editData.email}
                        onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                        className="focus:ring-2 focus:ring-primary transition-all"
                      />
                    ) : (
                      <p className="text-sm mt-1 flex items-center gap-2 p-2 bg-muted/30 rounded-md">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        {professional.email || "-"}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label>Telefoon</Label>
                    {isEditing ? (
                      <Input
                        value={editData.telefoonnummer}
                        onChange={(e) => setEditData({ ...editData, telefoonnummer: e.target.value })}
                        className="focus:ring-2 focus:ring-primary transition-all"
                      />
                    ) : (
                      <p className="text-sm mt-1 flex items-center gap-2 p-2 bg-muted/30 rounded-md">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        {professional.telefoonnummer || "-"}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label>Regio</Label>
                    {isEditing ? (
                      <Input
                        value={editData.regio}
                        onChange={(e) => setEditData({ ...editData, regio: e.target.value })}
                        className="focus:ring-2 focus:ring-primary transition-all"
                      />
                    ) : (
                      <p className="text-sm mt-1 flex items-center gap-2 p-2 bg-muted/30 rounded-md">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        {professional.regio || "-"}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 mt-4">
                    {isEditing ? (
                      <>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="heeft_auto"
                            checked={editData.heeft_auto}
                            onCheckedChange={(checked) => 
                              setEditData({ ...editData, heeft_auto: checked as boolean })
                            }
                          />
                          <Label htmlFor="heeft_auto" className="text-sm">Eigen auto</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="heeft_rijbewijs"
                            checked={editData.heeft_rijbewijs}
                            onCheckedChange={(checked) => 
                              setEditData({ ...editData, heeft_rijbewijs: checked as boolean })
                            }
                          />
                          <Label htmlFor="heeft_rijbewijs" className="text-sm">Rijbewijs</Label>
                        </div>
                      </>
                    ) : (
                      <>
                        {professional.heeft_auto && (
                          <Badge variant="outline" className="flex items-center gap-1">
                            <Car className="h-3 w-3" />
                            Eigen auto
                          </Badge>
                        )}
                        {professional.heeft_rijbewijs && (
                          <Badge variant="outline">Rijbewijs</Badge>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            {/* Financial - Collapsible */}
            {(professional.gewenst_uurloon || professional.kvk_nummer || isEditing) && (
              <Collapsible open={financialOpen} onOpenChange={setFinancialOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-muted/50 rounded-lg transition-colors">
                  <h3 className="text-sm font-semibold">Financieel</h3>
                  <ChevronDown className={`h-4 w-4 transition-transform ${financialOpen ? '' : '-rotate-90'}`} />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 mt-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Gewenst uurloon</Label>
                      {isEditing ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={editData.gewenst_uurloon}
                          onChange={(e) => setEditData({ ...editData, gewenst_uurloon: e.target.value })}
                          placeholder="€ 0,00"
                          className="focus:ring-2 focus:ring-primary transition-all"
                        />
                      ) : (
                        <p className="text-sm mt-1 p-2 bg-muted/30 rounded-md">
                          {professional.gewenst_uurloon ? `€ ${professional.gewenst_uurloon.toFixed(2)}` : "-"}
                        </p>
                      )}
                    </div>
                    
                    {isEditing && (
                      <div className="flex items-center gap-2 mt-6">
                        <Checkbox
                          id="cao_akkoord"
                          checked={editData.cao_akkoord}
                          onCheckedChange={(checked) => 
                            setEditData({ ...editData, cao_akkoord: checked as boolean })
                          }
                        />
                        <Label htmlFor="cao_akkoord" className="text-sm">CAO akkoord</Label>
                      </div>
                    )}
                    
                    {professional.cao_akkoord && !isEditing && (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span className="text-sm">CAO akkoord</span>
                      </div>
                    )}

                    {(professional.kvk_nummer || isEditing) && (
                      <div>
                        <Label>KvK nummer</Label>
                        {isEditing ? (
                          <Input
                            value={editData.kvk_nummer}
                            onChange={(e) => setEditData({ ...editData, kvk_nummer: e.target.value })}
                            className="focus:ring-2 focus:ring-primary transition-all"
                          />
                        ) : (
                          <p className="text-sm mt-1 p-2 bg-muted/30 rounded-md">{professional.kvk_nummer || "-"}</p>
                        )}
                      </div>
                    )}

                    {(professional.btw_nummer || isEditing) && (
                      <div>
                        <Label>BTW nummer</Label>
                        {isEditing ? (
                          <Input
                            value={editData.btw_nummer}
                            onChange={(e) => setEditData({ ...editData, btw_nummer: e.target.value })}
                            className="focus:ring-2 focus:ring-primary transition-all"
                          />
                        ) : (
                          <p className="text-sm mt-1 p-2 bg-muted/30 rounded-md">{professional.btw_nummer || "-"}</p>
                        )}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </TabsContent>

          <TabsContent value="ervaring" className="space-y-4 mt-6">
            {/* Skills & Sector Ervaring */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Sector Ervaring
              </h3>
              {isEditing ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {SECTOREN.map((sector) => (
                      <Badge
                        key={sector}
                        className={`cursor-pointer transition-all ${
                          editData.skills.includes(sector)
                            ? getSectorColor(sector)
                            : "bg-transparent border-2 hover:bg-muted"
                        }`}
                        onClick={() => toggleSkill(sector)}
                      >
                        {sector}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {professional.skills?.length > 0 ? (
                    professional.skills.map((skill) => (
                      <Badge key={skill} className={getSectorColor(skill)}>{skill}</Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Geen sector ervaring opgegeven</p>
                  )}
                </div>
              )}
            </div>

            {professional.rating && (
              <>
                <Separator />
                <div>
                  <Label>Rating</Label>
                  <div className="flex items-center gap-1 mt-1">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <span className="text-sm font-medium">{professional.rating.toFixed(1)}</span>
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Beschikbaarheid */}
            <div>
              <Label>Beschikbaarheidsnotities</Label>
              {isEditing ? (
                <Textarea
                  value={editData.beschikbaarheidsnotities}
                  onChange={(e) => setEditData({ ...editData, beschikbaarheidsnotities: e.target.value })}
                  placeholder="Notities over beschikbaarheid..."
                  className="focus:ring-2 focus:ring-primary transition-all min-h-[100px]"
                />
              ) : (
                <p className="text-sm mt-1 p-3 bg-muted/30 rounded-md min-h-[100px]">
                  {professional.beschikbaarheidsnotities || "Geen notities"}
                </p>
              )}
            </div>

            <Separator />

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
              <div>
                <span className="font-medium">Aangemaakt:</span>{" "}
                {format(new Date(professional.created_at), "d MMM yyyy", { locale: nl })}
              </div>
              <div>
                <span className="font-medium">Laatst bijgewerkt:</span>{" "}
                {format(new Date(professional.updated_at), "d MMM yyyy", { locale: nl })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="plaatsing" className="mt-6">
            <MatchingPanel
              professionalId={professional.id}
              professionalName={professional.full_name}
            />
          </TabsContent>
        </Tabs>

        {isEditing && (
          <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
            >
              <X className="h-4 w-4 mr-1" />
              Annuleren
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Opslaan...
                </span>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Opslaan
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
