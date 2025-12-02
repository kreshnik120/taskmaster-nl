import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useCallback } from "react";
import { Loader2, X, ChevronRight, ChevronLeft, CheckCircle2, Upload, FileText, Sparkles, ChevronDown, Search, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedSectoren, setSelectedSectoren] = useState<string[]>([]);
  const [selectedDoelgroepen, setSelectedDoelgroepen] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvAnalyzing, setCvAnalyzing] = useState(false);
  const [autoFilledFields, setAutoFilledFields] = useState<string[]>([]);
  const [cvExtractedData, setCvExtractedData] = useState<Record<string, any> | null>(null);
  const [cvDataOpen, setCvDataOpen] = useState(false);

  // Helper to extract value from {value, confidence} or plain value (backwards compatible)
  const getFieldValue = <T,>(field: T | { value: T; confidence: number } | null | undefined): T | null => {
    if (field === null || field === undefined) return null;
    if (typeof field === 'object' && field !== null && 'value' in field) {
      return (field as { value: T; confidence: number }).value;
    }
    return field as T;
  };

  // Helper to get global confidence (supports both old and new format)
  const getGlobalConfidence = (): number | null => {
    if (!cvExtractedData) return null;
    return cvExtractedData.global_confidence ?? cvExtractedData.confidence ?? null;
  };

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

  // Completeness Score v2: Inclusief CV extractie velden
  const calculateCompletenessScore = (data: ApplicationFormData): number => {
    let score = 0;
    
    // Basis velden (75% totaal)
    const basisWeights = {
      naam: 10,
      email: 10,
      telefoon: 8,
      functie_niveau: 15,
      werkvorm: 10,
      regio: 8,
      beschikbaarheid: 4,
      ervaring_sector: 5,
      doelgroep_ervaring: 5,
    };

    // Verrijking velden van CV (25% totaal)
    const verrijkingWeights = {
      jaren_ervaring: 5,
      opleidingen: 5,
      leidinggevende_ervaring: 3,
      postcode: 3,
      certificaten: 3,
      nachtdienst_bereid: 2,
      weekenddienst_bereid: 2,
      talen: 2,
    };

    // Basis score berekening
    if (data.naam) score += basisWeights.naam;
    if (data.email) score += basisWeights.email;
    if (data.telefoon) score += basisWeights.telefoon;
    if (data.functie_niveau) score += basisWeights.functie_niveau;
    if (data.werkvorm) score += basisWeights.werkvorm;
    if (data.regio) score += basisWeights.regio;
    if (data.beschikbaarheid) score += basisWeights.beschikbaarheid;
    if (selectedSectoren.length > 0) score += basisWeights.ervaring_sector;
    if (selectedDoelgroepen.length > 0) score += basisWeights.doelgroep_ervaring;

    // Verrijking score (uit CV data)
    if (getFieldValue(cvExtractedData?.jaren_ervaring)) score += verrijkingWeights.jaren_ervaring;
    if ((getFieldValue(cvExtractedData?.opleidingen) as any[])?.length > 0) score += verrijkingWeights.opleidingen;
    if (getFieldValue(cvExtractedData?.leidinggevende_ervaring)) score += verrijkingWeights.leidinggevende_ervaring;
    if (getFieldValue(cvExtractedData?.postcode)) score += verrijkingWeights.postcode;
    if ((getFieldValue(cvExtractedData?.certificaten) as any[])?.length > 0) score += verrijkingWeights.certificaten;
    if (getFieldValue(cvExtractedData?.nachtdienst_bereid) !== null && getFieldValue(cvExtractedData?.nachtdienst_bereid) !== undefined) score += verrijkingWeights.nachtdienst_bereid;
    if (getFieldValue(cvExtractedData?.weekenddienst_bereid) !== null && getFieldValue(cvExtractedData?.weekenddienst_bereid) !== undefined) score += verrijkingWeights.weekenddienst_bereid;
    if ((getFieldValue(cvExtractedData?.talen) as any[])?.length > 0) score += verrijkingWeights.talen;

    return Math.round(score);
  };

  // Bereken profiel kwaliteit label
  const getProfileQualityLabel = (): { label: string; color: string } => {
    const score = calculateCompletenessScore(watch());
    if (score >= 90) return { label: "Premium", color: "bg-purple-100 text-purple-700 border-purple-300" };
    if (score >= 75) return { label: "Rijk", color: "bg-green-100 text-green-700 border-green-300" };
    return { label: "Basis", color: "bg-amber-100 text-amber-700 border-amber-300" };
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
        // Form velden
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
        // CV extractie velden (14+ nieuwe velden)
        jaren_ervaring: getFieldValue(cvExtractedData?.jaren_ervaring) || null,
        ervaring_sinds: getFieldValue(cvExtractedData?.ervaring_sinds) || null,
        leidinggevende_ervaring: getFieldValue(cvExtractedData?.leidinggevende_ervaring) || false,
        leidinggevende_functies: getFieldValue(cvExtractedData?.leidinggevende_functies) || [],
        postcode: getFieldValue(cvExtractedData?.postcode) || null,
        woonplaats: getFieldValue(cvExtractedData?.woonplaats) || null,
        geboortedatum: getFieldValue(cvExtractedData?.geboortedatum) || null,
        specifieke_doelgroepen: getFieldValue(cvExtractedData?.specifieke_doelgroepen) || [],
        hoogste_opleiding: getFieldValue(cvExtractedData?.hoogste_opleiding) || null,
        opleidingen: getFieldValue(cvExtractedData?.opleidingen) || [],
        certificaten: getFieldValue(cvExtractedData?.certificaten) || [],
        BIG_nummer: getFieldValue(cvExtractedData?.BIG_nummer) || null,
        nachtdienst_bereid: getFieldValue(cvExtractedData?.nachtdienst_bereid) ?? null,
        weekenddienst_bereid: getFieldValue(cvExtractedData?.weekenddienst_bereid) ?? null,
        voorkeur_uren_per_week: getFieldValue(cvExtractedData?.voorkeur_uren_per_week) || null,
        rijbewijs: getFieldValue(cvExtractedData?.rijbewijs) || null,
        max_reisafstand_km: getFieldValue(cvExtractedData?.max_reisafstand_km) || null,
        regio_voorkeur: getFieldValue(cvExtractedData?.regio_voorkeur) || null,
        talen: getFieldValue(cvExtractedData?.talen) || [],
        cv_confidence: getGlobalConfidence() || null,
      };

      const completenessScore = calculateCompletenessScore(data);
      const missingInfo = detectMissingInfo(data);

      // Default org_id voor ABCzorg - wordt later door team gewijzigd indien nodig
      const defaultOrgId = "550e8400-e29b-41d4-a716-446655440000";

      const { error: insertError } = await supabase
        .from("professional_applications")
        .insert({
          org_id: defaultOrgId,
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

      handleReset();
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

  const handleCVUpload = useCallback(async (file: File) => {
    if (!file) return;

    // Validate file type
    const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!validTypes.includes(file.type)) {
      toast.error("Ongeldig bestand", {
        description: "Alleen PDF, DOC, en DOCX bestanden zijn toegestaan"
      });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Bestand te groot", {
        description: "Maximale bestandsgrootte is 10MB"
      });
      return;
    }

    setCvFile(file);
    setCvAnalyzing(true);

    try {
      // Convert to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);

      const pdfBase64 = await base64Promise;

      // Use default ABCzorg org_id for knowledge base creation
      const userOrgId = '550e8400-e29b-41d4-a716-446655440000';

      // Call extract-cv-data edge function with orgId for knowledge creation
      const { data, error } = await supabase.functions.invoke('extract-cv-data', {
        body: { 
          pdfBase64, 
          filename: file.name,
          orgId: userOrgId // Pass org_id for knowledge base items
        }
      });

      if (error) throw error;

      if (data.success && data.data) {
        const extracted = data.data;
        const filled: string[] = [];

        // Helper to extract value from new {value, confidence} format
        const extractValue = <T,>(field: T | { value: T; confidence: number } | null | undefined): T | null => {
          if (field === null || field === undefined) return null;
          if (typeof field === 'object' && field !== null && 'value' in field) {
            return (field as { value: T; confidence: number }).value;
          }
          return field as T;
        };

        // Auto-fill form fields (handle both old and new format)
        const naam = extractValue(extracted.naam);
        if (naam) {
          setValue("naam", naam);
          filled.push("naam");
        }
        const email = extractValue(extracted.email);
        if (email) {
          setValue("email", email);
          filled.push("email");
        }
        const telefoon = extractValue(extracted.telefoon);
        if (telefoon) {
          setValue("telefoon", telefoon);
          filled.push("telefoon");
        }
        const functie_niveau = extractValue(extracted.functie_niveau);
        if (functie_niveau) {
          setValue("functie_niveau", functie_niveau);
          filled.push("functie_niveau");
        }
        const werkvorm = extractValue(extracted.werkvorm);
        if (werkvorm) {
          setValue("werkvorm", werkvorm);
          filled.push("werkvorm");
        }
        const regio = extractValue(extracted.regio);
        if (regio) {
          setValue("regio", regio);
          filled.push("regio");
        }
        const beschikbaarheid = extractValue(extracted.beschikbaarheid);
        if (beschikbaarheid) {
          setValue("beschikbaarheid", beschikbaarheid);
          filled.push("beschikbaarheid");
        }
        const eigen_vervoer = extractValue(extracted.eigen_vervoer);
        if (eigen_vervoer !== null) {
          setValue("eigen_vervoer", eigen_vervoer);
          filled.push("eigen_vervoer");
        }
        const opmerkingen = extractValue(extracted.opmerkingen);
        if (opmerkingen) {
          setValue("opmerkingen", opmerkingen);
          filled.push("opmerkingen");
        }
        const ervaring_sector = extractValue(extracted.ervaring_sector);
        if (ervaring_sector && Array.isArray(ervaring_sector) && ervaring_sector.length > 0) {
          setSelectedSectoren(ervaring_sector);
          filled.push("ervaring_sector");
        }
        const doelgroep_ervaring = extractValue(extracted.doelgroep_ervaring);
        if (doelgroep_ervaring && Array.isArray(doelgroep_ervaring) && doelgroep_ervaring.length > 0) {
          setSelectedDoelgroepen(doelgroep_ervaring);
          filled.push("doelgroep_ervaring");
        }

        setAutoFilledFields(filled);
        
        // Sla ALLE geëxtraheerde data op voor persistentie
        setCvExtractedData(extracted);

        // Check if critical fields (naam + email) were extracted
        const extractedNaam = extractValue(extracted.naam);
        const extractedEmail = extractValue(extracted.email);
        const hasNaam = !!extractedNaam && extractedNaam !== "Voor- en achternaam";
        const hasEmail = !!extractedEmail;

        if (hasNaam && hasEmail) {
          // All critical fields present - jump to step 3
          toast.success("CV geanalyseerd!", {
            description: `✅ ${filled.length} velden automatisch ingevuld`,
          });
          setCurrentStep(3);
        } else {
          // Missing critical fields - go to step 1 to fill them
          const missingFields = [];
          if (!hasNaam) missingFields.push("Naam");
          if (!hasEmail) missingFields.push("E-mail");
          
          toast.warning("CV gedeeltelijk geanalyseerd", {
            description: `${filled.length} velden ingevuld. Vul aan: ${missingFields.join(", ")}`,
          });
          setCurrentStep(1);
        }
      } else {
        throw new Error("CV analyse mislukt");
      }

    } catch (error: any) {
      console.error("CV upload error:", error);
      toast.error("CV analyse mislukt", {
        description: "Je kunt het formulier handmatig invullen"
      });
      // Go to step 1 for manual entry
      setCurrentStep(1);
    } finally {
      setCvAnalyzing(false);
    }
  }, [setValue]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleCVUpload(file);
    }
  };

  const skipCVUpload = () => {
    setCurrentStep(1);
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
    setCurrentStep(prev => Math.max(0, prev - 1));
  };

  const handleReset = () => {
    reset();
    setSelectedSectoren([]);
    setSelectedDoelgroepen([]);
    setCvFile(null);
    setAutoFilledFields([]);
    setCvExtractedData(null);
    setCurrentStep(0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nieuwe Sollicitatie</DialogTitle>
        </DialogHeader>

        {/* Progress Indicator - only show for steps 1-3 */}
        {currentStep > 0 && (
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
        )}

        <form onSubmit={handleSubmit(onSubmit, (errors) => {
          // Error callback - toon toast bij validatie failures
          const errorMessages = Object.entries(errors)
            .map(([field, error]) => `${field}: ${error?.message}`)
            .filter(Boolean);
          
          if (errorMessages.length > 0) {
            toast.error("Ontbrekende verplichte velden", {
              description: errorMessages.join(" • "),
            });
          }
        })} className="space-y-6">
          {/* Step 0: CV Upload */}
          {currentStep === 0 && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center space-y-3">
                <Sparkles className="h-12 w-12 mx-auto text-primary" />
                <h3 className="text-lg font-semibold text-foreground">Upload CV voor automatische extractie</h3>
                <p className="text-sm text-muted-foreground">
                  AI vult 80%+ van het formulier automatisch in
                </p>
              </div>

              {cvAnalyzing ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <p className="text-sm font-medium">📄 CV wordt geanalyseerd...</p>
                  <p className="text-xs text-muted-foreground">Dit duurt 3-5 seconden</p>
                </div>
              ) : (
                <>
                  <label 
                    htmlFor="cv-upload"
                    className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/30 rounded-lg p-12 cursor-pointer hover:border-primary/50 hover:bg-accent/5 transition-all"
                  >
                    <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-sm font-medium text-foreground mb-2">
                      Sleep PDF hier of klik om te selecteren
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PDF, DOC, DOCX (max 10MB)
                    </p>
                  </label>
                  <input
                    id="cv-upload"
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {cvFile && (
                    <div className="flex items-center gap-2 p-3 bg-accent rounded-lg">
                      <FileText className="h-5 w-5 text-primary" />
                      <span className="text-sm font-medium flex-1">{cvFile.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setCvFile(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-muted-foreground/30" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">
                        of vul handmatig in
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={skipCVUpload}
                    >
                      Sla CV upload over
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 1: Contactgegevens */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-fade-in">
              <h3 className="text-sm font-semibold text-foreground">Contactgegevens</h3>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="naam" className="flex items-center gap-2">
                    Naam <span className="text-destructive">*</span>
                    {autoFilledFields.includes("naam") && (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    )}
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
                  <Label htmlFor="email" className="flex items-center gap-2">
                    E-mailadres <span className="text-destructive">*</span>
                    {autoFilledFields.includes("email") && (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    )}
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
                  <Label htmlFor="telefoon" className="flex items-center gap-2">
                    Telefoonnummer
                    {autoFilledFields.includes("telefoon") && (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    )}
                  </Label>
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
                <Label htmlFor="functie_niveau" className="flex items-center gap-2">
                  Functieniveau
                  {autoFilledFields.includes("functie_niveau") && (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  )}
                </Label>
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
                <Label className="flex items-center gap-2">
                  Ervaring sector
                  {autoFilledFields.includes("ervaring_sector") && (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  )}
                </Label>
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
                <Label className="flex items-center gap-2">
                  Doelgroep ervaring
                  {autoFilledFields.includes("doelgroep_ervaring") && (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  )}
                </Label>
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

          {/* Step 3: Werkvorm & Details - Context-Aware */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-fade-in">
              {/* Auto-fill feedback banner with profile quality */}
              {autoFilledFields.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 dark:bg-green-950 dark:border-green-800">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-green-900 dark:text-green-100">
                          ✅ {autoFilledFields.length} velden automatisch ingevuld
                        </p>
                        <Badge variant="outline" className={`text-xs ${getProfileQualityLabel().color}`}>
                          {getProfileQualityLabel().label} profiel
                        </Badge>
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                          {calculateCompletenessScore(watch())}% compleet
                        </Badge>
                      </div>
                      <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                        Controleer de onderstaande velden en vul ontbrekende informatie aan
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Collapsible CV Data Preview */}
              {cvExtractedData && (
                <Collapsible defaultOpen={false} onOpenChange={(open) => setCvDataOpen(open)}>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" className="w-full justify-between text-left h-auto py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Bekijk geëxtraheerde CV data</span>
                        <Badge variant="secondary" className="text-xs">
                          {Object.keys(cvExtractedData).filter(k => getFieldValue(cvExtractedData[k]) !== null && k !== 'confidence' && k !== 'global_confidence').length} velden
                        </Badge>
                        {getGlobalConfidence() !== null && (
                          <Badge variant="outline" className={cn(
                            "text-[10px] px-1.5",
                            getGlobalConfidence()! >= 0.8 ? "bg-green-100 text-green-700 border-green-300" :
                            getGlobalConfidence()! >= 0.5 ? "bg-amber-100 text-amber-700 border-amber-300" :
                            "bg-red-100 text-red-700 border-red-300"
                          )}>
                            {getGlobalConfidence()! >= 0.8 ? "✓" : getGlobalConfidence()! >= 0.5 ? "~" : "?"} {Math.round(getGlobalConfidence()! * 100)}%
                          </Badge>
                        )}
                      </div>
                      <ChevronDown className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform duration-200",
                        cvDataOpen && "rotate-180"
                      )} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3">
                    <div className="bg-muted/50 rounded-lg p-4 space-y-3 text-sm">
                      {/* Contact Info */}
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-2">
                            {getFieldValue(cvExtractedData.naam) ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <AlertCircle className="h-3 w-3 text-amber-500" />}
                            <span className="text-muted-foreground">Naam:</span>
                            <span className="font-medium">{getFieldValue(cvExtractedData.naam) || "—"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {getFieldValue(cvExtractedData.email) ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <AlertCircle className="h-3 w-3 text-amber-500" />}
                            <span className="text-muted-foreground">Email:</span>
                            <span className="font-medium truncate">{getFieldValue(cvExtractedData.email) || "—"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {getFieldValue(cvExtractedData.telefoon) ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <AlertCircle className="h-3 w-3 text-amber-500" />}
                            <span className="text-muted-foreground">Telefoon:</span>
                            <span className="font-medium">{getFieldValue(cvExtractedData.telefoon) || "—"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {getFieldValue(cvExtractedData.woonplaats) ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <AlertCircle className="h-3 w-3 text-amber-500" />}
                            <span className="text-muted-foreground">Woonplaats:</span>
                            <span className="font-medium">{getFieldValue(cvExtractedData.woonplaats) || "—"}</span>
                          </div>
                        </div>
                      </div>

                      {/* Ervaring */}
                      <div className="space-y-1 border-t pt-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ervaring</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-2">
                            {getFieldValue(cvExtractedData.functie_niveau) ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <AlertCircle className="h-3 w-3 text-amber-500" />}
                            <span className="text-muted-foreground">Functie:</span>
                            <span className="font-medium">{getFieldValue(cvExtractedData.functie_niveau) || "—"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {getFieldValue(cvExtractedData.jaren_ervaring) ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <AlertCircle className="h-3 w-3 text-amber-500" />}
                            <span className="text-muted-foreground">Jaren ervaring:</span>
                            <span className="font-medium">{getFieldValue(cvExtractedData.jaren_ervaring) ? `${getFieldValue(cvExtractedData.jaren_ervaring)} jaar` : "—"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {getFieldValue(cvExtractedData.leidinggevende_ervaring) ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <AlertCircle className="h-3 w-3 text-muted-foreground" />}
                            <span className="text-muted-foreground">Leidinggevend:</span>
                            <span className="font-medium">{getFieldValue(cvExtractedData.leidinggevende_ervaring) ? "Ja" : "Nee"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {getFieldValue(cvExtractedData.hoogste_opleiding) ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <AlertCircle className="h-3 w-3 text-amber-500" />}
                            <span className="text-muted-foreground">Opleiding:</span>
                            <span className="font-medium truncate">{getFieldValue(cvExtractedData.hoogste_opleiding) || "—"}</span>
                          </div>
                        </div>
                      </div>

                      {/* Beschikbaarheid & Mobiliteit */}
                      <div className="space-y-1 border-t pt-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Beschikbaarheid & Mobiliteit</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-2">
                            {getFieldValue(cvExtractedData.werkvorm) ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <AlertCircle className="h-3 w-3 text-amber-500" />}
                            <span className="text-muted-foreground">Werkvorm:</span>
                            <span className="font-medium">{getFieldValue(cvExtractedData.werkvorm) || "—"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {getFieldValue(cvExtractedData.nachtdienst_bereid) !== null ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <AlertCircle className="h-3 w-3 text-amber-500" />}
                            <span className="text-muted-foreground">Nachtdienst:</span>
                            <span className="font-medium">{getFieldValue(cvExtractedData.nachtdienst_bereid) === true ? "Ja" : getFieldValue(cvExtractedData.nachtdienst_bereid) === false ? "Nee" : "—"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {getFieldValue(cvExtractedData.rijbewijs) ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <AlertCircle className="h-3 w-3 text-amber-500" />}
                            <span className="text-muted-foreground">Rijbewijs:</span>
                            <span className="font-medium">{getFieldValue(cvExtractedData.rijbewijs) || "—"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {getFieldValue(cvExtractedData.weekenddienst_bereid) !== null ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <AlertCircle className="h-3 w-3 text-amber-500" />}
                            <span className="text-muted-foreground">Weekenddienst:</span>
                            <span className="font-medium">{getFieldValue(cvExtractedData.weekenddienst_bereid) === true ? "Ja" : getFieldValue(cvExtractedData.weekenddienst_bereid) === false ? "Nee" : "—"}</span>
                          </div>
                        </div>
                      </div>

                      {/* Arrays: Opleidingen, Certificaten, Talen */}
                      {(((getFieldValue(cvExtractedData.opleidingen) as any[])?.length ?? 0) > 0 || ((getFieldValue(cvExtractedData.certificaten) as any[])?.length ?? 0) > 0 || ((getFieldValue(cvExtractedData.talen) as any[])?.length ?? 0) > 0) && (
                        <div className="space-y-2 border-t pt-3">
                          {((getFieldValue(cvExtractedData.opleidingen) as any[])?.length ?? 0) > 0 && (
                            <div>
                              <span className="text-xs text-muted-foreground">Opleidingen:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {(getFieldValue(cvExtractedData.opleidingen) as any[])?.map((opl: any, i: number) => (
                                  <Badge key={i} variant="outline" className="text-xs bg-blue-50 text-blue-700">
                                    {typeof opl === 'object' && opl?.naam ? opl.naam : String(opl)}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {((getFieldValue(cvExtractedData.certificaten) as any[])?.length ?? 0) > 0 && (
                            <div>
                              <span className="text-xs text-muted-foreground">Certificaten:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {(getFieldValue(cvExtractedData.certificaten) as any[])?.map((cert: any, i: number) => (
                                  <Badge key={i} variant="outline" className="text-xs bg-green-50 text-green-700">
                                    {typeof cert === 'object' && cert?.naam ? cert.naam : String(cert)}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {((getFieldValue(cvExtractedData.talen) as any[])?.length ?? 0) > 0 && (
                            <div>
                              <span className="text-xs text-muted-foreground">Talen:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {(getFieldValue(cvExtractedData.talen) as any[])?.map((taal: any, i: number) => (
                                  <Badge key={i} variant="outline" className="text-xs bg-purple-50 text-purple-700">
                                    {typeof taal === 'object' && taal?.naam ? taal.naam : String(taal)}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Confidence indicator */}
                      {getGlobalConfidence() !== null && (
                        <div className="border-t pt-3 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">AI Confidence:</span>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${
                              getGlobalConfidence()! >= 0.8 
                                ? "bg-green-50 text-green-700 border-green-200" 
                                : getGlobalConfidence()! >= 0.5 
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-red-50 text-red-700 border-red-200"
                            }`}
                          >
                            {Math.round(getGlobalConfidence()! * 100)}%
                          </Badge>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Critical fields if missing - show at top of Step 3 */}
              {!watch("naam") && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Naam <span className="text-destructive">*</span></Label>
                    <Badge variant="destructive" className="text-xs">
                      🔴 Verplicht
                    </Badge>
                  </div>
                  <Input 
                    {...register("naam")} 
                    placeholder="Voor- en achternaam" 
                    className="border-destructive focus-visible:ring-destructive"
                  />
                  {errors.naam && (
                    <p className="text-sm text-destructive">{errors.naam.message}</p>
                  )}
                </div>
              )}

              {!watch("email") && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>E-mailadres <span className="text-destructive">*</span></Label>
                    <Badge variant="destructive" className="text-xs">
                      🔴 Verplicht
                    </Badge>
                  </div>
                  <Input 
                    {...register("email")} 
                    type="email"
                    placeholder="naam@voorbeeld.nl" 
                    className="border-destructive focus-visible:ring-destructive"
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email.message}</p>
                  )}
                </div>
              )}

              {!watch("telefoon") && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Telefoonnummer</Label>
                    <Badge variant="outline" className="text-xs">
                      📝 Aanbevolen
                    </Badge>
                  </div>
                  <Input 
                    {...register("telefoon")} 
                    placeholder="06-12345678" 
                  />
                </div>
              )}

              <div className="space-y-4">
                {/* Werkvorm - only show if not extracted */}
                {!autoFilledFields.includes("werkvorm") && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label>Gewenste werkvorm</Label>
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50">
                        <Search className="h-3 w-3 mr-1" />
                        Niet gevonden in CV
                      </Badge>
                    </div>
                    <Select 
                      value={watch("werkvorm") || ""} 
                      onValueChange={(value) => setValue("werkvorm", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecteer werkvorm" />
                      </SelectTrigger>
                      <SelectContent>
                        {WERKVORMEN.map((wv) => (
                          <SelectItem key={wv.value} value={wv.value}>
                            {wv.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Regio - only show if not extracted */}
                {!autoFilledFields.includes("regio") && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label>Regio / Werkgebied</Label>
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50">
                        <Search className="h-3 w-3 mr-1" />
                        Niet gevonden in CV
                      </Badge>
                    </div>
                    <Input
                      {...register("regio")}
                      placeholder="Bijv. Utrecht, Amsterdam, etc."
                    />
                  </div>
                )}

                {/* Beschikbaarheid - only show if not extracted */}
                {!autoFilledFields.includes("beschikbaarheid") && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label>Beschikbaarheid</Label>
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50">
                        <Search className="h-3 w-3 mr-1" />
                        Niet gevonden in CV
                      </Badge>
                    </div>
                    <Select 
                      value={watch("beschikbaarheid") || ""} 
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
                )}

                {/* Eigen vervoer - only show if not extracted OR werkvorm is ZZP */}
                {(!autoFilledFields.includes("eigen_vervoer") || watch("werkvorm") === "ZZP") && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="eigen_vervoer"
                      checked={watch("eigen_vervoer")}
                      onCheckedChange={(checked) => setValue("eigen_vervoer", checked as boolean)}
                    />
                    <Label htmlFor="eigen_vervoer" className="text-sm font-normal cursor-pointer">
                      Eigen vervoer beschikbaar (auto/rijbewijs)
                    </Label>
                    {!autoFilledFields.includes("eigen_vervoer") && (
                      <Badge variant="outline" className="text-xs ml-2 text-amber-600 border-amber-300 bg-amber-50">
                        <Search className="h-3 w-3 mr-1" />
                        Niet gevonden
                      </Badge>
                    )}
                  </div>
                )}

                {/* Bron - ALWAYS show (never in CV) */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Bron sollicitatie</Label>
                    <Badge variant="outline" className="text-xs">
                      📝 Verplicht
                    </Badge>
                  </div>
                  <Select 
                    value={watch("bron") || ""} 
                    onValueChange={(value) => setValue("bron", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Waar komt sollicitatie vandaan?" />
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

                {/* Opmerkingen - collapsible if already filled */}
                {!autoFilledFields.includes("opmerkingen") && (
                  <div className="space-y-2">
                    <Label>Opmerkingen (optioneel)</Label>
                    <Textarea
                      {...register("opmerkingen")}
                      placeholder="Extra opmerkingen..."
                      rows={3}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between pt-4 border-t">
            {currentStep > 0 && !cvAnalyzing && (
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
            )}

            {currentStep === 0 ? null : currentStep < 3 ? (
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