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
import { Loader2, X, ChevronRight, ChevronLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const clientSchema = z.object({
  company: z.string().min(1, "Bedrijfsnaam is verplicht"),
  name: z.string().min(1, "Contactpersoon is verplicht"),
  org_id: z.string().min(1, "Organisatie is verplicht"),
  email: z.string().email("Ongeldig e-mailadres").optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

type ClientFormData = z.infer<typeof clientSchema>;

interface NewClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClientCreated: () => void;
}

// Hardcoded org IDs matching the database
const ORGANIZATIONS = [
  { id: "650e8400-e29b-41d4-a716-446655440000", name: "ABCzorg" },
  { id: "650e8400-e29b-41d4-a716-446655440001", name: "CitoZorg" },
];

const SECTOREN = ["VVT", "GGZ", "GHZ", "Jeugdzorg", "Ziekenhuis/Klinisch", "Thuiszorg"];
const DOELGROEPEN = ["Ouderen", "LVB", "Psychiatrie", "Somatiek", "Kinderen/Jeugd", "Verslaving"];
const FUNCTIES = ["VIG", "HBO-V", "Verpleegkundige MBO", "Helpende", "Begeleider", "Persoonlijk begeleider", "GGZ-agoog"];

// Semantic color mappings
const SECTOR_COLORS: Record<string, { selected: string; outline: string }> = {
  "VVT": { selected: "bg-blue-500 text-white border-blue-500 hover:bg-blue-600", outline: "border-blue-500 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950" },
  "GGZ": { selected: "bg-purple-500 text-white border-purple-500 hover:bg-purple-600", outline: "border-purple-500 text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950" },
  "GHZ": { selected: "bg-green-500 text-white border-green-500 hover:bg-green-600", outline: "border-green-500 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950" },
  "Jeugdzorg": { selected: "bg-orange-500 text-white border-orange-500 hover:bg-orange-600", outline: "border-orange-500 text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950" },
  "Ziekenhuis/Klinisch": { selected: "bg-red-500 text-white border-red-500 hover:bg-red-600", outline: "border-red-500 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950" },
  "Thuiszorg": { selected: "bg-teal-500 text-white border-teal-500 hover:bg-teal-600", outline: "border-teal-500 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950" },
};

const DOELGROEP_COLORS: Record<string, { selected: string; outline: string }> = {
  "Ouderen": { selected: "bg-amber-500 text-white border-amber-500 hover:bg-amber-600", outline: "border-amber-500 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950" },
  "LVB": { selected: "bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600", outline: "border-emerald-500 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950" },
  "Psychiatrie": { selected: "bg-indigo-500 text-white border-indigo-500 hover:bg-indigo-600", outline: "border-indigo-500 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950" },
  "Somatiek": { selected: "bg-rose-500 text-white border-rose-500 hover:bg-rose-600", outline: "border-rose-500 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950" },
  "Kinderen/Jeugd": { selected: "bg-cyan-500 text-white border-cyan-500 hover:bg-cyan-600", outline: "border-cyan-500 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950" },
  "Verslaving": { selected: "bg-slate-500 text-white border-slate-500 hover:bg-slate-600", outline: "border-slate-500 text-slate-700 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-950" },
};

const FUNCTIE_COLORS: Record<string, { selected: string; outline: string }> = {
  "VIG": { selected: "bg-blue-600 text-white border-blue-600 hover:bg-blue-700", outline: "border-blue-600 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950" },
  "HBO-V": { selected: "bg-purple-600 text-white border-purple-600 hover:bg-purple-700", outline: "border-purple-600 text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950" },
  "Verpleegkundige MBO": { selected: "bg-green-600 text-white border-green-600 hover:bg-green-700", outline: "border-green-600 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950" },
  "Helpende": { selected: "bg-orange-600 text-white border-orange-600 hover:bg-orange-700", outline: "border-orange-600 text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950" },
  "Begeleider": { selected: "bg-teal-600 text-white border-teal-600 hover:bg-teal-700", outline: "border-teal-600 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950" },
  "Persoonlijk begeleider": { selected: "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700", outline: "border-indigo-600 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950" },
  "GGZ-agoog": { selected: "bg-pink-600 text-white border-pink-600 hover:bg-pink-700", outline: "border-pink-600 text-pink-700 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950" },
};

export default function NewClientDialog({
  open,
  onOpenChange,
  onClientCreated,
}: NewClientDialogProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [regios, setRegios] = useState<string[]>([]);
  const [newRegio, setNewRegio] = useState("");
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
  } = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      company: "",
      name: "",
      org_id: "",
      email: "",
      phone: "",
      address: "",
      notes: "",
    },
  });

  const selectedOrgId = watch("org_id");
  
  const handleAddRegio = () => {
    if (newRegio.trim() && !regios.includes(newRegio.trim())) {
      setRegios([...regios, newRegio.trim()]);
      setNewRegio("");
    }
  };
  
  const handleRemoveRegio = (regio: string) => {
    setRegios(regios.filter(r => r !== regio));
  };
  
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
      const valid = await trigger(["company", "name", "org_id"]);
      if (!valid) return;
    }
    setCurrentStep(prev => Math.min(prev + 1, 3));
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const onSubmit = async (data: ClientFormData) => {
    setSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        toast.error("Niet ingelogd");
        return;
      }

      // Insert client with matching criteria
      const { error } = await supabase.from("clients").insert({
        company: data.company,
        name: data.name,
        org_id: data.org_id,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        notes: data.notes || null,
        regio: regios.length > 0 ? regios : null,
        sector: sectors.length > 0 ? sectors : null,
        doelgroep: doelgroepen.length > 0 ? doelgroepen : null,
        gezochte_functies: functies.length > 0 ? functies : null,
      });

      if (error) throw error;

      toast.success("Klant succesvol toegevoegd");
      reset();
      setRegios([]);
      setSectors([]);
      setDoelgroepen([]);
      setFuncties([]);
      setCurrentStep(1);
      onClientCreated();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error creating client:", error);
      toast.error("Kon klant niet toevoegen");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nieuwe Klant Toevoegen</DialogTitle>
          <DialogDescription>
            Voeg een nieuwe klant toe met contactgegevens
          </DialogDescription>
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
            {currentStep === 1 && "Stap 1: Bedrijfsinformatie"}
            {currentStep === 2 && "Stap 2: Matching Criteria"}
            {currentStep === 3 && "Stap 3: Contact & Notities"}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <AnimatePresence mode="wait">
            {/* Step 1: Bedrijfsinformatie */}
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
                  <Label htmlFor="company">
                    Bedrijfsnaam <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="company"
                    {...register("company")}
                    placeholder="Bijv. Zorgcentrum De Hof"
                    className="focus:ring-2 focus:ring-primary transition-all"
                  />
                  {errors.company && (
                    <p className="text-sm text-destructive">{errors.company.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">
                    Contactpersoon <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    {...register("name")}
                    placeholder="Bijv. Jan Bakker"
                    className="focus:ring-2 focus:ring-primary transition-all"
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="org_id">
                    Organisatie <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={selectedOrgId}
                    onValueChange={(value) => setValue("org_id", value)}
                  >
                    <SelectTrigger className="focus:ring-2 focus:ring-primary transition-all">
                      <SelectValue placeholder="Kies organisatie" />
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
                {/* Regio's */}
                <div className="space-y-2">
                  <Label>Regio's</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newRegio}
                      onChange={(e) => setNewRegio(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddRegio())}
                      placeholder="Bijv. Nijmegen, Utrecht..."
                      className="focus:ring-2 focus:ring-primary transition-all"
                    />
                    <Button type="button" onClick={handleAddRegio} variant="outline" size="sm">
                      +
                    </Button>
                  </div>
                  {regios.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {regios.map((regio) => (
                        <Badge key={regio} variant="secondary" className="cursor-pointer">
                          {regio}
                          <X 
                            className="ml-1 h-3 w-3" 
                            onClick={() => handleRemoveRegio(regio)}
                          />
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sector */}
                <div className="space-y-2">
                  <Label>Sector</Label>
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

            {/* Step 3: Contact & Notities */}
            {currentStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="email">E-mailadres</Label>
                  <Input
                    id="email"
                    type="email"
                    {...register("email")}
                    placeholder="Bijv. contact@zorgcentrum.nl"
                    className="focus:ring-2 focus:ring-primary transition-all"
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Telefoonnummer</Label>
                  <Input
                    id="phone"
                    {...register("phone")}
                    placeholder="Bijv. 06-12345678"
                    className="focus:ring-2 focus:ring-primary transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Adres</Label>
                  <Input
                    id="address"
                    {...register("address")}
                    placeholder="Bijv. Hoofdstraat 123, 1234 AB Amsterdam"
                    className="focus:ring-2 focus:ring-primary transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notities</Label>
                  <Textarea
                    id="notes"
                    {...register("notes")}
                    placeholder="Extra informatie over de klant..."
                    rows={4}
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
                  Klant Toevoegen
                </Button>
              )}
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
