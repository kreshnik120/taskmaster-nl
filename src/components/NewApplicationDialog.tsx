import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { Loader2, X, ChevronRight, ChevronLeft, CheckCircle2 } from "lucide-react";

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
  { value: "ZZP", label: "ZZP" },
  { value: "Uitzendkracht", label: "Uitzendkracht" },
  { value: "ABCito constructie", label: "ABCito constructie" },
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

// Semantic color mapping
const getSectorColor = (sector: string, selected: boolean) => {
  const colors: Record<string, string> = {
    "VVT": selected ? "bg-blue-100 text-blue-700 border-blue-300" : "border-blue-300 text-blue-600 hover:bg-blue-50",
    "GGZ": selected ? "bg-purple-100 text-purple-700 border-purple-300" : "border-purple-300 text-purple-600 hover:bg-purple-50",
    "GHZ": selected ? "bg-green-100 text-green-700 border-green-300" : "border-green-300 text-green-600 hover:bg-green-50",
    "Jeugdzorg": selected ? "bg-orange-100 text-orange-700 border-orange-300" : "border-orange-300 text-orange-600 hover:bg-orange-50",
    "Ziekenhuis/Klinisch": selected ? "bg-red-100 text-red-700 border-red-300" : "border-red-300 text-red-600 hover:bg-red-50",
    "Thuiszorg": selected ? "bg-teal-100 text-teal-700 border-teal-300" : "border-teal-300 text-teal-600 hover:bg-teal-50",
  };
  return colors[sector] || (selected ? "bg-muted text-foreground" : "hover:bg-muted");
};

const getDoelgroepColor = (doelgroep: string, selected: boolean) => {
  const colors: Record<string, string> = {
    "Ouderen": selected ? "bg-amber-100 text-amber-700 border-amber-300" : "border-amber-300 text-amber-600 hover:bg-amber-50",
    "LVB": selected ? "bg-emerald-100 text-emerald-700 border-emerald-300" : "border-emerald-300 text-emerald-600 hover:bg-emerald-50",
    "Psychiatrie": selected ? "bg-indigo-100 text-indigo-700 border-indigo-300" : "border-indigo-300 text-indigo-600 hover:bg-indigo-50",
    "Somatiek": selected ? "bg-rose-100 text-rose-700 border-rose-300" : "border-rose-300 text-rose-600 hover:bg-rose-50",
    "Kinderen/Jeugd": selected ? "bg-cyan-100 text-cyan-700 border-cyan-300" : "border-cyan-300 text-cyan-600 hover:bg-cyan-50",
    "Verslaving": selected ? "bg-slate-100 text-slate-700 border-slate-300" : "border-slate-300 text-slate-600 hover:bg-slate-50",
  };
  return colors[doelgroep] || (selected ? "bg-muted text-foreground" : "hover:bg-muted");
};

export function NewApplicationDialog({ open, onOpenChange, onApplicationCreated }: NewApplicationDialogProps) {
  const [currentStep, setCurrentStep] = useState(1);
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

  const onSubmit = async (data: ApplicationFormData) => {
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Niet ingelogd");

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

      const { error: insertError } = await supabase
        .from("professional_applications")
        .insert({
          email_from: data.email,
          email_subject: `Nieuwe sollicitatie: ${data.naam}`,
          extracted_data: extractedData,
          completeness_score: completenessScore,
          missing_info: missingInfo,
          pipeline_stage: "nieuw",
          status: "nieuw",
        });

      if (insertError) throw insertError;

      toast.success("Sollicitatie aangemaakt", {
        description: `${data.naam} is toegevoegd aan de pipeline`,
      });

      reset();
      setSelectedSectoren([]);
      setSelectedDoelgroepen([]);
      setCurrentStep(1);
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

  const canProceedToStep2 = () => {
    return watch("naam") && watch("email");
  };

  const handleNext = () => {
    if (currentStep === 1 && !canProceedToStep2()) {
      toast.error("Vul naam en e-mailadres in");
      return;
    }
    setCurrentStep(prev => Math.min(3, prev + 1));
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(1, prev - 1));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nieuwe Sollicitatie</DialogTitle>
        </DialogHeader>

        {/* Progress Indicator */}
        <div className="flex items-center justify-between mb-6">
          {[1, 2, 3].map((step) => (
            <div key={step} className="flex items-center flex-1">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all ${
                step < currentStep 
                  ? "bg-primary border-primary text-primary-foreground" 
                  : step === currentStep 
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-muted-foreground/30 text-muted-foreground"
              }`}>
                {step < currentStep ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <span className="text-sm font-semibold">{step}</span>
                )}
              </div>
              {step < 3 && (
                <div className={`flex-1 h-0.5 mx-2 transition-all ${
                  step < currentStep ? "bg-primary" : "bg-muted-foreground/30"
                }`} />
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Step 1: Contactgegevens */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-fade-in">
              <h3 className="text-sm font-semibold text-foreground">Contactgegevens</h3>
              <div className="grid grid-cols-1 gap-4">
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
          )}

          {/* Step 2: Professionele Achtergrond */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-fade-in">
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
                      variant="outline"
                      className={`cursor-pointer transition-all ${getSectorColor(sector, selectedSectoren.includes(sector))}`}
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
                      variant="outline"
                      className={`cursor-pointer transition-all ${getDoelgroepColor(doelgroep, selectedDoelgroepen.includes(doelgroep))}`}
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
          )}

          {/* Step 3: Werkvorm & Details */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-fade-in">
              <h3 className="text-sm font-semibold text-foreground">Werkvorm & Details</h3>
              
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
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={currentStep === 1 ? () => onOpenChange(false) : handleBack}
            >
              {currentStep === 1 ? (
                "Annuleren"
              ) : (
                <>
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Vorige
                </>
              )}
            </Button>

            {currentStep < 3 ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={currentStep === 1 && !canProceedToStep2()}
              >
                Volgende
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
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
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}