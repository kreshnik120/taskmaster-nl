import { useState, useEffect, useMemo } from "react";
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { 
  CalendarIcon, 
  TrendingUp, 
  ChevronRight, 
  ChevronLeft, 
  Briefcase, 
  Clock, 
  Euro,
  Building2,
  User,
  FileText,
  CheckCircle2,
  AlertCircle,
  Pencil
} from "lucide-react";
import { format, addMonths } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { cn } from "@/lib/utils";

interface PlacementConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  professionalId: string;
  professionalName: string;
  professionalWerkvorm?: string;
  professionalFunctieNiveau?: string;
  sublocationId: string;
  sublocationName: string;
  matchScore: number;
  onSuccess: () => void;
}

type WerkvormType = "ZZP" | "Uitzendkracht" | "ABCito constructie";
type PlaatsingType = "periode_opdracht" | "langdurig" | "flexibel";

const WERKVORM_INFO: Record<WerkvormType, { 
  label: string; 
  description: string; 
  icon: React.ReactNode;
  defaultPlaatsing: PlaatsingType;
  color: string;
}> = {
  "ZZP": {
    label: "ZZP",
    description: "Zelfstandige zonder personeel - Factureert zelf, eigen BTW",
    icon: <Briefcase className="h-5 w-5" />,
    defaultPlaatsing: "periode_opdracht",
    color: "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300"
  },
  "Uitzendkracht": {
    label: "Uitzendkracht",
    description: "Via uitzendconstructie - Flexibel inzetbaar",
    icon: <Clock className="h-5 w-5" />,
    defaultPlaatsing: "flexibel",
    color: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
  },
  "ABCito constructie": {
    label: "ABCito constructie",
    description: "Vaste constructie via ABCzorg/CitoZorg",
    icon: <Building2 className="h-5 w-5" />,
    defaultPlaatsing: "langdurig",
    color: "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300"
  }
};

const PLAATSING_INFO: Record<PlaatsingType, {
  label: string;
  description: string;
  requiresEndDate: boolean;
  defaultDurationMonths?: number;
}> = {
  "periode_opdracht": {
    label: "Periode-opdracht",
    description: "Tijdelijke opdracht met vaste einddatum",
    requiresEndDate: true,
    defaultDurationMonths: 3
  },
  "langdurig": {
    label: "Langdurig",
    description: "Structurele plaatsing zonder vaste einddatum",
    requiresEndDate: false
  },
  "flexibel": {
    label: "Flexibel",
    description: "Flexibele inzet op afroep basis",
    requiresEndDate: false
  }
};

export function PlacementConfirmDialog({
  open,
  onOpenChange,
  professionalId,
  professionalName,
  professionalWerkvorm,
  professionalFunctieNiveau,
  sublocationId,
  sublocationName,
  matchScore,
  onSuccess,
}: PlacementConfirmDialogProps) {
  const [step, setStep] = useState(1);
  const [werkvorm, setWerkvorm] = useState<WerkvormType | null>(null);
  const [plaatsingType, setPlaatsingType] = useState<PlaatsingType | null>(null);
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [weeklyHours, setWeeklyHours] = useState<number>(32);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tariefPreview, setTariefPreview] = useState<{
    basis_tarief: number;
    toeslag_percentage: number;
    btw_percentage: number;
  } | null>(null);

  // Check if werkvorm step can be skipped
  const shouldSkipWerkvormStep = useMemo(() => {
    return professionalWerkvorm && 
      professionalWerkvorm !== "Beide" &&
      WERKVORM_INFO[professionalWerkvorm as WerkvormType];
  }, [professionalWerkvorm]);

  // Determine total steps and step mapping
  const totalSteps = shouldSkipWerkvormStep ? 3 : 4;
  const getDisplayStep = (internalStep: number) => {
    if (shouldSkipWerkvormStep && internalStep > 1) {
      return internalStep - 1;
    }
    return internalStep;
  };

  // Set default werkvorm and skip step 1 if possible
  useEffect(() => {
    if (open) {
      if (shouldSkipWerkvormStep && professionalWerkvorm) {
        setWerkvorm(professionalWerkvorm as WerkvormType);
        setStep(2); // Skip to step 2
      } else {
        setStep(1);
      }
    }
  }, [open, shouldSkipWerkvormStep, professionalWerkvorm]);

  // Auto-set plaatsing type based on werkvorm
  useEffect(() => {
    if (werkvorm) {
      const defaultType = WERKVORM_INFO[werkvorm].defaultPlaatsing;
      setPlaatsingType(defaultType);
      
      // Set default end date for periode_opdracht
      if (defaultType === "periode_opdracht") {
        setEndDate(addMonths(startDate, 3));
      } else {
        setEndDate(null);
      }
    }
  }, [werkvorm, startDate]);

  // Fetch tarief preview
  useEffect(() => {
    const fetchTarief = async () => {
      if (!werkvorm || !professionalFunctieNiveau || !sublocationId) return;
      
      const { data } = await supabase
        .from("werkvorm_tarieven")
        .select("basis_tarief, toeslag_percentage, btw_percentage")
        .eq("sublocation_id", sublocationId)
        .eq("functie_niveau", professionalFunctieNiveau)
        .eq("werkvorm", werkvorm)
        .eq("is_active", true)
        .maybeSingle();
      
      if (data) {
        setTariefPreview(data);
      } else {
        // Fallback to hourly_rates if no werkvorm-specific rate
        const { data: fallbackRate } = await supabase
          .from("hourly_rates")
          .select("basis_tarief, btw_percentage")
          .eq("sublocation_id", sublocationId)
          .eq("is_active", true)
          .maybeSingle();
        
        if (fallbackRate) {
          setTariefPreview({
            basis_tarief: fallbackRate.basis_tarief,
            toeslag_percentage: 0,
            btw_percentage: fallbackRate.btw_percentage
          });
        }
      }
    };
    
    fetchTarief();
  }, [werkvorm, professionalFunctieNiveau, sublocationId]);

  const handleSubmit = async () => {
    if (!werkvorm || !plaatsingType) {
      toast.error("Selecteer werkvorm en plaatsing type");
      return;
    }

    if (!startDate) {
      toast.error("Selecteer een startdatum");
      return;
    }

    if (PLAATSING_INFO[plaatsingType].requiresEndDate && !endDate) {
      toast.error("Einddatum is verplicht voor periode-opdrachten");
      return;
    }

    if (weeklyHours < 1 || weeklyHours > 40) {
      toast.error("Uren per week moet tussen 1 en 40 zijn");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create assignment - trigger handles event logging automatically
      const { error } = await supabase
        .from("assignments")
        .insert({
          professional_id: professionalId,
          sublocation_id: sublocationId,
          start_date: format(startDate, "yyyy-MM-dd"),
          end_date: endDate ? format(endDate, "yyyy-MM-dd") : null,
          weekly_hours: weeklyHours,
          werkvorm: werkvorm,
          plaatsing_type: plaatsingType,
          verwachte_einddatum: plaatsingType === "langdurig" ? addMonths(startDate, 12).toISOString().split('T')[0] : null,
          hourly_rate_id: null,
          status: "active",
          created_by: user.id,
          ai_match_score: matchScore,
        });

      if (error) throw error;

      // Success feedback
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });

      toast.success("Plaatsing aangemaakt!", {
        description: `${professionalName} gekoppeld als ${werkvorm} aan ${sublocationName}`,
      });

      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Placement error:", error);
      toast.error("Fout bij aanmaken plaatsing");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setWerkvorm(null);
    setPlaatsingType(null);
    setStartDate(new Date());
    setEndDate(null);
    setWeeklyHours(32);
    setTariefPreview(null);
  };

  const canProceed = () => {
    switch (step) {
      case 1: return !!werkvorm;
      case 2: return !!plaatsingType;
      case 3: return !!startDate && weeklyHours >= 1 && weeklyHours <= 40 && 
               (!PLAATSING_INFO[plaatsingType!]?.requiresEndDate || !!endDate);
      default: return true;
    }
  };

  const calculateEstimatedRevenue = () => {
    if (!tariefPreview || !weeklyHours) return null;
    const weeklyRevenue = tariefPreview.basis_tarief * weeklyHours;
    const monthlyRevenue = weeklyRevenue * 4.33;
    return { weekly: weeklyRevenue, monthly: monthlyRevenue };
  };

  const revenue = calculateEstimatedRevenue();

  // Handle going back - need to handle skipped step
  const handleBack = () => {
    if (shouldSkipWerkvormStep && step === 2) {
      // Can't go back further if we skipped step 1
      return;
    }
    setStep(step - 1);
  };

  const canGoBack = () => {
    if (shouldSkipWerkvormStep) {
      return step > 2;
    }
    return step > 1;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Plaatsing bevestigen
          </DialogTitle>
          <DialogDescription>
            {professionalName} koppelen aan {sublocationName}
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator - dynamic based on steps */}
        <div className="flex items-center justify-center gap-2 py-2">
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => {
            const displayStep = getDisplayStep(step);
            return (
              <div key={s} className="flex items-center">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                  displayStep === s ? "bg-primary text-primary-foreground" :
                  displayStep > s ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {displayStep > s ? <CheckCircle2 className="h-4 w-4" /> : s}
                </div>
                {s < totalSteps && <ChevronRight className="h-4 w-4 text-muted-foreground mx-1" />}
              </div>
            );
          })}
        </div>

        {/* Match score banner with werkvorm badge when skipped */}
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{professionalName}</span>
            {professionalFunctieNiveau && (
              <Badge variant="secondary" className="text-xs">{professionalFunctieNiveau}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Show werkvorm badge with edit option when step was skipped */}
            {shouldSkipWerkvormStep && werkvorm && step > 1 && (
              <Badge 
                variant="outline" 
                className={cn(
                  "cursor-pointer hover:bg-muted flex items-center gap-1",
                  WERKVORM_INFO[werkvorm].color
                )}
                onClick={() => setStep(1)}
              >
                {werkvorm}
                <Pencil className="h-3 w-3 ml-1" />
              </Badge>
            )}
            <Badge variant="default" className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {matchScore}% match
            </Badge>
          </div>
        </div>

        <div className="py-4 min-h-[280px]">
          {/* Step 1: Werkvorm selectie */}
          {step === 1 && (
            <div className="space-y-4">
              <Label className="text-base font-semibold">Selecteer werkvorm</Label>
              <div className="grid gap-3">
                {(Object.keys(WERKVORM_INFO) as WerkvormType[]).map((w) => (
                  <Card 
                    key={w}
                    className={cn(
                      "cursor-pointer transition-all hover:shadow-md",
                      werkvorm === w ? "ring-2 ring-primary" : "hover:border-primary/50",
                      WERKVORM_INFO[w].color
                    )}
                    onClick={() => setWerkvorm(w)}
                  >
                    <CardContent className="flex items-center gap-4 p-4">
                      <div className="p-2 rounded-lg bg-background/50">
                        {WERKVORM_INFO[w].icon}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{WERKVORM_INFO[w].label}</span>
                          {professionalWerkvorm === w && (
                            <Badge variant="outline" className="text-xs">Voorkeur professional</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{WERKVORM_INFO[w].description}</p>
                      </div>
                      {werkvorm === w && <CheckCircle2 className="h-5 w-5 text-primary" />}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Plaatsing type */}
          {step === 2 && (
            <div className="space-y-4">
              <Label className="text-base font-semibold">Type plaatsing</Label>
              <div className="grid gap-3">
                {(Object.keys(PLAATSING_INFO) as PlaatsingType[]).map((p) => (
                  <Card 
                    key={p}
                    className={cn(
                      "cursor-pointer transition-all hover:shadow-md",
                      plaatsingType === p ? "ring-2 ring-primary" : "hover:border-primary/50"
                    )}
                    onClick={() => {
                      setPlaatsingType(p);
                      if (p === "periode_opdracht") {
                        setEndDate(addMonths(startDate, PLAATSING_INFO[p].defaultDurationMonths || 3));
                      } else {
                        setEndDate(null);
                      }
                    }}
                  >
                    <CardContent className="flex items-center gap-4 p-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{PLAATSING_INFO[p].label}</span>
                          {werkvorm && WERKVORM_INFO[werkvorm].defaultPlaatsing === p && (
                            <Badge variant="outline" className="text-xs">Aanbevolen voor {werkvorm}</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{PLAATSING_INFO[p].description}</p>
                      </div>
                      {plaatsingType === p && <CheckCircle2 className="h-5 w-5 text-primary" />}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Details */}
          {step === 3 && (
            <div className="space-y-4">
              <Label className="text-base font-semibold">Details</Label>
              
              {/* Start date */}
              <div className="space-y-2">
                <Label htmlFor="startDate">Startdatum *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "PPP", { locale: nl }) : "Selecteer datum"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={(date) => {
                        if (date) {
                          setStartDate(date);
                          if (plaatsingType === "periode_opdracht" && endDate) {
                            setEndDate(addMonths(date, 3));
                          }
                        }
                      }}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* End date (conditional) */}
              {plaatsingType && PLAATSING_INFO[plaatsingType].requiresEndDate && (
                <div className="space-y-2">
                  <Label htmlFor="endDate">Einddatum *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, "PPP", { locale: nl }) : "Selecteer einddatum"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={endDate || undefined}
                        onSelect={(date) => date && setEndDate(date)}
                        disabled={(date) => date < startDate}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {/* Weekly hours */}
              <div className="space-y-2">
                <Label htmlFor="weeklyHours">Uren per week *</Label>
                <Input
                  id="weeklyHours"
                  type="number"
                  min={1}
                  max={40}
                  value={weeklyHours}
                  onChange={(e) => setWeeklyHours(Number(e.target.value))}
                  placeholder="32"
                />
                <p className="text-xs text-muted-foreground">Tussen 1 en 40 uur per week</p>
              </div>
            </div>
          )}

          {/* Step 4: Bevestiging */}
          {step === 4 && (
            <div className="space-y-4">
              <Label className="text-base font-semibold">Bevestig plaatsing</Label>
              
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Professional</span>
                    <span className="font-medium">{professionalName}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Werklocatie</span>
                    <span className="font-medium">{sublocationName}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Werkvorm</span>
                    <Badge className={WERKVORM_INFO[werkvorm!].color}>{werkvorm}</Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium">{PLAATSING_INFO[plaatsingType!].label}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Periode</span>
                    <span className="font-medium">
                      {format(startDate, "d MMM yyyy", { locale: nl })}
                      {endDate && ` - ${format(endDate, "d MMM yyyy", { locale: nl })}`}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Uren per week</span>
                    <span className="font-medium">{weeklyHours} uur</span>
                  </div>
                </CardContent>
              </Card>

              {/* Tarief preview */}
              {tariefPreview && revenue && (
                <Card className="bg-green-500/5 border-green-500/20">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Euro className="h-4 w-4 text-green-600" />
                      <span className="font-medium text-green-700 dark:text-green-300">Tarief indicatie</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Uurtarief</p>
                        <p className="font-semibold">€{tariefPreview.basis_tarief.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Per week</p>
                        <p className="font-semibold">€{revenue.weekly.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Per maand (indicatie)</p>
                        <p className="font-semibold">€{revenue.monthly.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">BTW</p>
                        <p className="font-semibold">{tariefPreview.btw_percentage}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {!tariefPreview && (
                <div className="flex items-center gap-2 p-3 bg-amber-500/10 rounded-lg text-amber-700 dark:text-amber-300">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">Geen tarief geconfigureerd voor deze combinatie</span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {canGoBack() && (
              <Button variant="ghost" onClick={handleBack} disabled={isSubmitting}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Vorige
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }} disabled={isSubmitting}>
              Annuleer
            </Button>
            {step < 4 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}>
                Volgende
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? "Bezig..." : "Bevestig plaatsing"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
