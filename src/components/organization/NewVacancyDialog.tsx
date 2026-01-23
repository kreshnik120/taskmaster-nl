import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface NewVacancyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sublocationId: string;
  sublocationName: string;
  defaultFuncties?: string[];
  defaultSector?: string[];
  defaultDoelgroep?: string[];
  onSuccess?: () => void;
}

const FUNCTIE_OPTIONS = [
  "HBO-V", "Verpleegkundige MBO", "VIG", "Verzorgende IG", "Helpende",
  "GGZ-agoog", "Begeleider", "Persoonlijk begeleider", "Pedagogisch medewerker",
  "Maatschappelijk werker", "Job coach", "Activiteitenbegeleider"
];

const URGENTIE_OPTIONS = [
  { value: "laag", label: "Laag" },
  { value: "normaal", label: "Normaal" },
  { value: "hoog", label: "Hoog" },
  { value: "kritiek", label: "Kritiek" },
];

const SECTOR_OPTIONS = ["GHZ", "GGZ", "VVT", "Jeugdzorg", "Thuiszorg", "Ziekenhuis"];
const DOELGROEP_OPTIONS = ["LVB", "Ouderen", "Psychiatrie", "Verslaving", "Somatiek", "Kinderen/Jeugd"];

export function NewVacancyDialog({
  open,
  onOpenChange,
  sublocationId,
  sublocationName,
  defaultFuncties = [],
  defaultSector = [],
  defaultDoelgroep = [],
  onSuccess,
}: NewVacancyDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    titel: "",
    functie_niveau: defaultFuncties[0] || "",
    uren_per_week: 32,
    urgentie: "normaal",
    start_datum: "",
    deadline: "",
    beschrijving: "",
    gewenste_sector_ervaring: defaultSector,
    gewenste_doelgroep_ervaring: defaultDoelgroep,
    vereiste_certificaten: [] as string[],
  });
  const [newCertificaat, setNewCertificaat] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.titel || !formData.functie_niveau) {
      toast.error("Vul titel en functieniveau in");
      return;
    }

    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      const { error } = await supabase.from("vacancies").insert({
        sublocation_id: sublocationId,
        titel: formData.titel,
        functie_niveau: formData.functie_niveau,
        uren_per_week: formData.uren_per_week,
        urgentie: formData.urgentie,
        start_datum: formData.start_datum || null,
        deadline: formData.deadline || null,
        beschrijving: formData.beschrijving || null,
        gewenste_sector_ervaring: formData.gewenste_sector_ervaring,
        gewenste_doelgroep_ervaring: formData.gewenste_doelgroep_ervaring,
        vereiste_certificaten: formData.vereiste_certificaten,
        created_by: userData.user?.id,
        status: "open",
      });

      if (error) throw error;

      toast.success("Vacature aangemaakt");
      onOpenChange(false);
      onSuccess?.();
      
      // Reset form
      setFormData({
        titel: "",
        functie_niveau: defaultFuncties[0] || "",
        uren_per_week: 32,
        urgentie: "normaal",
        start_datum: "",
        deadline: "",
        beschrijving: "",
        gewenste_sector_ervaring: defaultSector,
        gewenste_doelgroep_ervaring: defaultDoelgroep,
        vereiste_certificaten: [],
      });
    } catch (error: any) {
      console.error("Error creating vacancy:", error);
      toast.error("Fout bij aanmaken vacature");
    } finally {
      setLoading(false);
    }
  };

  const addCertificaat = () => {
    if (newCertificaat && !formData.vereiste_certificaten.includes(newCertificaat)) {
      setFormData(prev => ({
        ...prev,
        vereiste_certificaten: [...prev.vereiste_certificaten, newCertificaat]
      }));
      setNewCertificaat("");
    }
  };

  const removeCertificaat = (cert: string) => {
    setFormData(prev => ({
      ...prev,
      vereiste_certificaten: prev.vereiste_certificaten.filter(c => c !== cert)
    }));
  };

  const toggleArrayItem = (field: 'gewenste_sector_ervaring' | 'gewenste_doelgroep_ervaring', item: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].includes(item)
        ? prev[field].filter(i => i !== item)
        : [...prev[field], item]
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nieuwe vacature voor {sublocationName}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="titel">Titel *</Label>
              <Input
                id="titel"
                value={formData.titel}
                onChange={(e) => setFormData(prev => ({ ...prev, titel: e.target.value }))}
                placeholder="bijv. Begeleider dagbesteding"
              />
            </div>

            <div>
              <Label htmlFor="functie_niveau">Functieniveau *</Label>
              <Select
                value={formData.functie_niveau}
                onValueChange={(value) => setFormData(prev => ({ ...prev, functie_niveau: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecteer functie" />
                </SelectTrigger>
                <SelectContent>
                  {FUNCTIE_OPTIONS.map((func) => (
                    <SelectItem key={func} value={func}>{func}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="urgentie">Urgentie</Label>
              <Select
                value={formData.urgentie}
                onValueChange={(value) => setFormData(prev => ({ ...prev, urgentie: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {URGENTIE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="uren_per_week">Uren per week</Label>
              <Input
                id="uren_per_week"
                type="number"
                value={formData.uren_per_week}
                onChange={(e) => setFormData(prev => ({ ...prev, uren_per_week: parseInt(e.target.value) || 0 }))}
              />
            </div>

            <div>
              <Label htmlFor="start_datum">Gewenste startdatum</Label>
              <Input
                id="start_datum"
                type="date"
                value={formData.start_datum}
                onChange={(e) => setFormData(prev => ({ ...prev, start_datum: e.target.value }))}
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="deadline">Deadline invulling</Label>
              <Input
                id="deadline"
                type="date"
                value={formData.deadline}
                onChange={(e) => setFormData(prev => ({ ...prev, deadline: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <Label>Gewenste sector ervaring</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {SECTOR_OPTIONS.map((sector) => (
                <Badge
                  key={sector}
                  variant={formData.gewenste_sector_ervaring.includes(sector) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleArrayItem('gewenste_sector_ervaring', sector)}
                >
                  {sector}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <Label>Gewenste doelgroep ervaring</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {DOELGROEP_OPTIONS.map((dg) => (
                <Badge
                  key={dg}
                  variant={formData.gewenste_doelgroep_ervaring.includes(dg) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleArrayItem('gewenste_doelgroep_ervaring', dg)}
                >
                  {dg}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <Label>Vereiste certificaten</Label>
            <div className="flex gap-2 mt-2">
              <Input
                value={newCertificaat}
                onChange={(e) => setNewCertificaat(e.target.value)}
                placeholder="bijv. BHV, EHBO"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCertificaat())}
              />
              <Button type="button" variant="outline" size="icon" onClick={addCertificaat}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {formData.vereiste_certificaten.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.vereiste_certificaten.map((cert) => (
                  <Badge key={cert} variant="secondary" className="pr-1">
                    {cert}
                    <button
                      type="button"
                      onClick={() => removeCertificaat(cert)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="beschrijving">Beschrijving</Label>
            <Textarea
              id="beschrijving"
              value={formData.beschrijving}
              onChange={(e) => setFormData(prev => ({ ...prev, beschrijving: e.target.value }))}
              placeholder="Beschrijving van de vacature..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuleren
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Bezig..." : "Vacature aanmaken"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
