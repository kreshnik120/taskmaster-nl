import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  User, Building2, Calendar, TrendingUp, CheckCircle2, 
  Clock, Phone, Mail, MapPin, Award, Briefcase, CalendarIcon, Star, Check
} from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { MatchScoreBreakdown } from "./recruitment/MatchScoreBreakdown";
import { cn } from "@/lib/utils";
import confetti from "canvas-confetti";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Placement {
  id: string;
  professional_id: string;
  sublocation_id: string;
  status: string;
  werkvorm: string | null;
  plaatsing_type: string | null;
  start_date: string | null;
  end_date: string | null;
  weekly_hours: number | null;
  ai_match_score: number | null;
  ai_match_reasoning: any;
  created_at: string;
  updated_at: string;
  professionals: {
    id: string;
    full_name: string;
    functie_niveau: string;
    werkvorm: string | null;
    regio: string | null;
    telefoonnummer: string | null;
    email: string | null;
  } | null;
  client_sublocations: {
    id: string;
    naam: string;
    plaats: string | null;
    doelgroep: string[] | null;
    sector: string[] | null;
    client_locations: {
      id: string;
      naam: string;
      client_organizations: {
        id: string;
        name: string;
      } | null;
    } | null;
  } | null;
}

interface PlacementDetailModalProps {
  placement: Placement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange?: (placementId: string, newStatus: string, completedAt?: Date) => void;
}

const WERKVORM_LABELS: Record<string, string> = {
  ZZP: "ZZP",
  Uitzendkracht: "Uitzendkracht",
  "ABCito constructie": "ABCito constructie"
};

const PLAATSING_TYPE_LABELS: Record<string, string> = {
  periode_opdracht: "Periode opdracht",
  langdurig: "Langdurige plaatsing",
  flexibel: "Flexibele inzet"
};

const getStatusVariant = (status: string) => {
  switch (status) {
    case "active": return "default";
    case "draft": return "secondary";
    case "completed": return "outline";
    default: return "secondary";
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "active": return "Actief";
    case "draft": return "Concept";
    case "completed": return "Afgerond";
    case "cancelled": return "Geannuleerd";
    default: return status;
  }
};

const triggerMiniConfetti = () => {
  confetti({
    particleCount: 80,
    spread: 60,
    origin: { y: 0.7 },
    colors: ['#22c55e', '#10b981', '#059669', '#34d399'],
    scalar: 0.8,
    gravity: 1.2,
  });
};

// Rating labels
const RATING_LABELS = ["", "Onvoldoende", "Matig", "Voldoende", "Goed", "Uitstekend"];

// 5-Star Rating Component with labels
function StarRating({ 
  rating, 
  onRatingChange 
}: { 
  rating: number; 
  onRatingChange: (value: number) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className="p-1 transition-transform hover:scale-110 focus:outline-none"
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onRatingChange(star)}
          >
            <Star
              className={cn(
                "h-6 w-6 transition-colors",
                (hovered !== null ? star <= hovered : star <= rating)
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-muted-foreground/40"
              )}
            />
          </button>
        ))}
        <span className="ml-2 text-sm font-medium text-foreground">
          {RATING_LABELS[hovered ?? rating] || ""}
        </span>
      </div>
      {/* Rating scale labels under stars */}
      <div className="flex justify-between px-1 text-[10px] text-muted-foreground">
        <span>Slecht</span>
        <span>Uitstekend</span>
      </div>
    </div>
  );
}

export function PlacementDetailModal({ 
  placement, 
  open, 
  onOpenChange,
  onStatusChange 
}: PlacementDetailModalProps) {
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [completionDate, setCompletionDate] = useState<Date>(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  
  // Evaluation state
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [wouldRehire, setWouldRehire] = useState(true);
  const [isSavingEvaluation, setIsSavingEvaluation] = useState(false);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);

  if (!placement) return null;

  const statusHistory = [
    { status: "draft", date: placement.created_at, label: "Aangemaakt" },
    { status: "active", date: placement.status === "active" || placement.status === "completed" ? placement.updated_at : null, label: "Geactiveerd" },
    { status: "completed", date: placement.status === "completed" ? placement.updated_at : null, label: "Afgerond" },
  ];

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === "completed") {
      // Reset evaluation form
      setRating(0);
      setFeedback("");
      setWouldRehire(true);
      setCompletionDate(new Date());
      setCompletionDialogOpen(true);
    } else if (onStatusChange) {
      onStatusChange(placement.id, newStatus);
    }
  };

  const handleConfirmCompletion = async () => {
    // Validate rating
    if (rating === 0) {
      toast.error("Geef een beoordeling voordat je afrondt");
      return;
    }

    setIsSavingEvaluation(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Save evaluation
      const { error: evalError } = await supabase
        .from("assignment_evaluations")
        .insert({
          assignment_id: placement.id,
          rating,
          feedback: feedback.trim() || null,
          would_rehire: wouldRehire,
          evaluator_id: user?.id
        });

      if (evalError) {
        console.error("Error saving evaluation:", evalError);
        // Continue anyway - don't block completion
      }

      // Show success animation first
      setShowSuccessAnimation(true);
      
      // Wait for animation, then complete
      setTimeout(() => {
        setShowSuccessAnimation(false);
        
        // Complete the placement
        if (onStatusChange) {
          onStatusChange(placement.id, "completed", completionDate);
          triggerMiniConfetti();
          toast.success(
            `Plaatsing afgerond${wouldRehire ? " - Professional gemarkeerd voor herplaatsing" : ""}`,
            { description: `${rating} sterren beoordeling opgeslagen` }
          );
        }
        
        setCompletionDialogOpen(false);
      }, 800);
    } catch (error) {
      console.error("Error completing placement:", error);
      toast.error("Fout bij afronden");
    } finally {
      setIsSavingEvaluation(false);
    }
  };

  const sublocation = placement.client_sublocations;
  const location = sublocation?.client_locations;
  const organization = location?.client_organizations;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Plaatsing Details
              </span>
              <Badge variant={getStatusVariant(placement.status)}>
                {getStatusLabel(placement.status)}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Werkvorm & Plaatsing Type Info */}
            <div className="flex items-center gap-3 flex-wrap">
              {placement.werkvorm && (
                <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-800">
                  {WERKVORM_LABELS[placement.werkvorm] || placement.werkvorm}
                </Badge>
              )}
              {placement.plaatsing_type && (
                <Badge className="bg-blue-500/10 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-800">
                  {PLAATSING_TYPE_LABELS[placement.plaatsing_type] || placement.plaatsing_type}
                </Badge>
              )}
              {placement.weekly_hours && (
                <Badge variant="outline">
                  {placement.weekly_hours} uur/week
                </Badge>
              )}
            </div>

            {/* Periode Info */}
            {(placement.start_date || placement.end_date) && (
              <Card className="bg-muted/30">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Periode:</span>
                    {placement.start_date && (
                      <span>{format(new Date(placement.start_date), "d MMMM yyyy", { locale: nl })}</span>
                    )}
                    {placement.end_date && (
                      <>
                        <span className="text-muted-foreground">→</span>
                        <span>{format(new Date(placement.end_date), "d MMMM yyyy", { locale: nl })}</span>
                      </>
                    )}
                    {!placement.end_date && placement.start_date && (
                      <span className="text-muted-foreground">(doorlopend)</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Professional & Werklocatie Side-by-Side */}
            <div className="grid grid-cols-2 gap-4">
              {/* Professional Card */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <User className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Professional</h3>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <p className="font-medium text-lg">{placement.professionals?.full_name || "Onbekend"}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {placement.professionals?.functie_niveau && (
                          <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-800">
                            {placement.professionals.functie_niveau}
                          </Badge>
                        )}
                        {placement.professionals?.werkvorm && (
                          <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-800">
                            {placement.professionals.werkvorm}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {placement.professionals?.regio && (
                      <p className="text-sm flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        {placement.professionals.regio}
                      </p>
                    )}

                    {placement.professionals?.telefoonnummer && (
                      <p className="text-sm flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-4 w-4" />
                        {placement.professionals.telefoonnummer}
                      </p>
                    )}

                    {placement.professionals?.email && (
                      <p className="text-sm flex items-center gap-2 text-muted-foreground truncate">
                        <Mail className="h-4 w-4" />
                        {placement.professionals.email}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Werklocatie Card */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Building2 className="h-5 w-5 text-green-600" />
                    <h3 className="font-semibold">Werklocatie</h3>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <p className="font-medium text-lg">{sublocation?.naam || "Onbekend"}</p>
                      {sublocation?.plaats && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {sublocation.plaats}
                        </p>
                      )}
                    </div>

                    {/* Locatie hiërarchie */}
                    {(location || organization) && (
                      <div className="text-sm text-muted-foreground">
                        {location?.naam && <span>{location.naam}</span>}
                        {organization?.name && (
                          <span className="font-medium"> ({organization.name})</span>
                        )}
                      </div>
                    )}

                    {sublocation?.sector && sublocation.sector.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Sectoren:</p>
                        <div className="flex flex-wrap gap-1">
                          {sublocation.sector.map((s, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs bg-purple-500/10 text-purple-700 border-purple-200 dark:bg-purple-500/20 dark:text-purple-400 dark:border-purple-800">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {sublocation?.doelgroep && sublocation.doelgroep.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Doelgroepen:</p>
                        <div className="flex flex-wrap gap-1">
                          {sublocation.doelgroep.map((d, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {d}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Separator />

            {/* Match Score Breakdown */}
            {placement.ai_match_score !== null && placement.ai_match_reasoning && (
              <>
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Award className="h-4 w-4" />
                    Match Score Analyse
                  </h3>
                  <MatchScoreBreakdown
                    breakdown={placement.ai_match_reasoning}
                    totalScore={Math.round(placement.ai_match_score)}
                  />
                </div>
                <Separator />
              </>
            )}

            {/* Status Timeline */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Status Tijdlijn
              </h3>
              <div className="relative space-y-4 pl-6">
                {/* Vertical line */}
                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
                
                {statusHistory.map((item, idx) => (
                  <div key={idx} className="relative">
                    {/* Dot */}
                    <div className={`absolute left-[-23px] top-1 w-3 h-3 rounded-full border-2 ${
                      item.date 
                        ? "bg-primary border-primary" 
                        : "bg-background border-muted-foreground"
                    }`} />
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`text-sm font-medium ${item.date ? "" : "text-muted-foreground"}`}>
                          {item.label}
                        </p>
                        {item.date && (
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(item.date), "d MMM yyyy, HH:mm", { locale: nl })}
                          </p>
                        )}
                      </div>
                      {item.date && (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Quick Actions */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Acties</h3>
              <div className="flex gap-2">
                {placement.status === "draft" && (
                  <Button onClick={() => handleStatusChange("active")}>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Activeer Plaatsing
                  </Button>
                )}
                {placement.status === "active" && (
                  <Button variant="outline" onClick={() => handleStatusChange("completed")}>
                    <Calendar className="h-4 w-4 mr-2" />
                    Rond Af
                  </Button>
                )}
                <Button variant="ghost">
                  <Briefcase className="h-4 w-4 mr-2" />
                  Bekijk Taken
                </Button>
              </div>
            </div>

            {/* Metadata */}
            <div className="text-sm text-muted-foreground flex items-center gap-4">
              <div>
                <span className="font-medium">Aangemaakt:</span>{" "}
                {format(new Date(placement.created_at), "d MMM yyyy, HH:mm", { locale: nl })}
              </div>
              <div>
                <span className="font-medium">Laatst bijgewerkt:</span>{" "}
                {format(new Date(placement.updated_at), "d MMM yyyy, HH:mm", { locale: nl })}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Completion Confirmation Dialog with Evaluation */}
      <AlertDialog open={completionDialogOpen} onOpenChange={setCompletionDialogOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Plaatsing Afronden & Evalueren
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-5">
                <p>
                  Rond de plaatsing van{" "}
                  <span className="font-semibold text-foreground">
                    {placement.professionals?.full_name}
                  </span>{" "}
                  bij{" "}
                  <span className="font-semibold text-foreground">
                    {sublocation?.naam}
                  </span>{" "}
                  af met een evaluatie.
                </p>
                
                {/* End Date Selector */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">
                    Einddatum
                  </Label>
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !completionDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {completionDate ? format(completionDate, "d MMMM yyyy", { locale: nl }) : "Selecteer datum"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={completionDate}
                        onSelect={(date) => {
                          if (date) {
                            setCompletionDate(date);
                            setDatePickerOpen(false);
                          }
                        }}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <Separator />

                {/* Rating */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Star className="h-4 w-4" />
                    Hoe beoordeel je deze plaatsing? *
                  </Label>
                  <StarRating rating={rating} onRatingChange={setRating} />
                </div>

                {/* Feedback */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">
                    Hoe was de samenwerking?
                  </Label>
                  <Textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Deel je ervaring over deze plaatsing..."
                    className="min-h-[80px] resize-none"
                  />
                </div>

                {/* Would Rehire Toggle */}
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium text-foreground">
                      Zou je deze professional opnieuw plaatsen?
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Helpt bij toekomstige matches
                    </p>
                  </div>
                  <Switch
                    checked={wouldRehire}
                    onCheckedChange={setWouldRehire}
                  />
                </div>

                <div className="bg-muted/50 p-3 rounded-lg text-sm">
                  <p className="text-muted-foreground">
                    Na afronding wordt de professional automatisch weer beschikbaar voor nieuwe plaatsingen 
                    (indien geen andere actieve plaatsingen).
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSavingEvaluation || showSuccessAnimation}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCompletion}
              className={cn(
                "bg-green-600 hover:bg-green-700 transition-all duration-300",
                showSuccessAnimation && "bg-green-500 scale-105"
              )}
              disabled={rating === 0 || isSavingEvaluation || showSuccessAnimation}
            >
              {showSuccessAnimation ? (
                <span className="flex items-center gap-2">
                  <Check className="h-5 w-5 animate-bounce" />
                  Opgeslagen!
                </span>
              ) : isSavingEvaluation ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Opslaan...
                </span>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Bevestig Afronden
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
