import { useState } from "react";
import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, Phone, MapPin, Edit2, Save, X, Plus, ChevronDown, Upload, ImageIcon, Building2, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { SublocationCard } from "./organization/SublocationCard";
import { LocationCard } from "./organization/LocationCard";
import { SublocationDetailModal } from "./organization/SublocationDetailModal";
import { LocationDetailModal } from "./organization/LocationDetailModal";
import { OrganizationDetailModal } from "./organization/OrganizationDetailModal";

interface ClientDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: {
    id: string;
    name: string;
    company: string;
    org_id: string;
    client_org_id?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    notes?: string | null;
    logo_url?: string | null;
    regio?: string[] | null;
    sector?: string[] | null;
    doelgroep?: string[] | null;
    gezochte_functies?: string[] | null;
    organizations?: {
      name: string;
    };
  };
  onUpdate: () => void;
}

const SECTOREN = ["VVT", "GGZ", "GHZ", "Jeugdzorg", "Ziekenhuis", "Thuiszorg"];
const DOELGROEPEN = ["Ouderen", "LVB", "Psychiatrie", "Somatiek", "Kinderen/Jeugd", "Verslaving"];
const FUNCTIES = ["VIG", "HBO-V", "Verpleegkundige MBO", "Helpende", "Begeleider", "Persoonlijk begeleider", "GGZ-agoog"];

// Semantic color mappings
const SECTOR_COLORS: Record<string, { selected: string; outline: string }> = {
  "VVT": { selected: "bg-blue-500 text-white border-blue-500", outline: "border-blue-500 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950" },
  "GGZ": { selected: "bg-purple-500 text-white border-purple-500", outline: "border-purple-500 text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950" },
  "GHZ": { selected: "bg-green-500 text-white border-green-500", outline: "border-green-500 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950" },
  "Jeugdzorg": { selected: "bg-orange-500 text-white border-orange-500", outline: "border-orange-500 text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950" },
  "Ziekenhuis": { selected: "bg-red-500 text-white border-red-500", outline: "border-red-500 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950" },
  "Thuiszorg": { selected: "bg-teal-500 text-white border-teal-500", outline: "border-teal-500 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950" },
};

const DOELGROEP_COLORS: Record<string, { selected: string; outline: string }> = {
  "Ouderen": { selected: "bg-amber-500 text-white border-amber-500", outline: "border-amber-500 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950" },
  "LVB": { selected: "bg-emerald-500 text-white border-emerald-500", outline: "border-emerald-500 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950" },
  "Psychiatrie": { selected: "bg-indigo-500 text-white border-indigo-500", outline: "border-indigo-500 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950" },
  "Somatiek": { selected: "bg-rose-500 text-white border-rose-500", outline: "border-rose-500 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950" },
  "Kinderen/Jeugd": { selected: "bg-cyan-500 text-white border-cyan-500", outline: "border-cyan-500 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950" },
  "Verslaving": { selected: "bg-slate-500 text-white border-slate-500", outline: "border-slate-500 text-slate-700 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-950" },
};

const FUNCTIE_COLORS: Record<string, { selected: string; outline: string }> = {
  "VIG": { selected: "bg-blue-600 text-white border-blue-600", outline: "border-blue-600 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950" },
  "HBO-V": { selected: "bg-purple-600 text-white border-purple-600", outline: "border-purple-600 text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950" },
  "Verpleegkundige MBO": { selected: "bg-green-600 text-white border-green-600", outline: "border-green-600 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950" },
  "Helpende": { selected: "bg-orange-600 text-white border-orange-600", outline: "border-orange-600 text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950" },
  "Begeleider": { selected: "bg-teal-600 text-white border-teal-600", outline: "border-teal-600 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950" },
  "Persoonlijk begeleider": { selected: "bg-indigo-600 text-white border-indigo-600", outline: "border-indigo-600 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950" },
  "GGZ-agoog": { selected: "bg-pink-600 text-white border-pink-600", outline: "border-pink-600 text-pink-700 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950" },
};

export default function ClientDetailModal({ open, onOpenChange, client, onUpdate }: ClientDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedSublocation, setSelectedSublocation] = useState<any>(null);
  const [selectedLocation, setSelectedLocation] = useState<any>(null);
  const [isSublocationModalOpen, setIsSublocationModalOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isOrganizationModalOpen, setIsOrganizationModalOpen] = useState(false);

  // Fetch linked organization and sublocations
  const { data: linkedOrg, isLoading: loadingOrg } = useQuery({
    queryKey: ["client-organization", client.client_org_id],
    queryFn: async () => {
      if (!client.client_org_id) return null;
      
      const { data, error } = await supabase
        .from("client_organizations")
        .select(`
          *,
          client_locations (
            *,
            client_sublocations (
              *,
              hourly_rates (
                id,
                basis_tarief,
                uursoort_naam
              )
            )
          )
        `)
        .eq("id", client.client_org_id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!client.client_org_id && open,
  });

  // Avatar helpers (consistent with ClientCard)
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .slice(0, 2)
      .map(word => word[0])
      .join("")
      .toUpperCase();
  };

  const getSectorAvatarColor = () => {
    const currentSector = isEditing ? sectoren : (client.sector || []);
    if (currentSector && currentSector.length > 0) {
      const sector = currentSector[0];
      switch (sector) {
        case "GGZ": return "bg-blue-600";
        case "GHZ": return "bg-emerald-600";
        case "Jeugdzorg": return "bg-orange-500";
        case "VVT": return "bg-purple-600";
        case "Ziekenhuis": return "bg-red-500";
        case "Thuiszorg": return "bg-cyan-600";
        default: return "bg-slate-500";
      }
    }
    return "bg-slate-400";
  };

  // Form state
  const [name, setName] = useState(client.name);
  const [company, setCompany] = useState(client.company);
  const [email, setEmail] = useState(client.email || "");
  const [phone, setPhone] = useState(client.phone || "");
  const [address, setAddress] = useState(client.address || "");
  const [notes, setNotes] = useState(client.notes || "");
  const [logoUrl, setLogoUrl] = useState(client.logo_url || "");
  const [regios, setRegios] = useState<string[]>(client.regio || []);
  const [sectoren, setSectoren] = useState<string[]>(client.sector || []);
  const [doelgroepen, setDoelgroepen] = useState<string[]>(client.doelgroep || []);
  const [functies, setFuncties] = useState<string[]>(client.gezochte_functies || []);
  const [newRegio, setNewRegio] = useState("");

  // Collapsible state - smart defaults
  const [contactOpen, setContactOpen] = useState(true);

  // Calculate completeness score
  const calculateCompleteness = () => {
    const currentEmail = isEditing ? email : client.email;
    const currentPhone = isEditing ? phone : client.phone;
    const currentAddress = isEditing ? address : client.address;
    const currentRegio = isEditing ? regios : (client.regio || []);
    const currentSector = isEditing ? sectoren : (client.sector || []);
    const currentDoelgroep = isEditing ? doelgroepen : (client.doelgroep || []);
    const currentFuncties = isEditing ? functies : (client.gezochte_functies || []);

    let score = 0;
    const total = 7;

    if (currentEmail) score++;
    if (currentPhone) score++;
    if (currentAddress) score++;
    if (currentRegio.length > 0) score++;
    if (currentSector.length > 0) score++;
    if (currentDoelgroep.length > 0) score++;
    if (currentFuncties.length > 0) score++;

    return { score, total, percentage: Math.round((score / total) * 100) };
  };

  const completeness = calculateCompleteness();

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (isEditing) handleSave();
      } else if (e.key === 'Escape') {
        if (isEditing) {
          handleCancel();
        } else {
          onOpenChange(false);
        }
      } else if (e.key === 'e' && !isEditing && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        setIsEditing(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isEditing]);

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error("Alleen afbeeldingen zijn toegestaan");
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Afbeelding mag maximaal 2MB zijn");
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${client.id}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('client-logos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('client-logos')
        .getPublicUrl(filePath);

      setLogoUrl(publicUrl);
      toast.success("Logo geüpload");
    } catch (error: any) {
      console.error("Error uploading logo:", error);
      toast.error("Kon logo niet uploaden");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("clients")
        .update({
          name,
          company,
          email: email || null,
          phone: phone || null,
          address: address || null,
          notes: notes || null,
          logo_url: logoUrl || null,
          regio: regios.length > 0 ? regios : null,
          sector: sectoren.length > 0 ? sectoren : null,
          doelgroep: doelgroepen.length > 0 ? doelgroepen : null,
          gezochte_functies: functies.length > 0 ? functies : null,
        })
        .eq("id", client.id);

      if (error) throw error;

      toast.success("Klant bijgewerkt");
      setIsEditing(false);
      onUpdate();
    } catch (error: any) {
      console.error("Error updating client:", error);
      toast.error("Kon klant niet bijwerken");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setName(client.name);
    setCompany(client.company);
    setEmail(client.email || "");
    setPhone(client.phone || "");
    setAddress(client.address || "");
    setNotes(client.notes || "");
    setLogoUrl(client.logo_url || "");
    setRegios(client.regio || []);
    setSectoren(client.sector || []);
    setDoelgroepen(client.doelgroep || []);
    setFuncties(client.gezochte_functies || []);
    setIsEditing(false);
  };

  const toggleSector = (sector: string) => {
    setSectoren(prev => 
      prev.includes(sector) ? prev.filter(s => s !== sector) : [...prev, sector]
    );
  };

  const toggleDoelgroep = (doelgroep: string) => {
    setDoelgroepen(prev =>
      prev.includes(doelgroep) ? prev.filter(d => d !== doelgroep) : [...prev, doelgroep]
    );
  };

  const toggleFunctie = (functie: string) => {
    setFuncties(prev =>
      prev.includes(functie) ? prev.filter(f => f !== functie) : [...prev, functie]
    );
  };

  const addRegio = () => {
    if (newRegio.trim() && !regios.includes(newRegio.trim().toLowerCase())) {
      setRegios([...regios, newRegio.trim().toLowerCase()]);
      setNewRegio("");
    }
  };

  const removeRegio = (regio: string) => {
    setRegios(regios.filter(r => r !== regio));
  };

  const handleInlineAdd = (section: 'contact' | 'matching') => {
    setIsEditing(true);
    setTimeout(() => {
      if (section === 'contact') {
        setContactOpen(true);
      }
    }, 100);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Avatar with logo or initials */}
              <Avatar className="h-12 w-12">
                {client.logo_url && (
                  <AvatarImage src={client.logo_url} alt={client.company} />
                )}
                <AvatarFallback className={getSectorAvatarColor()}>
                  {getInitials(client.company)}
                </AvatarFallback>
              </Avatar>
              <span>{client.name}</span>
              <Badge 
                className={
                  client.organizations?.name === "ABCzorg" 
                    ? "bg-blue-600 hover:bg-blue-700 text-white" 
                    : "bg-orange-500 hover:bg-orange-600 text-white"
                }
              >
                {client.organizations?.name || "Onbekend"}
              </Badge>
              {/* Animated progress ring */}
              <div className="flex items-center gap-2">
                <svg width="20" height="20" viewBox="0 0 24 24" className="transform -rotate-90">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="text-muted opacity-20"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeDasharray={`${2 * Math.PI * 10}`}
                    strokeDashoffset={`${2 * Math.PI * 10 * (1 - completeness.score / completeness.total)}`}
                    className={`transition-all duration-500 ${
                      completeness.percentage === 100 
                        ? "text-green-500" 
                        : completeness.percentage >= 60 
                        ? "text-primary" 
                        : "text-orange-500 animate-pulse"
                    }`}
                    strokeLinecap="round"
                  />
                  {completeness.percentage === 100 && (
                    <text x="12" y="16" textAnchor="middle" className="text-[8px] fill-green-500 font-bold">✓</text>
                  )}
                </svg>
                <span className="text-xs text-muted-foreground">{completeness.percentage}%</span>
              </div>
            </div>
            <div className="flex gap-2">
              {!isEditing ? (
                <Button onClick={() => setIsEditing(true)} size="sm" variant="outline">
                  <Edit2 className="h-4 w-4 mr-2" />
                  Bewerk <span className="ml-1 text-xs text-muted-foreground opacity-50">(E)</span>
                </Button>
              ) : (
                <>
                  <Button onClick={handleCancel} size="sm" variant="outline" disabled={saving}>
                    Annuleer <span className="ml-1 text-xs text-muted-foreground opacity-50">(Esc)</span>
                  </Button>
                  <Button onClick={handleSave} size="sm" disabled={saving}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? "Opslaan..." : "Opslaan"} <span className="ml-1 text-xs text-muted-foreground opacity-50">(⌘S)</span>
                  </Button>
                </>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="mt-6">
          <TabsList className="w-full justify-start border-b border-border rounded-none bg-transparent p-0">
            <TabsTrigger value="overview" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              Overzicht
            </TabsTrigger>
            <TabsTrigger value="werklocaties" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              Werklocaties
              {linkedOrg && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                  {linkedOrg.client_locations?.reduce((acc: number, loc: any) => acc + (loc.client_sublocations?.length || 0), 0)}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="matching" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              Matching
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            <Collapsible open={contactOpen} onOpenChange={setContactOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full group hover:opacity-70 transition-opacity">
                <h3 className="font-medium text-sm">Contactgegevens</h3>
                <ChevronDown className={`h-4 w-4 transition-transform ${contactOpen ? 'rotate-180' : ''}`} />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Contactpersoon</Label>
                    {isEditing ? (
                      <Input 
                        value={name} 
                        onChange={(e) => setName(e.target.value)} 
                        className="mt-1 focus:ring-2 focus:ring-primary transition-all" 
                      />
                    ) : (
                      <p className="text-sm mt-1 px-3 py-2 bg-muted/30 rounded-md">{client.name}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Bedrijfsnaam</Label>
                    {isEditing ? (
                      <Input 
                        value={company} 
                        onChange={(e) => setCompany(e.target.value)} 
                        className="mt-1 focus:ring-2 focus:ring-primary transition-all" 
                      />
                    ) : (
                      <p className="text-sm mt-1 px-3 py-2 bg-muted/30 rounded-md">{client.company}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    {isEditing ? (
                      <Input 
                        type="email" 
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)} 
                        placeholder="Email toevoegen" 
                        className="focus:ring-2 focus:ring-primary transition-all"
                      />
                    ) : !client.email ? (
                      <button onClick={() => handleInlineAdd('contact')} className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                        <Plus className="h-3 w-3" />
                        <span>Voeg email toe →</span>
                      </button>
                    ) : (
                      <span className="px-3 py-1.5 bg-muted/30 rounded-md">{client.email}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    {isEditing ? (
                      <Input 
                        value={phone} 
                        onChange={(e) => setPhone(e.target.value)} 
                        placeholder="Telefoonnummer toevoegen" 
                        className="focus:ring-2 focus:ring-primary transition-all"
                      />
                    ) : !client.phone ? (
                      <button onClick={() => handleInlineAdd('contact')} className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                        <Plus className="h-3 w-3" />
                        <span>Voeg telefoonnummer toe →</span>
                      </button>
                    ) : (
                      <span className="px-3 py-1.5 bg-muted/30 rounded-md">{client.phone}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    {isEditing ? (
                      <Input 
                        value={address} 
                        onChange={(e) => setAddress(e.target.value)} 
                        placeholder="Adres toevoegen" 
                        className="focus:ring-2 focus:ring-primary transition-all"
                      />
                    ) : !client.address ? (
                      <button onClick={() => handleInlineAdd('contact')} className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                        <Plus className="h-3 w-3" />
                        <span>Voeg adres toe →</span>
                      </button>
                    ) : (
                      <span className="px-3 py-1.5 bg-muted/30 rounded-md">{client.address}</span>
                    )}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Logo Section - Always Visible with Premium Styling */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                Logo
              </h3>
              
              {logoUrl ? (
                <div className="flex items-start gap-4">
                  {/* Premium logo container - 120px */}
                  <div className="relative group">
                    <div className="w-30 h-30 rounded-lg border border-border/50 backdrop-blur-sm bg-gradient-to-br from-background/80 to-muted/40 shadow-lg flex items-center justify-center p-4 overflow-hidden">
                      <img 
                        src={logoUrl} 
                        alt={company} 
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>
                  {isEditing && (
                    <div className="flex flex-col gap-2 pt-2">
                      <Label htmlFor="logo-upload" className="cursor-pointer">
                        <div className="px-3 py-1.5 text-sm border rounded hover:bg-muted transition-colors">
                          Wijzig
                        </div>
                      </Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setLogoUrl("")}
                      >
                        Verwijder
                      </Button>
                    </div>
                  )}
                </div>
              ) : isEditing ? (
                <Label htmlFor="logo-upload" className="cursor-pointer block">
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg py-4 hover:border-primary/50 hover:bg-muted/30 transition-all text-center">
                    <div className="flex flex-col items-center gap-2">
                      <ImageIcon className="h-10 w-10 text-muted-foreground" />
                      <div className="text-sm">
                        <span className="text-foreground font-medium">Klik om logo te uploaden</span>
                        <p className="text-xs text-muted-foreground mt-1">
                          JPG, PNG of SVG · max 2MB
                        </p>
                      </div>
                    </div>
                  </div>
                </Label>
              ) : (
                /* Large initials avatar fallback - 120px */
                <div className="w-30 h-30 rounded-lg border border-border/50 backdrop-blur-sm bg-gradient-to-br from-background/80 to-muted/40 shadow-lg flex items-center justify-center">
                  <Avatar className="h-24 w-24">
                    <AvatarFallback className={`${getSectorAvatarColor()} text-4xl`}>
                      {getInitials(client.company)}
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}
              
              <input
                id="logo-upload"
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
                disabled={uploading}
              />
            </div>

            {/* Notities in Collapsible */}
            <Collapsible defaultOpen={!!client.notes}>
              <CollapsibleTrigger className="flex items-center justify-between w-full group hover:opacity-70 transition-opacity">
                <h3 className="font-medium text-sm">Notities</h3>
                <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 mt-4">
                {isEditing ? (
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Extra opmerkingen over deze klant..."
                    rows={4}
                    className="mt-1 focus:ring-2 focus:ring-primary transition-all"
                  />
                ) : (
                  <p className="text-sm mt-1 whitespace-pre-wrap px-3 py-2 bg-muted/30 rounded-md">
                    {client.notes || "Geen notities"}
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>
          </TabsContent>

          {/* Matching Tab */}
          <TabsContent value="matching" className="space-y-6 mt-6">
            <div className="space-y-5">
              <h3 className="font-medium text-sm">Matching Criteria</h3>
              
              {/* Regio's */}
              <div>
                <Label className="text-xs text-muted-foreground">Regio's</Label>
                {isEditing ? (
                  <div className="space-y-2 mt-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Bijv. Utrecht, Nijmegen"
                        value={newRegio}
                        onChange={(e) => setNewRegio(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRegio())}
                      />
                      <Button size="sm" onClick={addRegio}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {regios.map((regio) => (
                        <Badge key={regio} variant="secondary" className="cursor-pointer" onClick={() => removeRegio(regio)}>
                          {regio} <X className="h-3 w-3 ml-1" />
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(client.regio || []).length > 0 ? (
                      client.regio?.map((r) => (
                        <Badge key={r} variant="secondary">{r}</Badge>
                      ))
                    ) : (
                      <button onClick={() => handleInlineAdd('matching')} className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                        <Plus className="h-3 w-3" />
                        <span>Voeg regio's toe →</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Sectoren */}
              <div>
                <Label className="text-xs text-muted-foreground">Sectoren</Label>
                {isEditing ? (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {SECTOREN.map((sector) => {
                      const isSelected = sectoren.includes(sector);
                      const colors = SECTOR_COLORS[sector] || { selected: "bg-primary text-primary-foreground", outline: "border-primary text-primary" };
                      return (
                        <Badge
                          key={sector}
                          variant="outline"
                          className={`cursor-pointer transition-all ${isSelected ? colors.selected : colors.outline}`}
                          onClick={() => toggleSector(sector)}
                        >
                          {sector}
                          {isSelected && <X className="h-3 w-3 ml-1" />}
                        </Badge>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(client.sector || []).length > 0 ? (
                      client.sector?.map((s) => {
                        const colors = SECTOR_COLORS[s] || { selected: "bg-secondary text-secondary-foreground", outline: "" };
                        return (
                          <Badge key={s} variant="outline" className={colors.outline}>{s}</Badge>
                        );
                      })
                    ) : (
                      <button onClick={() => handleInlineAdd('matching')} className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                        <Plus className="h-3 w-3" />
                        <span>Voeg sectoren toe →</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Doelgroepen */}
              <div>
                <Label className="text-xs text-muted-foreground">Doelgroepen</Label>
                {isEditing ? (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {DOELGROEPEN.map((doelgroep) => {
                      const isSelected = doelgroepen.includes(doelgroep);
                      const colors = DOELGROEP_COLORS[doelgroep] || { selected: "bg-primary text-primary-foreground", outline: "border-primary text-primary" };
                      return (
                        <Badge
                          key={doelgroep}
                          variant="outline"
                          className={`cursor-pointer transition-all ${isSelected ? colors.selected : colors.outline}`}
                          onClick={() => toggleDoelgroep(doelgroep)}
                        >
                          {doelgroep}
                          {isSelected && <X className="h-3 w-3 ml-1" />}
                        </Badge>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(client.doelgroep || []).length > 0 ? (
                      client.doelgroep?.map((d) => {
                        const colors = DOELGROEP_COLORS[d] || { selected: "bg-secondary text-secondary-foreground", outline: "" };
                        return (
                          <Badge key={d} variant="outline" className={colors.outline}>{d}</Badge>
                        );
                      })
                    ) : (
                      <button onClick={() => handleInlineAdd('matching')} className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                        <Plus className="h-3 w-3" />
                        <span>Voeg doelgroepen toe →</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Gezochte functies */}
              <div>
                <Label className="text-xs text-muted-foreground">Gezochte functies</Label>
                {isEditing ? (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {FUNCTIES.map((functie) => {
                      const isSelected = functies.includes(functie);
                      const colors = FUNCTIE_COLORS[functie] || { selected: "bg-primary text-primary-foreground", outline: "border-primary text-primary" };
                      return (
                        <Badge
                          key={functie}
                          variant="outline"
                          className={`cursor-pointer transition-all ${isSelected ? colors.selected : colors.outline}`}
                          onClick={() => toggleFunctie(functie)}
                        >
                          {functie}
                          {isSelected && <X className="h-3 w-3 ml-1" />}
                        </Badge>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(client.gezochte_functies || []).length > 0 ? (
                      client.gezochte_functies?.map((f) => {
                        const colors = FUNCTIE_COLORS[f] || { selected: "bg-secondary text-secondary-foreground", outline: "" };
                        return (
                          <Badge key={f} variant="outline" className={colors.outline}>{f}</Badge>
                        );
                      })
                    ) : (
                      <button onClick={() => handleInlineAdd('matching')} className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                        <Plus className="h-3 w-3" />
                        <span>Voeg functies toe →</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Werklocaties Tab */}
          <TabsContent value="werklocaties" className="space-y-6 mt-6">
            {loadingOrg ? (
              <div className="text-center py-8 text-muted-foreground">
                Werklocaties laden...
              </div>
            ) : !linkedOrg ? (
              <div className="text-center py-8 space-y-4">
                <Building2 className="h-12 w-12 mx-auto text-muted-foreground/40" />
                <div>
                  <p className="text-muted-foreground">Deze klant is nog niet gekoppeld aan een organisatie</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Koppel deze klant aan een organisatie om werklocaties en tarieven te bekijken
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Organization info */}
                <div className="flex items-start justify-between p-4 border border-border rounded-lg bg-muted/30">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                      <h3 className="font-medium">{linkedOrg.name}</h3>
                    </div>
                    {linkedOrg.kvk_nummer && (
                      <p className="text-sm text-muted-foreground">KVK: {linkedOrg.kvk_nummer}</p>
                    )}
                    <div className="flex gap-4 text-sm text-muted-foreground mt-2">
                      {(() => {
                        const locationCount = linkedOrg.client_locations?.length || 0;
                        return <span>{locationCount} {locationCount === 1 ? 'locatie' : 'locaties'}</span>;
                      })()}
                      <span>
                        {(() => {
                          const sublocationCount = linkedOrg.client_locations?.reduce((acc: number, loc: any) => acc + (loc.client_sublocations?.length || 0), 0) || 0;
                          return `${sublocationCount} ${sublocationCount === 1 ? 'sublocatie' : 'sublocaties'}`;
                        })()}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsOrganizationModalOpen(true)}
                    className="gap-2"
                  >
                    Bekijk organisatie
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>

                {/* Locations with full hierarchy */}
                <div className="space-y-4">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    Werklocaties
                  </h4>
                  {linkedOrg.client_locations && linkedOrg.client_locations.length > 0 ? (
                    <div className="space-y-3">
                      {linkedOrg.client_locations.map((location: any) => {
                        // Prepare sublocations with tariff calculations
                        const enrichedSublocations = (location.client_sublocations || []).map((sublocation: any) => {
                          const hourlyRates = sublocation.hourly_rates || [];
                          const tarieven = hourlyRates.map((r: any) => r.basis_tarief).filter((t: any) => t != null);
                          
                          return {
                            id: sublocation.id,
                            naam: sublocation.naam,
                            plaats: sublocation.plaats,
                            doelgroep: sublocation.doelgroep,
                            sector: sublocation.sector,
                            gekoppelde_bv_org_id: sublocation.gekoppelde_bv_org_id,
                            telefoon: sublocation.telefoon,
                            adres: sublocation.adres,
                            capaciteit_min: sublocation.capaciteit_min,
                            capaciteit_max: sublocation.capaciteit_max,
                            hourly_rates_count: hourlyRates.length,
                            tarieven_min: tarieven.length > 0 ? Math.min(...tarieven) : undefined,
                            tarieven_max: tarieven.length > 0 ? Math.max(...tarieven) : undefined,
                          };
                        });

                        return (
                          <LocationCard
                            key={location.id}
                            location={{
                              ...location,
                              sublocations: enrichedSublocations,
                            }}
                            organizationName={linkedOrg.name}
                            onLocationClick={(loc) => {
                              setSelectedLocation(loc);
                              setIsLocationModalOpen(true);
                            }}
                            onSublocationClick={(sublocation) => {
                              setSelectedSublocation(sublocation);
                              setIsSublocationModalOpen(true);
                            }}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Geen locaties gevonden voor deze organisatie
                    </p>
                  )}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>

      {/* Location Detail Modal */}
      {selectedLocation && (
        <LocationDetailModal
          open={isLocationModalOpen}
          onOpenChange={setIsLocationModalOpen}
          location={selectedLocation}
          organizationName={linkedOrg?.name || ""}
          onSublocationClick={(sublocation) => {
            setSelectedSublocation(sublocation);
            setIsSublocationModalOpen(true);
          }}
        />
      )}

      {/* Sublocation Detail Modal */}
      {selectedSublocation && (
        <SublocationDetailModal
          open={isSublocationModalOpen}
          onOpenChange={setIsSublocationModalOpen}
          sublocation={selectedSublocation}
          organizationName={linkedOrg?.name || ""}
          locationName={
            linkedOrg?.client_locations?.find((loc: any) =>
              loc.client_sublocations?.some((sub: any) => sub.id === selectedSublocation.id)
            )?.naam || ""
          }
        />
      )}

      {/* Organization Detail Modal */}
      {linkedOrg && (
        <OrganizationDetailModal
          open={isOrganizationModalOpen}
          onOpenChange={setIsOrganizationModalOpen}
          organization={{
            id: linkedOrg.id,
            name: linkedOrg.name,
            kvk_nummer: linkedOrg.kvk_nummer,
            logo_url: linkedOrg.logo_url,
            website: linkedOrg.website,
            centrale_facturatie_email: linkedOrg.centrale_facturatie_email,
            locations: (linkedOrg.client_locations || []).map((loc: any) => ({
              ...loc,
              sublocations: loc.client_sublocations || [],
            })),
          }}
        />
      )}
    </Dialog>
  );
}
