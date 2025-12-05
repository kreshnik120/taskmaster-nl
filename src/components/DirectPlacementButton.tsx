import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SmartSublocationPicker } from "@/components/SmartSublocationPicker";

interface DirectPlacementButtonProps {
  professionalId: string;
  professionalName: string;
  professionalData?: {
    functie_niveau?: string;
    werkvorm?: string;
    regio?: string;
    postcode?: string;
    beschikbaarheid?: string;
    ervaring_sector?: string[];
    doelgroep_ervaring?: string[];
    heeft_auto?: boolean;
    heeft_rijbewijs?: boolean;
  };
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function DirectPlacementButton({
  professionalId,
  professionalName,
  professionalData,
  variant = "outline",
  size = "sm",
  className
}: DirectPlacementButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPlacing, setIsPlacing] = useState(false);
  const navigate = useNavigate();

  const handleSelectSublocation = async (sublocationId: string, sublocationName: string) => {
    setIsPlacing(true);
    
    try {
      // Create assignment record
      const { data: assignment, error } = await supabase
        .from("assignments")
        .insert({
          professional_id: professionalId,
          sublocation_id: sublocationId,
          status: "active",
          start_date: new Date().toISOString().split('T')[0],
          werkvorm: professionalData?.werkvorm || null,
          weekly_hours: 32
        })
        .select()
        .single();

      if (error) throw error;

      // Log placement event for AI learning
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: userOrg } = await supabase
          .from("user_organizations")
          .select("org_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (userOrg?.org_id) {
          await supabase.from("system_events").insert({
            event_type: "placement_created",
            entity_type: "assignment",
            entity_id: assignment.id,
            org_id: userOrg.org_id,
            user_id: user.id,
            event_data: {
              professional_id: professionalId,
              professional_name: professionalName,
              sublocation_id: sublocationId,
              sublocation_name: sublocationName,
              source: "direct_placement_button"
            }
          });
        }
      }

      setDialogOpen(false);

      // Celebration confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#22c55e', '#16a34a', '#4ade80', '#86efac']
      });

      // Success toast with flow continuity link
      toast.success(`${professionalName} geplaatst bij ${sublocationName}! 🎉`, {
        description: "Plaatsing succesvol aangemaakt",
        action: {
          label: "Bekijk plaatsing",
          onClick: () => navigate("/plaatsingen")
        },
        duration: 8000
      });

    } catch (error: any) {
      console.error("Error creating placement:", error);
      toast.error("Fout bij aanmaken plaatsing", {
        description: error.message || "Probeer het opnieuw"
      });
    } finally {
      setIsPlacing(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={(e) => {
          e.stopPropagation();
          setDialogOpen(true);
        }}
        disabled={isPlacing}
      >
        <UserPlus className="h-4 w-4 mr-1" />
        {isPlacing ? "Plaatsen..." : "Plaatsen"}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>
              {professionalName} plaatsen
            </DialogTitle>
          </DialogHeader>
          <SmartSublocationPicker
            professionalData={professionalData}
            onSelect={handleSelectSublocation}
            onCancel={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
