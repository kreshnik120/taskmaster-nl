import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { formatFunctieNiveau } from "@/lib/functieNiveau";
import { useState, useCallback, useEffect, useMemo } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import { Shield, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { 
  Phone, Mail, MapPin, Briefcase, Car, Calendar, User, Users,
  Star, Edit, Trash2, CheckCircle2, X, Link2, ChevronDown, Award, Clock, 
  Home, Cake, Upload, MoreHorizontal, FileText, Download, Eye, XCircle
} from "lucide-react";
import { PlacementHistory } from "./PlacementHistory";
import { BeschikbaarheidMiniKalender } from "./beschikbaarheid/BeschikbaarheidMiniKalender";
import { CalendarCheck2 } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { SublocationSelectorPanel } from "./SublocationSelectorPanel";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface Professional {
  id: string;
  full_name: string;
  functie_niveau: string;
  werkvorm: string | null;
  regio: string | null;
  woonplaats: string | null;
  postcode: string | null;
  adres: string | null;
  geboortedatum: string | null;
  profile_photo_url: string | null;
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
  // CV fields
  cv_file_path: string | null;
  cv_file_name: string | null;
  cv_uploaded_at: string | null;
  // Bendy sync fields
  voorletters: string | null;
  geboorteplaats: string | null;
  geslacht: string | null;
  bendy_external_id: string | null;
  // Company/Bendy fields
  iban: string | null;
  big_nummer: string | null;
  agb_code: string | null;
  skj_registratie: string | null;
  iban_tenaamstelling: string | null;
  boekhouding_email: string | null;
  bedrijfstelefoon: string | null;
  bendy_username: string | null;
  bendy_mediator_id: string | null;
  bendy_function_type: string | null;
  bendy_created_at: string | null;
  bedrijfsnaam: string | null;
  // New fields for complete data sync
  ervaring_sector: string[] | null;
  doelgroep_ervaring: string[] | null;
  certificaten: string[] | null;
  specialisaties: string[] | null;
  opleidingen: unknown;
  talen: string[] | null;
  regio_voorkeur: string[] | null;
  specifieke_doelgroepen: string[] | null;
  max_reisafstand_km: number | null;
  documents_count: number | null;
  documents_expiring_count: number | null;
  documents_synced_at: string | null;
  bendy_groepen?: string[] | null;
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [basicsOpen, setBasicsOpen] = useState(true);
  const [contactOpen, setContactOpen] = useState(true);
  const [financialOpen, setFinancialOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("profiel");
  const [bsnData, setBsnData] = useState<{ bsn: string | null; revealed: boolean; loading: boolean }>({ bsn: null, revealed: false, loading: false });
  const [documents, setDocuments] = useState<any[]>([]);
  const { isAdmin } = useUserRole();

  const [documentsLoading, setDocumentsLoading] = useState(false);

  useEffect(() => {
    if (open && professional) {
      setDocumentsLoading(true);
      supabase
        .from('professional_documents')
        .select('*')
        .eq('professional_id', professional.id)
        .order('expires_at', { ascending: true, nullsFirst: false })
        .then(({ data, error }) => {
          if (error) {
            console.error('Documents fetch error:', error);
            setDocuments([]);
          } else {
            setDocuments(data || []);
          }
          setDocumentsLoading(false);
        });
    } else {
      setDocuments([]);
      setDocumentsLoading(false);
    }
  }, [open, professional]);

  const fetchAndRevealBsn = useCallback(async () => {
    if (!professional) return;
    setBsnData(prev => ({ ...prev, loading: true }));
    try {
      // BSN ophalen via beveiligde edge function (decryptie server-side)
      const { data, error } = await supabase.functions.invoke('bsn-vault', {
        body: { action: 'decrypt', professional_id: professional.id },
      });

      if (error) {
        console.error('BSN vault error:', error);
        setBsnData({ bsn: null, revealed: false, loading: false });
        return;
      }

      // Audit logging wordt gedaan door de edge function
      if (data?.bsn) {
        setBsnData({ bsn: data.bsn, revealed: true, loading: false });
      } else {
        setBsnData({ bsn: null, revealed: false, loading: false });
      }
    } catch {
      setBsnData(prev => ({ ...prev, loading: false }));
    }
  }, [professional]);
  
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
    btw_nummer: "",
    woonplaats: "",
    postcode: "",
    adres: "",
    geboortedatum: "",
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
      btw_nummer: professional.btw_nummer || "",
      woonplaats: professional.woonplaats || "",
      postcode: professional.postcode || "",
      adres: professional.adres || "",
      geboortedatum: professional.geboortedatum || "",
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
          woonplaats: editData.woonplaats || null,
          postcode: editData.postcode || null,
          adres: editData.adres || null,
          geboortedatum: editData.geboortedatum || null,
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
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("professionals")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", professional.id);

      if (error) throw error;

      toast.success("Professional succesvol verwijderd");
      setDeleteDialogOpen(false);
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

  const documentStats = useMemo(() => {
    const now = new Date();
    const ninetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const expired = documents.filter(d => d.expires_at && new Date(d.expires_at) < now);
    const expiringSoon = documents.filter(d => {
      if (!d.expires_at) return false;
      const exp = new Date(d.expires_at);
      return exp >= now && exp <= ninetyDays;
    });
    const valid = documents.filter(d => {
      if (!d.expires_at) return true;
      return new Date(d.expires_at) > ninetyDays;
    });
    return { now, ninetyDays, expired, expiringSoon, valid };
  }, [documents]);

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
        {/* Hero Header met Foto */}
        <div className="relative -m-6 mb-0 p-6 pb-4 bg-gradient-to-br from-primary/5 via-primary/3 to-transparent border-b">
          <div className="flex items-start gap-6">
            {/* Large Avatar with Photo */}
            <div className="relative group">
              <Avatar className="h-28 w-28 ring-4 ring-background shadow-xl">
                {professional.profile_photo_url ? (
                  <AvatarImage 
                    src={professional.profile_photo_url} 
                    alt={professional.full_name}
                    className="object-cover"
                  />
                ) : null}
                <AvatarFallback className={`${getFunctieAvatarColor(professional.functie_niveau)} text-3xl font-semibold`}>
                  {getInitials(professional.full_name)}
                </AvatarFallback>
              </Avatar>
              {/* Photo upload hover overlay */}
              <label className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                <Upload className="h-8 w-8 text-white" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    
                    try {
                      const fileExt = file.name.split('.').pop();
                      const fileName = `${professional.id}-${Date.now()}.${fileExt}`;
                      
                      const { error: uploadError } = await supabase.storage
                        .from('profile-photos')
                        .upload(fileName, file, { upsert: true });
                      
                      if (uploadError) throw uploadError;
                      
                      const { data: { publicUrl } } = supabase.storage
                        .from('profile-photos')
                        .getPublicUrl(fileName);
                      
                      await supabase
                        .from('professionals')
                        .update({ profile_photo_url: publicUrl })
                        .eq('id', professional.id);
                      
                      toast.success('Foto geüpload!');
                      onSuccess?.();
                    } catch (error) {
                      console.error('Upload error:', error);
                      toast.error('Fout bij uploaden foto');
                    }
                  }}
                />
              </label>
            </div>

            {/* Name and NAW Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-2xl font-bold truncate">{professional.full_name}</h2>
                {/* Completeness indicator */}
                <div className="relative w-10 h-10 flex-shrink-0">
                  <svg className="w-10 h-10 -rotate-90">
                    <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="3" fill="none" className="text-muted" />
                    <circle
                      cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="3" fill="none"
                      strokeDasharray={`${2 * Math.PI * 16}`}
                      strokeDashoffset={`${2 * Math.PI * 16 * (1 - completeness / 100)}`}
                      className={`transition-all ${completeness === 100 ? 'text-green-500' : 'text-primary'}`}
                    />
                  </svg>
                  {completeness === 100 ? (
                    <CheckCircle2 className="absolute inset-0 m-auto h-4 w-4 text-green-500" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">{completeness}</span>
                  )}
                </div>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2 mb-3">
                <Badge className={getFunctieColor(professional.functie_niveau)}>{formatFunctieNiveau(professional.functie_niveau)}</Badge>
                {professional.werkvorm && (
                  <Badge className={getWerkvormColor(professional.werkvorm)}>{professional.werkvorm}</Badge>
                )}
                <Badge variant={professional.status === "actief" ? "default" : "secondary"}>{professional.status}</Badge>
              </div>

              {/* NAW Inline Info */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {(professional.woonplaats || professional.postcode) && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {[professional.postcode, professional.woonplaats].filter(Boolean).join(' ')}
                  </span>
                )}
                {professional.email && (
                  <a href={`mailto:${professional.email}`} className="flex items-center gap-1 hover:text-primary transition-colors">
                    <Mail className="h-3.5 w-3.5" />
                    {professional.email}
                  </a>
                )}
                {professional.telefoonnummer && (
                  <a href={`tel:${professional.telefoonnummer}`} className="flex items-center gap-1 hover:text-primary transition-colors">
                    <Phone className="h-3.5 w-3.5" />
                    {professional.telefoonnummer}
                  </a>
                )}
              </div>
            </div>

            {/* Action Buttons - Apple style with overflow menu for destructive */}
            {!isEditing && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleEdit}>
                  <Edit className="h-4 w-4 mr-1" />
                  Bewerken
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem 
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteDialogOpen(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Verwijderen
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </div>

        {/* Delete Confirmation Dialog - Apple style */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Professional verwijderen</AlertDialogTitle>
              <AlertDialogDescription>
                Weet je zeker dat je <span className="font-medium">{professional.full_name}</span> wilt verwijderen? 
                Deze actie kan niet ongedaan worden gemaakt.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Annuleren</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? "Verwijderen..." : "Verwijderen"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-4">
          {/* Apple style tabs - text only, no icons */}
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="profiel">Profiel</TabsTrigger>
            <TabsTrigger value="documenten" className="relative">
              Documenten
              {documents.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-orange-100 text-orange-700 text-[10px] font-semibold min-w-[18px] h-[18px] px-1">
                  {documents.length}
                </span>
              )}
              {documents.some(d => d.expires_at && new Date(d.expires_at) < new Date()) && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              )}
            </TabsTrigger>
            <TabsTrigger value="beschikbaarheid">Beschikbaarheid</TabsTrigger>
            <TabsTrigger value="ervaring">Ervaring</TabsTrigger>
            <TabsTrigger value="plaatsing">Plaatsing</TabsTrigger>
            <TabsTrigger value="historiek">Historiek</TabsTrigger>
          </TabsList>

          <TabsContent value="profiel" className="space-y-4 mt-6">
            {/* Persoonsgegevens Sectie */}
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg collapsible-glass collapsible-glass-rose">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Home className="h-4 w-4" />
                  Persoonsgegevens
                </h3>
                <ChevronDown className="h-4 w-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <div className="grid grid-cols-2 gap-4 p-3 bg-muted/20 rounded-lg">
                  <div>
                    <Label className="text-xs text-muted-foreground">Adres</Label>
                    {isEditing ? (
                      <Input value={editData.adres} onChange={(e) => setEditData({ ...editData, adres: e.target.value })} placeholder="Straatnaam 123" />
                    ) : (
                      <p className="text-sm mt-0.5">{professional.adres || "-"}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Postcode</Label>
                    {isEditing ? (
                      <Input value={editData.postcode} onChange={(e) => setEditData({ ...editData, postcode: e.target.value })} placeholder="1234 AB" />
                    ) : (
                      <p className="text-sm mt-0.5">{professional.postcode || "-"}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Woonplaats</Label>
                    {isEditing ? (
                      <Input value={editData.woonplaats} onChange={(e) => setEditData({ ...editData, woonplaats: e.target.value })} placeholder="Amsterdam" />
                    ) : (
                      <p className="text-sm mt-0.5">{professional.woonplaats || "-"}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Geboortedatum</Label>
                    {isEditing ? (
                      <Input type="date" value={editData.geboortedatum} onChange={(e) => setEditData({ ...editData, geboortedatum: e.target.value })} />
                    ) : (
                      <p className="text-sm mt-0.5">
                        {professional.geboortedatum 
                          ? format(new Date(professional.geboortedatum), "d MMMM yyyy", { locale: nl })
                          : "-"}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Regio</Label>
                    <p className="text-sm mt-0.5">{professional.regio || "-"}</p>
                  </div>
                  {professional.voorletters && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Voorletters</Label>
                      <p className="text-sm mt-0.5">{professional.voorletters}</p>
                    </div>
                  )}
                  {professional.geboorteplaats && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Geboorteplaats</Label>
                      <p className="text-sm mt-0.5">{professional.geboorteplaats}</p>
                    </div>
                  )}
                  {professional.geslacht && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Geslacht</Label>
                      <p className="text-sm mt-0.5">{professional.geslacht}</p>
                    </div>
                  )}
                  {isAdmin() && (
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Shield className="h-3 w-3" />
                        BSN
                      </Label>
                      {bsnData.revealed && bsnData.bsn ? (
                        <p className="text-sm mt-0.5 font-mono">{bsnData.bsn}</p>
                      ) : (
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-sm font-mono text-muted-foreground">***-***-***</p>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={fetchAndRevealBsn}
                            disabled={bsnData.loading}
                          >
                            {bsnData.loading ? "..." : (
                              <>
                                <EyeOff className="h-3 w-3 mr-1" />
                                Toon
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            {/* CV Sectie */}
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg collapsible-glass collapsible-glass-rose">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  CV / Curriculum Vitae
                </h3>
                <ChevronDown className="h-4 w-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <div className="p-3 bg-muted/20 rounded-lg">
                  {professional.cv_file_path ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{professional.cv_file_name || 'CV.pdf'}</p>
                          {professional.cv_uploaded_at && (
                            <p className="text-xs text-muted-foreground">
                              Geüpload op {format(new Date(professional.cv_uploaded_at), "d MMMM yyyy", { locale: nl })}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              const { data } = await supabase.storage
                                .from('application-cvs')
                                .createSignedUrl(professional.cv_file_path!, 60);
                              if (data?.signedUrl) {
                                window.open(data.signedUrl, '_blank');
                              }
                            } catch (error) {
                              console.error('Error opening CV:', error);
                              toast.error('Kon CV niet openen');
                            }
                          }}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Bekijken
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              const { data } = await supabase.storage
                                .from('application-cvs')
                                .download(professional.cv_file_path!);
                              if (data) {
                                const url = URL.createObjectURL(data);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = professional.cv_file_name || 'CV.pdf';
                                a.click();
                                URL.revokeObjectURL(url);
                              }
                            } catch (error) {
                              console.error('Error downloading CV:', error);
                              toast.error('Kon CV niet downloaden');
                            }
                          }}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground mb-3">Nog geen CV geüpload</p>
                      <label className="cursor-pointer">
                        <Button size="sm" variant="outline" asChild>
                          <span>
                            <Upload className="h-4 w-4 mr-1" />
                            CV Uploaden
                          </span>
                        </Button>
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            
                            try {
                              const fileExt = file.name.split('.').pop();
                              const fileName = `${professional.id}/${Date.now()}-cv.${fileExt}`;
                              
                              const { error: uploadError } = await supabase.storage
                                .from('application-cvs')
                                .upload(fileName, file);
                              
                              if (uploadError) throw uploadError;
                              
                              await supabase
                                .from('professionals')
                                .update({ 
                                  cv_file_path: fileName,
                                  cv_file_name: file.name,
                                  cv_uploaded_at: new Date().toISOString()
                                })
                                .eq('id', professional.id);
                              
                              toast.success('CV geüpload!');
                              onSuccess?.();
                            } catch (error) {
                              console.error('Upload error:', error);
                              toast.error('Fout bij uploaden CV');
                            }
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Bendy Groepen */}
            {professional.bendy_groepen && professional.bendy_groepen.length > 0 && (
              <>
                <Separator />
                <Collapsible defaultOpen>
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg collapsible-glass collapsible-glass-rose">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Bendy Groepen
                    </h3>
                    <ChevronDown className="h-4 w-4" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3">
                    <div className="flex flex-wrap gap-2 p-3">
                      {professional.bendy_groepen.map((groep: string) => (
                        <Badge key={groep} variant="outline" className="bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800">
                          {groep}
                        </Badge>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}

            <Separator />

            {/* Contact Info - Collapsible */}
            <Collapsible open={contactOpen} onOpenChange={setContactOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg collapsible-glass collapsible-glass-rose">
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
                <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg collapsible-glass collapsible-glass-rose">
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

                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Bedrijfsgegevens (Bendy) */}
            {(professional.bedrijfsnaam || professional.kvk_nummer || professional.big_nummer || professional.agb_code || professional.skj_registratie || professional.btw_nummer || professional.iban || professional.boekhouding_email || professional.bedrijfstelefoon) && (
              <Collapsible defaultOpen={false}>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-teal-200/50 bg-teal-500/5 px-4 py-3 text-sm font-medium transition-colors hover:bg-teal-500/10">
                  <span className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-teal-600" />
                    Bedrijfsgegevens (Bendy)
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    {professional.bedrijfsnaam && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Bedrijfsnaam</Label>
                        <p className="text-sm mt-1 p-2 bg-muted/30 rounded-md">{professional.bedrijfsnaam}</p>
                      </div>
                    )}
                    {professional.kvk_nummer && (
                      <div>
                        <Label className="text-xs text-muted-foreground">KvK</Label>
                        <p className="text-sm mt-1 p-2 bg-muted/30 rounded-md font-mono">{professional.kvk_nummer}</p>
                      </div>
                    )}
                    {professional.big_nummer && (
                      <div>
                        <Label className="text-xs text-muted-foreground">BIG-nummer</Label>
                        <p className="text-sm mt-1 p-2 bg-muted/30 rounded-md font-mono">{professional.big_nummer}</p>
                      </div>
                    )}
                    {professional.agb_code && (
                      <div>
                        <Label className="text-xs text-muted-foreground">AGB-code</Label>
                        <p className="text-sm mt-1 p-2 bg-muted/30 rounded-md font-mono">{professional.agb_code}</p>
                      </div>
                    )}
                    {professional.skj_registratie && (
                      <div>
                        <Label className="text-xs text-muted-foreground">SKJ-registratie</Label>
                        <p className="text-sm mt-1 p-2 bg-muted/30 rounded-md font-mono">{professional.skj_registratie}</p>
                      </div>
                    )}
                    {professional.btw_nummer && (
                      <div>
                        <Label className="text-xs text-muted-foreground">BTW-nummer</Label>
                        <p className="text-sm mt-1 p-2 bg-muted/30 rounded-md font-mono">{professional.btw_nummer}</p>
                      </div>
                    )}
                    {professional.iban && (
                      <div className="col-span-2">
                        <Label className="text-xs text-muted-foreground">IBAN</Label>
                        <p className="text-sm mt-1 p-2 bg-muted/30 rounded-md font-mono">{professional.iban}</p>
                        {professional.iban_tenaamstelling && (
                          <p className="text-xs text-muted-foreground mt-1">t.n.v. {professional.iban_tenaamstelling}</p>
                        )}
                      </div>
                    )}
                    {professional.boekhouding_email && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Boekhouding e-mail</Label>
                        <p className="text-sm mt-1 p-2 bg-muted/30 rounded-md">{professional.boekhouding_email}</p>
                      </div>
                    )}
                    {professional.bedrijfstelefoon && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Bedrijfstelefoon</Label>
                        <p className="text-sm mt-1 p-2 bg-muted/30 rounded-md">{professional.bedrijfstelefoon}</p>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

          </TabsContent>

          {/* ===== DOCUMENTEN TAB ===== */}
          <TabsContent value="documenten" className="space-y-4 mt-6">
            {documentsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : (
                <>
                  {/* KPI Grid */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="rounded-xl border bg-card/50 backdrop-blur-sm p-3 text-center">
                      <p className="text-2xl font-bold">{documents.length}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Totaal</p>
                    </div>
                    <div className="rounded-xl border border-green-200/50 bg-green-500/5 p-3 text-center">
                      <p className="text-2xl font-bold text-green-700 dark:text-green-400">{documentStats.valid.length}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Geldig</p>
                    </div>
                    <div className="rounded-xl border border-orange-200/50 bg-orange-500/5 p-3 text-center">
                      <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">{documentStats.expiringSoon.length}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Binnenkort</p>
                    </div>
                    <div className="rounded-xl border border-red-200/50 bg-red-500/5 p-3 text-center">
                      <p className="text-2xl font-bold text-red-700 dark:text-red-400">{documentStats.expired.length}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Verlopen</p>
                    </div>
                  </div>

                  {/* Sync info */}
                  {professional.documents_synced_at && (
                    <p className="text-[11px] text-muted-foreground text-right">
                      Laatst gesynchroniseerd: {format(new Date(professional.documents_synced_at), "d MMM yyyy, HH:mm", { locale: nl })}
                    </p>
                  )}

                  {/* Verlopen documenten alert */}
                  {documentStats.expired.length > 0 && (
                    <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <XCircle className="h-4 w-4 text-red-600" />
                        <span className="text-sm font-semibold text-red-700 dark:text-red-400">
                          {documentStats.expired.length} verlopen document{documentStats.expired.length !== 1 ? 'en' : ''}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {documentStats.expired.map(doc => (
                          <div key={doc.id} className="flex items-center justify-between text-sm">
                            <span className="text-red-800 dark:text-red-300 font-medium">{doc.document_name}</span>
                            <span className="text-red-600 dark:text-red-400 text-xs tabular-nums">
                              Verlopen {format(new Date(doc.expires_at), "d MMM yyyy", { locale: nl })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bijna verlopen waarschuwing */}
                  {documentStats.expiringSoon.length > 0 && (
                    <div className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/20 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="h-4 w-4 text-orange-600" />
                        <span className="text-sm font-semibold text-orange-700 dark:text-orange-400">
                          {documentStats.expiringSoon.length} document{documentStats.expiringSoon.length !== 1 ? 'en' : ''} verlo{documentStats.expiringSoon.length !== 1 ? 'pen' : 'opt'} binnenkort
                        </span>
                      </div>
                      <div className="space-y-1">
                        {documentStats.expiringSoon.map(doc => {
                          const daysLeft = Math.ceil((new Date(doc.expires_at).getTime() - documentStats.now.getTime()) / (1000 * 60 * 60 * 24));
                          return (
                            <div key={doc.id} className="flex items-center justify-between text-sm">
                              <span className="text-orange-800 dark:text-orange-300 font-medium">{doc.document_name}</span>
                              <span className="text-orange-600 dark:text-orange-400 text-xs tabular-nums">
                                Nog {daysLeft} dag{daysLeft !== 1 ? 'en' : ''} — {format(new Date(doc.expires_at), "d MMM yyyy", { locale: nl })}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Documenten tabel */}
                  {documents.length > 0 ? (
                    <div className="rounded-lg border overflow-hidden">
                      {/* Tabel header */}
                      <div className="grid grid-cols-[1fr_140px_100px_70px_70px] gap-2 px-4 py-2.5 bg-muted/40 border-b text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        <span>Document</span>
                        <span>Type</span>
                        <span>Verloopdatum</span>
                        <span className="text-right">Status</span>
                        <span className="text-right">Gepubl.</span>
                      </div>
                      {/* Tabel rows */}
                      <div className="divide-y">
                        {documents.map((doc) => {
                          const isExpired = doc.expires_at && new Date(doc.expires_at) < documentStats.now;
                          const isExpiringSoon = doc.expires_at && !isExpired && new Date(doc.expires_at) <= documentStats.ninetyDays;
                          const daysLeft = doc.expires_at ? Math.ceil((new Date(doc.expires_at).getTime() - documentStats.now.getTime()) / (1000 * 60 * 60 * 24)) : null;
                          return (
                            <Collapsible key={doc.id}>
                              <CollapsibleTrigger className="grid grid-cols-[1fr_140px_100px_70px_70px] gap-2 w-full px-4 py-2.5 text-sm hover:bg-muted/30 transition-colors text-left items-center group">
                                {/* Kolom 1: Document naam + icoon */}
                                <div className="flex items-center gap-2 min-w-0">
                                  <FileText className={cn(
                                    "h-4 w-4 flex-shrink-0",
                                    isExpired ? "text-red-500" :
                                    isExpiringSoon ? "text-orange-500" :
                                    "text-muted-foreground"
                                  )} />
                                  <span className="truncate font-medium">{doc.document_name}</span>
                                  <ChevronDown className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                </div>
                                {/* Kolom 2: Type */}
                                <span className="text-xs text-muted-foreground truncate">
                                  {doc.document_type && doc.document_type !== doc.document_name ? doc.document_type : "—"}
                                </span>
                                {/* Kolom 3: Verloopdatum */}
                                <span className={cn(
                                  "text-xs tabular-nums",
                                  isExpired ? "text-red-600 font-semibold" :
                                  isExpiringSoon ? "text-orange-600 font-medium" :
                                  doc.expires_at ? "text-muted-foreground" : "text-muted-foreground/50"
                                )}>
                                  {doc.expires_at
                                    ? format(new Date(doc.expires_at), "d MMM yyyy", { locale: nl })
                                    : "Permanent"}
                                </span>
                                {/* Kolom 4: Status badge */}
                                <div className="flex justify-end">
                                  {isExpired ? (
                                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Verlopen</Badge>
                                  ) : isExpiringSoon ? (
                                    <Badge variant="warning" className="text-[10px] px-1.5 py-0">{daysLeft}d</Badge>
                                  ) : doc.expires_at ? (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-300 text-green-700 bg-green-500/5">Geldig</Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">∞</Badge>
                                  )}
                                </div>
                                {/* Kolom 5: Gepubliceerd */}
                                <div className="flex justify-end">
                                  {doc.published ? (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-300 text-green-700 bg-green-500/5">Ja</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-300 text-orange-600 bg-orange-500/5">Nee</Badge>
                                  )}
                                </div>
                              </CollapsibleTrigger>
                              {/* Detail panel */}
                              <CollapsibleContent>
                                <div className={cn(
                                  "mx-4 mb-2 rounded-md px-4 py-3 text-sm border-l-2",
                                  isExpired ? "bg-red-50 dark:bg-red-950/10 border-l-red-400" :
                                  isExpiringSoon ? "bg-orange-50 dark:bg-orange-950/10 border-l-orange-400" :
                                  "bg-muted/20 border-l-muted-foreground/20"
                                )}>
                                  <div className="grid grid-cols-2 gap-3">
                                    {doc.document_number && (
                                      <div>
                                        <p className="text-[11px] text-muted-foreground">Documentnummer</p>
                                        <p className="font-mono text-xs mt-0.5">{doc.document_number}</p>
                                      </div>
                                    )}
                                    {doc.issuer && (
                                      <div>
                                        <p className="text-[11px] text-muted-foreground">Uitgever</p>
                                        <p className="text-xs mt-0.5">{doc.issuer}</p>
                                      </div>
                                    )}
                                    {doc.start_date && (
                                      <div>
                                        <p className="text-[11px] text-muted-foreground">Geldig vanaf</p>
                                        <p className="text-xs mt-0.5 tabular-nums">{format(new Date(doc.start_date), "d MMM yyyy", { locale: nl })}</p>
                                      </div>
                                    )}
                                    {doc.expires_at && (
                                      <div>
                                        <p className="text-[11px] text-muted-foreground">Geldig tot</p>
                                        <p className={cn("text-xs mt-0.5 tabular-nums", isExpired && "text-red-600 font-semibold")}>
                                          {format(new Date(doc.expires_at), "d MMM yyyy", { locale: nl })}
                                        </p>
                                      </div>
                                    )}
                                    {doc.source && (
                                      <div>
                                        <p className="text-[11px] text-muted-foreground">Bron</p>
                                        <p className="text-xs mt-0.5">{doc.source}</p>
                                      </div>
                                    )}
                                    <div>
                                      <p className="text-[11px] text-muted-foreground">Gepubliceerd</p>
                                      <p className="text-xs mt-0.5">{doc.published ? "Ja" : "Nee"}</p>
                                    </div>
                                  </div>
                                  {doc.bendy_updated_at && (
                                    <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-muted/30">
                                      Laatst bijgewerkt in Bendy: {format(new Date(doc.bendy_updated_at), "d MMM yyyy, HH:mm", { locale: nl })}
                                    </p>
                                  )}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Geen documenten gesynchroniseerd</p>
                      <p className="text-xs mt-1">Synchroniseer documenten via de Bendy Sync pagina</p>
                    </div>
                  )}
                </>
            )}
          </TabsContent>

          <TabsContent value="ervaring" className="space-y-6 mt-6">
            {/* Sector Ervaring */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Sector Ervaring
              </h3>
              <div className="flex flex-wrap gap-2">
                {(professional.ervaring_sector?.length ?? 0) > 0 ? (
                  professional.ervaring_sector?.map((sector) => (
                    <Badge key={sector} className={getSectorColor(sector)}>{sector}</Badge>
                  ))
                ) : professional.skills?.length > 0 ? (
                  professional.skills.map((skill) => (
                    <Badge key={skill} className={getSectorColor(skill)}>{skill}</Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Geen sector ervaring opgegeven</p>
                )}
              </div>
            </div>

            <Separator />

            {/* Doelgroep Ervaring */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4" />
                Doelgroep Ervaring
              </h3>
              <div className="flex flex-wrap gap-2">
                {(professional.doelgroep_ervaring?.length ?? 0) > 0 ? (
                  professional.doelgroep_ervaring?.map((doelgroep) => (
                    <Badge key={doelgroep} variant="outline" className="bg-violet-500/10 text-violet-700 border-violet-200">
                      {doelgroep}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Geen doelgroep ervaring opgegeven</p>
                )}
              </div>
            </div>

            <Separator />

            {/* Certificaten */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Award className="h-4 w-4" />
                Certificaten
              </h3>
              <div className="flex flex-wrap gap-2">
                {(professional.certificaten?.length ?? 0) > 0 ? (
                  professional.certificaten?.map((cert) => (
                    <Badge key={cert} variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-200">
                      {cert}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Geen certificaten opgegeven</p>
                )}
              </div>
            </div>

            <Separator />

            {/* Opleidingen */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Award className="h-4 w-4" />
                Opleidingen
              </h3>
              {(() => {
                const opleidingen = Array.isArray(professional.opleidingen) ? professional.opleidingen : [];
                return opleidingen.length > 0 ? (
                  <div className="space-y-2">
                    {opleidingen.map((opl: any, idx: number) => (
                      <div key={idx} className="p-3 bg-muted/30 rounded-lg">
                        <p className="text-sm font-medium">{opl.naam || opl}</p>
                        {(opl.niveau || opl.jaar) && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {[opl.niveau, opl.jaar].filter(Boolean).join(' • ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Geen opleidingen opgegeven</p>
                );
              })()}
            </div>

            <Separator />

            {/* Talen */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <span className="text-base">🗣️</span>
                Talen
              </h3>
              <div className="flex flex-wrap gap-2">
                {(professional.talen?.length ?? 0) > 0 ? (
                  professional.talen?.map((taal) => (
                    <Badge key={taal} variant="secondary">{taal}</Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Geen talen opgegeven</p>
                )}
              </div>
            </div>

            <Separator />

            {/* Regio Voorkeur */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Regio Voorkeur
              </h3>
              <div className="flex flex-wrap gap-2">
                {(professional.regio_voorkeur?.length ?? 0) > 0 ? (
                  professional.regio_voorkeur?.map((regio) => (
                    <Badge key={regio} variant="outline">{regio}</Badge>
                  ))
                ) : professional.regio ? (
                  <Badge variant="outline">{professional.regio}</Badge>
                ) : (
                  <p className="text-sm text-muted-foreground">Geen regio voorkeur opgegeven</p>
                )}
              </div>
              {professional.max_reisafstand_km && (
                <p className="text-sm text-muted-foreground">
                  Max. reisafstand: {professional.max_reisafstand_km} km
                </p>
              )}
            </div>

            <Separator />

            {/* Specialisaties */}
            {(professional.specialisaties?.length ?? 0) > 0 && (
              <>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Star className="h-4 w-4" />
                    Specialisaties
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {professional.specialisaties?.map((spec) => (
                      <Badge key={spec} className="bg-primary/10 text-primary border-primary/20">{spec}</Badge>
                    ))}
                  </div>
                </div>
                <Separator />
              </>
            )}

            {professional.rating && (
              <>
                <div>
                  <Label>Rating</Label>
                  <div className="flex items-center gap-1 mt-1">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <span className="text-sm font-medium">{professional.rating.toFixed(1)}</span>
                  </div>
                </div>
                <Separator />
              </>
            )}

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

          <TabsContent value="historiek" className="mt-6">
            <PlacementHistory professionalId={professional.id} isActive={activeTab === "historiek"} />
          </TabsContent>

          <TabsContent value="plaatsing" className="mt-6">
            <SublocationSelectorPanel
              professionalId={professional.id}
              professionalName={professional.full_name}
              professionalData={{
                id: professional.id,
                full_name: professional.full_name,
                functie_niveau: professional.functie_niveau,
                werkvorm: professional.werkvorm,
                regio: professional.regio,
                woonplaats: professional.woonplaats,
                postcode: professional.postcode,
                skills: professional.skills,
                status: professional.status,
                beschikbaarheidsnotities: professional.beschikbaarheidsnotities,
                heeft_auto: professional.heeft_auto,
                heeft_rijbewijs: professional.heeft_rijbewijs,
                ervaring_sector: professional.ervaring_sector,
                doelgroep_ervaring: professional.doelgroep_ervaring,
                certificaten: professional.certificaten,
                specialisaties: professional.specialisaties,
                talen: professional.talen,
                regio_voorkeur: professional.regio_voorkeur,
                specifieke_doelgroepen: professional.specifieke_doelgroepen,
                max_reisafstand_km: professional.max_reisafstand_km,
              }}
              onSuccess={onSuccess}
            />
          </TabsContent>

          <TabsContent value="beschikbaarheid" className="space-y-6 mt-6">
            <BeschikbaarheidMiniKalender professionalId={professional.id} />
            <Separator />
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
                <p className="text-sm mt-1 p-3 bg-muted/30 rounded-md min-h-[60px]">
                  {professional.beschikbaarheidsnotities || "Geen notities"}
                </p>
              )}
            </div>
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
