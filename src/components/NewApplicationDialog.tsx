import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { Loader2, X } from "lucide-react";

const applicationSchema = z.object({
  naam: z.string().min(1, "Naam is verplicht"),
  email: z.string().email("Ongeldig e-mailadres"),
  telefoon: z.string().optional(),
  functie_niveau: z.string().optional(),
  werkvorm: z.string().optional(),
  regio: z.string().optional(),
  beschikbaarheid: z.string().optional(),
  eigen_vervoer: z.boolean().default(false),
  bron: z.string().optional(),
  opmerkingen: z.string().optional(),
});

type ApplicationFormData = z.infer<typeof applicationSchema>;

interface NewApplicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplicationCreated: () => void;
}

const FUNCTIE_NIVEAUS = [
  "VIG",
  "HBO-V", 
  "Verpleegkundige (MBO)",
  "Helpende",
  "Begeleider",
  "Persoonlijk begeleider",
  "GGZ-agoog",
];

const SECTOREN = [
  "VVT",
  "GGZ", 
  "GHZ",
  "Jeugdzorg",
  "Ziekenhuis/Klinisch",
  "Thuiszorg",
];

const DOELGROEPEN = [
  "Ouderen",
  "LVB",
  "Psychiatrie",
  "Somatiek",
  "Kinderen/Jeugd",
  "Verslaving",
];

const WERKVORMEN = [
  { value: "zzp", label: "ZZP" },
  { value: "uitzend", label: "Uitzendkracht" },
  { value: "abcito", label: "ABCito constructie" },
];

const BESCHIKBAARHEDEN = [
  "<24 uur/week",
  "24-32 uur/week",
  "32-40 uur/week",
  "Flexibel",
];

const BRONNEN = [
  "Indeed",
  "LinkedIn",
  "Eigen netwerk",
  "Website",
  "Referral",
  "Telefonisch",
  "Anders",
];

export function NewApplicationDialog({ open, onOpenChange, onApplicationCreated }: NewApplicationDialogProps) {
  const [selectedSectoren, setSelectedSectoren] = useState<string[]>([]);
  const [selectedDoelgroepen, setSelectedDoelgroepen] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ApplicationFormData>({
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      eigen_vervoer: false,
    },
  });

  const calculateCompletenessScore = (data: ApplicationFormData): number => {
    let score = 0;
    const weights = {
      naam: 15,
      email: 15,
      telefoon: 10,
      functie_niveau: 20,
      werkvorm: 15,
      regio: 10,
      beschikbaarheid: 5,
      ervaring_sector: 5,
      doelgroep_ervaring: 5,
    };

    if (data.naam) score += weights.naam;
    if (data.email) score += weights.email;
    if (data.telefoon) score += weights.telefoon;
    if (data.functie_niveau) score += weights.functie_niveau;
    if (data.werkvorm) score += weights.werkvorm;
    if (data.regio) score += weights.regio;
    if (data.beschikbaarheid) score += weights.beschikbaarheid;
    if (selectedSectoren.length > 0) score += weights.ervaring_sector;
    if (selectedDoelgroepen.length > 0) score += weights.doelgroep_ervaring;

    return Math.round(score);
  };

  const detectMissingInfo = (data: ApplicationFormData): string[] => {
    const missing: string[] = [];
    
    if (!data.functie_niveau) missing.push("Functieniveau ontbreekt - cruciaal voor matching");
    if (!data.werkvorm) missing.push("Gewenste werkvorm niet aangegeven");
    if (!data.regio) missing.push("Werkgebied/regio niet bekend");
    if (!data.telefoon) missing.push("Telefoonnummer niet opgegeven");
    if (selectedSectoren.length === 0) missing.push("Ervaring sector niet aangegeven");
    if (selectedDoelgroepen.length === 0) missing.push("Doelgroep ervaring niet opgegeven");
    if (!data.beschikbaarheid) missing.push("Beschikbaarheid niet aangegeven");

    return missing;
  };

  const ensureAbcitoKnowledge = async (orgId: string) => {
    try {
      // Check if ABCito knowledge already exists
      const { data: existing } = await supabase
        .from("ai_knowledge_base")
        .select("id")
        .eq("org_id", orgId)
        .eq("category", "werkvormen")
        .eq("key", "abcito_constructie")
        .maybeSingle();

      if (existing) return;

      // Create ABCito knowledge item
      const { error } = await supabase
        .from("ai_knowledge_base")
        .insert({
          org_id: orgId,
          category: "werkvormen",
          key: "abcito_constructie",
          value: {
            naam: "ABCito constructie",
            omschrijving: "Aparte constructie van ABCzorg/CitoZorg, administratief anders dan loondienst",
            sollicitatie_procedure: "Identiek aan ZZP en Uitzendkracht procedures",
            document_procedure: "Identiek aan ZZP en Uitzendkracht procedures",
            beschikbaar_via: ["ABCzorg", "CitoZorg"],
            toelichting: "Contractueel/administratief verschil, niet procesmatig",
          },
          confidence_score: 1.0,
          stability_score: 1.0,
          source: "system_configuration",
          source_type: "manual",
        });

      if (error) {
        console.error("Error creating ABCito knowledge:", error);
      }
    } catch (error) {
      console.error("Error ensuring ABCito knowledge:", error);
    }
  };

  const onSubmit = async (data: ApplicationFormData) => {
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Niet ingelogd");

      // Get user's organization
      const { data: userOrg } = await supabase
        .from("user_organizations")
        .select("org_id")
        .eq("user_id", user.id)
        .single();

      if (!userOrg) throw new Error("Geen organisatie gevonden");

      const extractedData = {
        naam: data.naam,
        telefoon: data.telefoon || null,
        functie_niveau: data.functie_niveau || null,
        ervaring_sector: selectedSectoren,
        doelgroep_ervaring: selectedDoelgroepen,
        werkvorm: data.werkvorm || null,
        regio: data.regio || null,
        beschikbaarheid: data.beschikbaarheid || null,
        eigen_vervoer: data.eigen_vervoer,
        bron: data.bron || null,
        opmerkingen: data.opmerkingen || null,
      };

      const completenessScore = calculateCompletenessScore(data);
      const missingInfo = detectMissingInfo(data);

      // Insert application
      const { error: insertError } = await supabase
        .from("professional_applications")
        .insert({
          org_id: userOrg.org_id,
          email_from: data.email,
          email_subject: `Nieuwe sollicitatie: ${data.naam}`,
          extracted_data: extractedData,
          completeness_score: completenessScore,
          missing_info: missingInfo,
          pipeline_stage: "nieuw",
          status: "nieuw",
        });

      if (insertError) throw insertError;

      // Ensure ABCito knowledge exists (async, don't wait)
      ensureAbcitoKnowledge(userOrg.org_id);

      toast.success("Sollicitatie aangemaakt", {
        description: `${data.naam} is toegevoegd aan de pipeline`,
      });

      reset();
      setSelectedSectoren([]);
      setSelectedDoelgroepen([]);
      onApplicationCreated();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error creating application:", error);
      toast.error("Fout bij aanmaken", {
        description: error.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSector = (sector: string) => {
    setSelectedSectoren((prev) =>
      prev.includes(sector) ? prev.filter((s) => s !== sector) : [...prev, sector]
    );
  };

  const toggleDoelgroep = (doelgroep: string) => {
    setSelectedDoelgroepen((prev) =>
      prev.includes(doelgroep) ? prev.filter((d) => d !== doelgroep) : [...prev, doelgroep]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nieuwe Sollicitatie</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Sectie 1: Contactgegevens */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Contactgegevens</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="naam">
                  Naam <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="naam"
                  placeholder="Voor- en achternaam"
                  {...register("naam")}
                />
                {errors.naam && (
                  <p className="text-sm text-destructive">{errors.naam.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">
                  E-mailadres <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="naam@voorbeeld.nl"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefoon">Telefoonnummer</Label>
                <Input
                  id="telefoon"
                  type="tel"
                  placeholder="06-12345678"
                  {...register("telefoon")}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Sectie 2: Professionele Achtergrond */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Professionele Achtergrond</h3>
            
            <div className="space-y-2">
              <Label htmlFor="functie_niveau">Functieniveau</Label>
              <Select
                value={watch("functie_niveau")}
                onValueChange={(value) => setValue("functie_niveau", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecteer functieniveau" />
                </SelectTrigger>
                <SelectContent>
                  {FUNCTIE_NIVEAUS.map((niveau) => (
                    <SelectItem key={niveau} value={niveau}>
                      {niveau}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Ervaring sector</Label>
              <div className="flex flex-wrap gap-2">
                {SECTOREN.map((sector) => (
                  <Badge
                    key={sector}
                    variant={selectedSectoren.includes(sector) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleSector(sector)}
                  >
                    {sector}
                    {selectedSectoren.includes(sector) && (
                      <X className="ml-1 h-3 w-3" />
                    )}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Doelgroep ervaring</Label>
              <div className="flex flex-wrap gap-2">
                {DOELGROEPEN.map((doelgroep) => (
                  <Badge
                    key={doelgroep}
                    variant={selectedDoelgroepen.includes(doelgroep) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleDoelgroep(doelgroep)}
                  >
                    {doelgroep}
                    {selectedDoelgroepen.includes(doelgroep) && (
                      <X className="ml-1 h-3 w-3" />
                    )}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <Separator />

          {/* Sectie 3: Werkvorm & Beschikbaarheid */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Werkvorm & Beschikbaarheid</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="werkvorm">Gewenste werkvorm</Label>
                <Select
                  value={watch("werkvorm")}
                  onValueChange={(value) => setValue("werkvorm", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecteer werkvorm" />
                  </SelectTrigger>
                  <SelectContent>
                    {WERKVORMEN.map((vorm) => (
                      <SelectItem key={vorm.value} value={vorm.value}>
                        {vorm.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="regio">Regio/Werkgebied</Label>
                <Input
                  id="regio"
                  placeholder="Bijv. Utrecht en omgeving"
                  {...register("regio")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="beschikbaarheid">Beschikbaarheid</Label>
                <Select
                  value={watch("beschikbaarheid")}
                  onValueChange={(value) => setValue("beschikbaarheid", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecteer beschikbaarheid" />
                  </SelectTrigger>
                  <SelectContent>
                    {BESCHIKBAARHEDEN.map((beschikbaarheid) => (
                      <SelectItem key={beschikbaarheid} value={beschikbaarheid}>
                        {beschikbaarheid}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="eigen_vervoer"
                  checked={watch("eigen_vervoer")}
                  onCheckedChange={(checked) => setValue("eigen_vervoer", checked as boolean)}
                />
                <Label htmlFor="eigen_vervoer" className="cursor-pointer">
                  Eigen vervoer beschikbaar
                </Label>
              </div>
            </div>
          </div>

          <Separator />

          {/* Sectie 4: Bron & Opmerkingen */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Bron & Opmerkingen</h3>
            
            <div className="space-y-2">
              <Label htmlFor="bron">Bron sollicitatie</Label>
              <Select
                value={watch("bron")}
                onValueChange={(value) => setValue("bron", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecteer bron" />
                </SelectTrigger>
                <SelectContent>
                  {BRONNEN.map((bron) => (
                    <SelectItem key={bron} value={bron}>
                      {bron}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="opmerkingen">Opmerkingen/Motivatie</Label>
              <Textarea
                id="opmerkingen"
                placeholder="Vrije tekst voor aanvullende opmerkingen..."
                rows={4}
                {...register("opmerkingen")}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Annuleren
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Aanmaken...
                </>
              ) : (
                "Sollicitatie aanmaken"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
