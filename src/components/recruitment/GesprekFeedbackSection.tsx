import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface GesprekFeedbackSectionProps {
  applicationId: string;
  orgId: string;
  pipelineStage: string;
  gesprekDatum: string | null;
  gesprekFeedback: string | null;
  candidateName: string;
  candidateEmail: string;
  onUpdated: () => void;
}

export function GesprekFeedbackSection({
  applicationId,
  orgId,
  pipelineStage,
  gesprekDatum,
  gesprekFeedback,
  candidateName,
  candidateEmail,
  onUpdated,
}: GesprekFeedbackSectionProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    gesprekDatum ? new Date(gesprekDatum) : undefined
  );
  const [saving, setSaving] = useState(false);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [pendingFeedback, setPendingFeedback] = useState<"positive" | "negative" | "no_show" | null>(null);

  // Show this section only for intake_verstuurd (when docs complete) or gesprek_gepland stages
  // docs_compleet stage is removed - we now use intake_verstuurd with document check
  const showSection = ["intake_verstuurd", "gesprek_gepland"].includes(pipelineStage);
  if (!showSection) return null;

  const handleScheduleInterview = async () => {
    if (!selectedDate) {
      toast.error("Selecteer eerst een gespreksdatum");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("professional_applications")
        .update({
          gesprek_datum: selectedDate.toISOString(),
          pipeline_stage: "gesprek_gepland",
          gesprek_feedback: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", applicationId);

      if (error) throw error;

      toast.success("Gesprek ingepland", {
        description: `Gesprek met ${candidateName} gepland voor ${format(selectedDate, "d MMMM yyyy", { locale: nl })}`,
      });

      onUpdated();
    } catch (error) {
      console.error("Error scheduling interview:", error);
      toast.error("Kon gesprek niet inplannen");
    } finally {
      setSaving(false);
    }
  };

  const handleFeedbackClick = (feedback: "positive" | "negative" | "no_show") => {
    setPendingFeedback(feedback);
    setFeedbackDialogOpen(true);
  };

  const handleConfirmFeedback = async () => {
    if (!pendingFeedback) return;

    setSaving(true);
    try {
      if (pendingFeedback === "positive") {
        // Positive feedback → Move to screening + trigger VOG request
        const { error: updateError } = await supabase
          .from("professional_applications")
          .update({
            gesprek_feedback: "positive",
            pipeline_stage: "screening",
            updated_at: new Date().toISOString(),
          })
          .eq("id", applicationId);

        if (updateError) throw updateError;

        // Create VOG request goal
        const { error: goalError } = await supabase.from("agent_goals").insert({
          org_id: orgId,
          goal_type: "request_vog",
          goal_description: `Vraag nieuwe VOG aan voor ${candidateName} na positief gesprek`,
          status: "pending",
          priority: 1,
          input_data: {
            application_id: applicationId,
            candidate_email: candidateEmail,
            candidate_name: candidateName,
            trigger: "positive_interview_feedback",
          },
        });

        if (goalError) {
          console.error("Error creating VOG goal:", goalError);
          // Don't throw - the stage update succeeded
        }

        // Trigger goal execution
        await supabase.functions.invoke("ai-agent-orchestrator", {
          body: { action: "process_pending_goals" },
        });

        toast.success("Positieve feedback opgeslagen", {
          description: "Kandidaat verplaatst naar Screening. VOG aanvraag wordt gestart.",
        });
      } else if (pendingFeedback === "negative") {
        // Negative feedback → Stay in gesprek_gepland, add to review queue
        const { error: updateError } = await supabase
          .from("professional_applications")
          .update({
            gesprek_feedback: "negative",
            pending_human_review: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", applicationId);

        if (updateError) throw updateError;

        // Add to human review queue for final decision
        const { error: queueError } = await supabase.from("human_review_queue").insert([{
          application_id: applicationId,
          org_id: orgId,
          review_type: "negative_interview",
          status: "pending",
          priority: 1,
          escalation_reason: `Negatieve gespreksfeedback voor ${candidateName}`,
        }]);

        if (queueError) {
          console.error("Error adding to review queue:", queueError);
        }

        toast.warning("Negatieve feedback opgeslagen", {
          description: "Kandidaat gemarkeerd voor review door recruiter.",
        });
      } else if (pendingFeedback === "no_show") {
        // No show → Transition back to intake_verstuurd for rescheduling
        // As per docs/AGENT_WORKFLOW_PER_STAGE.md section "No-Show"
        const { error } = await supabase
          .from("professional_applications")
          .update({
            gesprek_feedback: "no_show",
            gesprek_datum: null, // Clear date to allow reschedule
            pipeline_stage: "intake_verstuurd", // Reset to intake for re-planning
            updated_at: new Date().toISOString(),
          })
          .eq("id", applicationId);

        if (error) throw error;

        toast.info("No-show geregistreerd", {
          description: "Kandidaat is niet verschenen. Terug naar intake voor herplanning.",
        });
      }

      setFeedbackDialogOpen(false);
      setPendingFeedback(null);
      onUpdated();
    } catch (error) {
      console.error("Error saving feedback:", error);
      toast.error("Kon feedback niet opslaan");
    } finally {
      setSaving(false);
    }
  };

  const getFeedbackLabel = (feedback: string | null) => {
    switch (feedback) {
      case "positive":
        return { label: "Positief", variant: "default" as const, icon: CheckCircle2, className: "bg-green-100 text-green-700 border-green-300" };
      case "negative":
        return { label: "Negatief", variant: "destructive" as const, icon: XCircle, className: "bg-red-100 text-red-700 border-red-300" };
      case "no_show":
        return { label: "Niet verschenen", variant: "secondary" as const, icon: AlertTriangle, className: "bg-amber-100 text-amber-700 border-amber-300" };
      case "pending":
        return { label: "Wacht op gesprek", variant: "outline" as const, icon: Clock, className: "" };
      default:
        return null;
    }
  };

  const feedbackInfo = getFeedbackLabel(gesprekFeedback);

  return (
    <div className="rounded-lg border p-4 space-y-4 bg-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          Interview Planning
        </h3>
        {feedbackInfo && (
          <Badge variant={feedbackInfo.variant} className={feedbackInfo.className}>
            <feedbackInfo.icon className="h-3 w-3 mr-1" />
            {feedbackInfo.label}
          </Badge>
        )}
      </div>

      {/* Stage: intake_verstuurd → Schedule interview (when documents are complete) */}
      {pipelineStage === "intake_verstuurd" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Documenten zijn binnen. Plan nu een gesprek met de kandidaat.
          </p>
          <div className="flex items-center gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[200px] justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate
                    ? format(selectedDate, "d MMMM yyyy", { locale: nl })
                    : "Kies datum"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => date < new Date()}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                  locale={nl}
                />
              </PopoverContent>
            </Popover>
            <Button
              onClick={handleScheduleInterview}
              disabled={!selectedDate || saving}
            >
              {saving ? "Opslaan..." : "Gesprek Inplannen"}
            </Button>
          </div>
        </div>
      )}

      {/* Stage: gesprek_gepland → Show date + feedback buttons */}
      {pipelineStage === "gesprek_gepland" && (
        <div className="space-y-4">
          {gesprekDatum && (
            <div className="flex items-center gap-2 text-sm">
              <CalendarIcon className="h-4 w-4 text-primary" />
              <span className="font-medium">Gesprek gepland:</span>
              <span>{format(new Date(gesprekDatum), "EEEE d MMMM yyyy", { locale: nl })}</span>
            </div>
          )}

          {/* No-show: allow reschedule */}
          {gesprekFeedback === "no_show" && (
            <div className="space-y-3">
              <p className="text-sm text-amber-600">
                Kandidaat is niet verschenen. Plan een nieuw gesprek in.
              </p>
              <div className="flex items-center gap-3">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[200px] justify-start text-left font-normal",
                        !selectedDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate
                        ? format(selectedDate, "d MMMM yyyy", { locale: nl })
                        : "Nieuwe datum"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      disabled={(date) => date < new Date()}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                      locale={nl}
                    />
                  </PopoverContent>
                </Popover>
                <Button
                  onClick={handleScheduleInterview}
                  disabled={!selectedDate || saving}
                >
                  {saving ? "Opslaan..." : "Opnieuw Inplannen"}
                </Button>
              </div>
            </div>
          )}

          {/* Pending: show feedback buttons */}
          {gesprekFeedback === "pending" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Geef feedback na het gesprek:
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="border-green-300 text-green-700 hover:bg-green-50"
                  onClick={() => handleFeedbackClick("positive")}
                  disabled={saving}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Positief
                </Button>
                <Button
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50"
                  onClick={() => handleFeedbackClick("negative")}
                  disabled={saving}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Negatief
                </Button>
                <Button
                  variant="outline"
                  className="border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={() => handleFeedbackClick("no_show")}
                  disabled={saving}
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Niet Verschenen
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Feedback Confirmation Dialog */}
      <AlertDialog open={feedbackDialogOpen} onOpenChange={setFeedbackDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingFeedback === "positive" && "Positieve Feedback Bevestigen"}
              {pendingFeedback === "negative" && "Negatieve Feedback Bevestigen"}
              {pendingFeedback === "no_show" && "No-show Registreren"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingFeedback === "positive" && (
                <>
                  <span className="block mb-2">
                    Je staat op het punt om positieve feedback te geven voor {candidateName}.
                  </span>
                  <span className="block text-green-600 font-medium">
                    Dit zal:
                  </span>
                  <ul className="list-disc list-inside mt-1 space-y-1 text-sm">
                    <li>Kandidaat verplaatsen naar de Screening fase</li>
                    <li>Automatisch een nieuwe VOG aanvraag starten</li>
                  </ul>
                </>
              )}
              {pendingFeedback === "negative" && (
                <>
                  <span className="block mb-2">
                    Je staat op het punt om negatieve feedback te geven voor {candidateName}.
                  </span>
                  <span className="block text-amber-600 font-medium">
                    Dit zal:
                  </span>
                  <ul className="list-disc list-inside mt-1 space-y-1 text-sm">
                    <li>Kandidaat markeren voor review</li>
                    <li>Afwijzing vereist nog handmatige goedkeuring</li>
                  </ul>
                </>
              )}
              {pendingFeedback === "no_show" && (
                <>
                  <span className="block mb-2">
                    Je staat op het punt om {candidateName} als niet verschenen te markeren.
                  </span>
                  <span className="block text-amber-600 font-medium">
                    Dit zal:
                  </span>
                  <ul className="list-disc list-inside mt-1 space-y-1 text-sm">
                    <li>De huidige gespreksdatum wissen</li>
                    <li>Je kunt een nieuw gesprek inplannen</li>
                  </ul>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmFeedback}
              disabled={saving}
              className={cn(
                pendingFeedback === "positive" && "bg-green-600 hover:bg-green-700",
                pendingFeedback === "negative" && "bg-red-600 hover:bg-red-700",
                pendingFeedback === "no_show" && "bg-amber-600 hover:bg-amber-700"
              )}
            >
              {saving ? "Verwerken..." : "Bevestigen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
