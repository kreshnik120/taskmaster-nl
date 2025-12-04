import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, X, ChevronRight, ChevronLeft, Building2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BUREAU_IDS,
  SECTOREN,
  DOELGROEPEN,
  FUNCTIES,
  SECTOR_COLORS,
  DOELGROEP_COLORS,
  FUNCTIE_COLORS,
} from "@/types/organization";

// Schema for creating a new client organization
const organizationSchema = z.object({
  name: z.string().min(1, "Organisatienaam is verplicht"),
  org_id: z.string().min(1, "Bemiddelingsbureau is verplicht"),
  kvk_nummer: z.string().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
  // Hoofdlocatie fields
  location_naam: z.string().optional(),
  contactpersoon_naam: z.string().optional(),
  contactpersoon_email: z.string().email("Ongeldig e-mailadres").optional().or(z.literal("")),
  telefoon: z.string().optional(),
  adres: z.string().optional(),
  postcode: z.string().optional(),
  plaats: z.string().optional(),
});

type OrganizationFormData = z.infer<typeof organizationSchema>;

interface NewClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClientCreated: () => void;
}

const ORGANIZATIONS = [
  { id: BUREAU_IDS.ABCzorg, name: "ABCzorg" },
  { id: BUREAU_IDS.CitoZorg, name: "CitoZorg" },
];

export default function NewClientDialog({
  open,
  onOpenChange,
  onClientCreated,
}: NewClientDialogProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [sectors, setSectors] = useState<string[]>([]);
  const [doelgroepen, setDoelgroepen] = useState<string[]>([]);
  const [functies, setFuncties] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
    trigger,
  } = useForm<OrganizationFormData>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: "",
      org_id: "",
      kvk_nummer: "",
      website: "",
      notes: "",
      location_naam: "",
      contactpersoon_naam: "",
      contactpersoon_email: "",
      telefoon: "",
      adres: "",
      postcode: "",
      plaats: "",
    },
  });

  const selectedOrgId = watch("org_id");
  const organizationName = watch("name");

  const toggleSector = (sector: string) => {
    setSectors(prev =>
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

  const nextStep = async () => {
    if (currentStep === 1) {
      const valid = await trigger(["name", "org_id"]);
      if (!valid) return;
    }
    setCurrentStep(prev => Math.min(prev + 1, 3));
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const onSubmit = async (data: OrganizationFormData) => {
    setSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        toast.error("Niet ingelogd");
        return;
      }

      // Step 1: Create client_organization
      const { data: newOrg, error: orgError } = await supabase
        .from("client_organizations")
        .insert({
          name: data.name,
          org_id: data.org_id,
          kvk_nummer: data.kvk_nummer || null,
          website: data.website || null,
          notes: data.notes || null,
        })
        .select()
        .single();

      if (orgError) throw orgError;

      // Step 2: Create hoofdlocatie (main location)
      const locationName = data.location_naam || `${data.name} Hoofdlocatie`;
      const { data: newLocation, error: locError } = await supabase
        .from("client_locations")
        .insert({
          client_org_id: newOrg.id,
          naam: locationName,
          contactpersoon_naam: data.contactpersoon_naam || null,
          contactpersoon_email: data.contactpersoon_email || null,
          telefoon: data.telefoon || null,
          adres: data.adres || null,
          postcode: data.postcode || null,
          plaats: data.plaats || null,
        })
        .select()
        .single();

      if (locError) throw locError;

      // Step 3: Create default sublocation if matching criteria provided
      if (sectors.length > 0 || doelgroepen.length > 0 || functies.length > 0) {
        const { error: subError } = await supabase
          .from("client_sublocations")
          .insert({
            location_id: newLocation.id,
            naam: `${data.name} - Algemeen`,
            sector: sectors.length > 0 ? sectors : null,
            doelgroep: doelgroepen.length > 0 ? doelgroepen : null,
            gezochte_functies: functies.length > 0 ? functies : null,
            adres: data.adres || null,
            postcode: data.postcode || null,
            plaats: data.plaats || null,
            telefoon: data.telefoon || null,
          });

        if (subError) {
          console.error("Error creating sublocation:", subError);
          // Non-critical, continue
        }
      }

      toast.success("Organisatie succesvol toegevoegd", {
        description: `${data.name} is aangemaakt met hoofdlocatie`,
      });
      
      reset();
      setSectors([]);
      setDoelgroepen([]);
      setFuncties([]);
      setCurrentStep(1);
      onClientCreated();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error creating organization:", error);
      toast.error("Kon organisatie niet toevoegen", {
        description: error.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle>Nieuwe Klantorganisatie</DialogTitle>
              <DialogDescription>
                Voeg een nieuwe zorgorganisatie toe met locatie en matching criteria
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-2 my-4">
          {[1, 2, 3].map((step) => (
            <div key={step} className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-medium transition-all duration-300 ${
                  currentStep === step
                    ? "bg-primary text-primary-foreground scale-110"
                    : currentStep > step
                    ? "bg-green-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {currentStep > step ? "✓" : step}
              </div>
              {step < 3 && (
                <div
                  className={`h-0.5 w-12 transition-all duration-300 ${
                    currentStep > step ? "bg-green-500" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="text-center mb-4">
          <p className="text-sm text-muted-foreground">
            {currentStep === 1 && "Stap 1: Organisatie informatie"}
            {currentStep === 2 && "Stap 2: Matching Criteria"}
            {currentStep === 3 && "Stap 3: Locatie & Contact"}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <AnimatePresence mode="wait">
            {/* Step 1: Organisatie informatie */}
            {currentStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="name">
                    Organisatienaam <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    {...register("name")}
                    placeholder="Bijv. Stichting Zorggroep De Hof"
                    className="focus:ring-2 focus:ring-primary transition-all"
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="org_id">
                    Bemiddelingsbureau <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={selectedOrgId}
                    onValueChange={(value) => setValue("org_id", value)}
                  >
                    <SelectTrigger className="focus:ring-2 focus:ring-primary transition-all">
                      <SelectValue placeholder="Kies bemiddelingsbureau" />
                    </SelectTrigger>
                    <SelectContent>
                      {ORGANIZATIONS.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.org_id && (
                    <p className="text-sm text-destructive">{errors.org_id.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="kvk_nummer">KvK-nummer</Label>
                    <Input
                      id="kvk_nummer"
                      {...register("kvk_nummer")}
                      placeholder="12345678"
                      className="focus:ring-2 focus:ring-primary transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      {...register("website")}
                      placeholder="www.organisatie.nl"
                      className="focus:ring-2 focus:ring-primary transition-all"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 2: Matching Criteria */}
            {currentStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {/* Sector */}
                <div className="space-y-2">
                  <Label>Sector</Label>
                  <p className="text-xs text-muted-foreground mb-2">In welke zorgsectoren is deze organisatie actief?</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SECTOREN.map((sector) => {
                      const isSelected = sectors.includes(sector);
                      const colors = SECTOR_COLORS[sector] || { selected: "bg-primary text-primary-foreground", outline: "border-primary text-primary" };
                      return (
                        <Badge
                          key={sector}
                          variant="outline"
                          className={`cursor-pointer text-xs transition-all ${
                            isSelected ? colors.selected : colors.outline
                          }`}
                          onClick={() => toggleSector(sector)}
                        >
                          {sector}
                          {isSelected && <X className="ml-1 h-3 w-3" />}
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                {/* Doelgroep */}
                <div className="space-y-2">
                  <Label>Doelgroep</Label>
                  <p className="text-xs text-muted-foreground mb-2">Welke doelgroepen worden bediend?</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DOELGROEPEN.map((dg) => {
                      const isSelected = doelgroepen.includes(dg);
                      const colors = DOELGROEP_COLORS[dg] || { selected: "bg-primary text-primary-foreground", outline: "border-primary text-primary" };
                      return (
                        <Badge
                          key={dg}
                          variant="outline"
                          className={`cursor-pointer text-xs transition-all ${
                            isSelected ? colors.selected : colors.outline
                          }`}
                          onClick={() => toggleDoelgroep(dg)}
                        >
                          {dg}
                          {isSelected && <X className="ml-1 h-3 w-3" />}
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                {/* Gezochte functies */}
                <div className="space-y-2">
                  <Label>Gezochte functies</Label>
                  <p className="text-xs text-muted-foreground mb-2">Welke functies zijn gewenst?</p>
                  <div className="flex flex-wrap gap-1.5">
                    {FUNCTIES.map((functie) => {
                      const isSelected = functies.includes(functie);
                      const colors = FUNCTIE_COLORS[functie] || { selected: "bg-primary text-primary-foreground", outline: "border-primary text-primary" };
                      return (
                        <Badge
                          key={functie}
                          variant="outline"
                          className={`cursor-pointer text-xs transition-all ${
                            isSelected ? colors.selected : colors.outline
                          }`}
                          onClick={() => toggleFunctie(functie)}
                        >
                          {functie}
                          {isSelected && <X className="ml-1 h-3 w-3" />}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 3: Locatie & Contact */}
            {currentStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <p className="text-sm font-medium mb-1">Hoofdlocatie</p>
                  <p className="text-xs text-muted-foreground">
                    Deze gegevens worden gebruikt voor de hoofdlocatie van {organizationName || "de organisatie"}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location_naam">Locatienaam (optioneel)</Label>
                  <Input
                    id="location_naam"
                    {...register("location_naam")}
                    placeholder={`${organizationName || "Organisatie"} Hoofdlocatie`}
                    className="focus:ring-2 focus:ring-primary transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contactpersoon_naam">Contactpersoon</Label>
                    <Input
                      id="contactpersoon_naam"
                      {...register("contactpersoon_naam")}
                      placeholder="Bijv. Jan Bakker"
                      className="focus:ring-2 focus:ring-primary transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactpersoon_email">E-mail contactpersoon</Label>
                    <Input
                      id="contactpersoon_email"
                      type="email"
                      {...register("contactpersoon_email")}
                      placeholder="jan@organisatie.nl"
                      className="focus:ring-2 focus:ring-primary transition-all"
                    />
                    {errors.contactpersoon_email && (
                      <p className="text-sm text-destructive">{errors.contactpersoon_email.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telefoon">Telefoonnummer</Label>
                  <Input
                    id="telefoon"
                    {...register("telefoon")}
                    placeholder="Bijv. 024-1234567"
                    className="focus:ring-2 focus:ring-primary transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adres">Adres</Label>
                  <Input
                    id="adres"
                    {...register("adres")}
                    placeholder="Bijv. Hoofdstraat 123"
                    className="focus:ring-2 focus:ring-primary transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="postcode">Postcode</Label>
                    <Input
                      id="postcode"
                      {...register("postcode")}
                      placeholder="1234 AB"
                      className="focus:ring-2 focus:ring-primary transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plaats">Plaats</Label>
                    <Input
                      id="plaats"
                      {...register("plaats")}
                      placeholder="Amsterdam"
                      className="focus:ring-2 focus:ring-primary transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notities</Label>
                  <Textarea
                    id="notes"
                    {...register("notes")}
                    placeholder="Extra informatie over de organisatie..."
                    rows={3}
                    className="focus:ring-2 focus:ring-primary transition-all"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <DialogFooter className="flex justify-between">
            <div className="flex gap-2">
              {currentStep > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={prevStep}
                  disabled={submitting}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Terug
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  reset();
                  setCurrentStep(1);
                  setSectors([]);
                  setDoelgroepen([]);
                  setFuncties([]);
                  onOpenChange(false);
                }}
                disabled={submitting}
              >
                Annuleren
              </Button>
              {currentStep < 3 ? (
                <Button type="button" onClick={nextStep}>
                  Volgende
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Organisatie Toevoegen
                </Button>
              )}
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
