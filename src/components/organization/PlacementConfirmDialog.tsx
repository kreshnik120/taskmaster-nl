import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import confetti from "canvas-confetti";

interface PlacementConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  professionalId: string;
  professionalName: string;
  sublocationId: string;
  sublocationName: string;
  matchScore: number;
  onSuccess: () => void;
}

export function PlacementConfirmDialog({
  open,
  onOpenChange,
  professionalId,
  professionalName,
  sublocationId,
  sublocationName,
  matchScore,
  onSuccess,
}: PlacementConfirmDialogProps) {
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [weeklyHours, setWeeklyHours] = useState<number>(32);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!startDate) {
      toast.error("Selecteer een startdatum");
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

      // Create assignment
      const { error } = await supabase
        .from("assignments")
        .insert({
          professional_id: professionalId,
          sublocation_id: sublocationId,
          start_date: format(startDate, "yyyy-MM-dd"),
          weekly_hours: weeklyHours,
          hourly_rate_id: null, // Wordt later bepaald na werkvorm keuze
          status: "active",
          created_by: user.id,
        });

      if (error) throw error;

      // Log event for AI learning
      const { data: userOrgData } = await supabase
        .from("user_organizations")
        .select("org_id")
        .eq("user_id", user.id)
        .single();

      if (userOrgData?.org_id) {
        await supabase.from("system_events").insert({
          entity_type: "assignment",
          entity_id: professionalId,
          event_type: "placement_created",
          event_data: {
            professional_id: professionalId,
            professional_name: professionalName,
            sublocation_id: sublocationId,
            sublocation_name: sublocationName,
            start_date: format(startDate, "yyyy-MM-dd"),
            weekly_hours: weeklyHours,
            match_score: matchScore,
          },
          metadata: {},
          org_id: userOrgData.org_id,
          user_id: user.id,
        });
      }

      // Success feedback
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });

      toast.success("Plaatsing aangemaakt!", {
        description: `${professionalName} gekoppeld aan ${sublocationName}`,
      });

      onSuccess();
      onOpenChange(false);

      // Reset form
      setStartDate(new Date());
      setWeeklyHours(32);
    } catch (error) {
      console.error("Placement error:", error);
      toast.error("Fout bij aanmaken plaatsing");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Plaatsing bevestigen</DialogTitle>
          <DialogDescription>
            Maak een nieuwe plaatsing voor {professionalName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Professional info */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium">{professionalName}</p>
              <p className="text-sm text-muted-foreground">{sublocationName}</p>
            </div>
            <Badge variant="default" className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {matchScore}% match
            </Badge>
          </div>

          {/* Start date */}
          <div className="space-y-2">
            <Label htmlFor="startDate">Startdatum *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "PPP", { locale: nl }) : "Selecteer datum"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => date && setStartDate(date)}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

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

          <p className="text-xs text-muted-foreground italic">
            💡 Uurtarief wordt bepaald na vaststellen werkvorm (ZZP/Uitzendkracht/ABCito)
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Annuleer
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Bezig..." : "Bevestig plaatsing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
