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
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";
import { 
  User, Phone, Mail, MapPin, Briefcase, Car, Calendar, 
  Star, Edit, Trash2, CheckCircle2, X, Link2 
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

export function ProfessionalDetailModal({ 
  professional, 
  open, 
  onOpenChange,
  onSuccess 
}: ProfessionalDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
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

  if (!professional) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {isEditing ? "Bewerk Professional" : professional.full_name}
            </span>
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

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">
              <User className="h-4 w-4 mr-2" />
              Details
            </TabsTrigger>
            <TabsTrigger value="matching">
              <Link2 className="h-4 w-4 mr-2" />
              Plaatsing
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-6 mt-6">
          {/* Basis Informatie */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <User className="h-4 w-4" />
              Basis Informatie
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Naam</Label>
                {isEditing ? (
                  <Input
                    value={editData.full_name}
                    onChange={(e) => setEditData({ ...editData, full_name: e.target.value })}
                  />
                ) : (
                  <p className="text-sm mt-1">{professional.full_name}</p>
                )}
              </div>
              
              <div>
                <Label>Functieniveau</Label>
                {isEditing ? (
                  <Select
                    value={editData.functie_niveau}
                    onValueChange={(value) => setEditData({ ...editData, functie_niveau: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FUNCTIE_NIVEAUS.map(niveau => (
                        <SelectItem key={niveau} value={niveau}>{niveau}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm mt-1">{professional.functie_niveau}</p>
                )}
              </div>

              <div>
                <Label>Werkvorm</Label>
                {isEditing ? (
                  <Select
                    value={editData.werkvorm}
                    onValueChange={(value) => setEditData({ ...editData, werkvorm: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecteer werkvorm" />
                    </SelectTrigger>
                    <SelectContent>
                      {WERKVORMEN.map(vorm => (
                        <SelectItem key={vorm} value={vorm}>{vorm}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm mt-1">
                    {professional.werkvorm && (
                      <Badge variant="secondary">{professional.werkvorm}</Badge>
                    )}
                  </p>
                )}
              </div>

              <div>
                <Label>Status</Label>
                <p className="text-sm mt-1">
                  <Badge variant={professional.status === "actief" ? "default" : "secondary"}>
                    {professional.status}
                  </Badge>
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Contact Informatie */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Contact Informatie
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                {isEditing ? (
                  <Input
                    type="email"
                    value={editData.email}
                    onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                  />
                ) : (
                  <p className="text-sm mt-1 flex items-center gap-2">
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
                  />
                ) : (
                  <p className="text-sm mt-1 flex items-center gap-2">
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
                  />
                ) : (
                  <p className="text-sm mt-1 flex items-center gap-2">
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
          </div>

          <Separator />

          {/* Skills & Ervaring */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Skills & Ervaring
            </h3>
            {isEditing ? (
              <div className="space-y-2">
                <Label>Ervaring Sectoren</Label>
                <div className="flex flex-wrap gap-2">
                  {SECTOREN.map((sector) => (
                    <Badge
                      key={sector}
                      variant={editData.skills.includes(sector) ? "default" : "outline"}
                      className="cursor-pointer"
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
                    <Badge key={skill} variant="secondary">{skill}</Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Geen skills opgegeven</p>
                )}
              </div>
            )}
          </div>

          {professional.rating && (
            <div>
              <Label>Rating</Label>
              <div className="flex items-center gap-1 mt-1">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <span className="text-sm font-medium">{professional.rating.toFixed(1)}</span>
              </div>
            </div>
          )}

          <Separator />

          {/* Financieel */}
          {(professional.gewenst_uurloon || professional.kvk_nummer || isEditing) && (
            <>
              <div>
                <h3 className="text-sm font-semibold mb-3">Financieel</h3>
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
                      />
                    ) : (
                      <p className="text-sm mt-1">
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
                      <Label>KVK nummer</Label>
                      {isEditing ? (
                        <Input
                          value={editData.kvk_nummer}
                          onChange={(e) => setEditData({ ...editData, kvk_nummer: e.target.value })}
                        />
                      ) : (
                        <p className="text-sm mt-1">{professional.kvk_nummer || "-"}</p>
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
                        />
                      ) : (
                        <p className="text-sm mt-1">{professional.btw_nummer || "-"}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Beschikbaarheid */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Beschikbaarheid
            </h3>
            {isEditing ? (
              <Textarea
                value={editData.beschikbaarheidsnotities}
                onChange={(e) => setEditData({ ...editData, beschikbaarheidsnotities: e.target.value })}
                placeholder="Notities over beschikbaarheid..."
                rows={3}
              />
            ) : (
              <p className="text-sm">
                {professional.beschikbaarheidsnotities || "Geen beschikbaarheidsnotities"}
              </p>
            )}
          </div>

          <Separator />

          {/* Metadata */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Aangemaakt: {format(new Date(professional.created_at), "d MMMM yyyy 'om' HH:mm", { locale: nl })}</p>
            <p>Laatst bijgewerkt: {format(new Date(professional.updated_at), "d MMMM yyyy 'om' HH:mm", { locale: nl })}</p>
          </div>

          {/* Action Buttons */}
          {isEditing && (
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
              >
                <X className="h-4 w-4 mr-1" />
                Annuleren
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                <CheckCircle2 className="h-4 w-4 mr-1" />
                {isSaving ? "Opslaan..." : "Opslaan"}
              </Button>
            </div>
          )}
          </TabsContent>

          <TabsContent value="matching" className="mt-6">
            <MatchingPanel 
              professionalId={professional.id}
              professionalName={professional.full_name}
              onSuccess={onSuccess}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
