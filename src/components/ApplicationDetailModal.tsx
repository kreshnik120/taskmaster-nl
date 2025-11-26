import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Mail, User, FileText, Calendar, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";

interface Application {
  id: string;
  email_from: string;
  email_subject: string | null;
  email_body: string | null;
  pipeline_stage: string;
  status: string;
  completeness_score: number | null;
  missing_info: any;
  extracted_data: any;
  professional_id: string | null;
  cv_file_name: string | null;
  created_at: string;
  updated_at: string | null;
  professionals?: {
    full_name: string;
    functie_niveau: string;
  } | null;
}

interface ApplicationDetailModalProps {
  application: Application;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplicationUpdated: () => void;
}

export function ApplicationDetailModal({
  application,
  open,
  onOpenChange,
  onApplicationUpdated,
}: ApplicationDetailModalProps) {
  const [updating, setUpdating] = useState(false);

  const handleStageChange = async (newStage: string) => {
    setUpdating(true);
    try {
      const { error } = await supabase
        .from("professional_applications")
        .update({ 
          pipeline_stage: newStage,
          updated_at: new Date().toISOString()
        })
        .eq("id", application.id);

      if (error) throw error;

      toast.success("Pipeline fase bijgewerkt");
      onApplicationUpdated();
    } catch (error) {
      console.error("Error updating stage:", error);
      toast.error("Fout bij bijwerken van fase");
    } finally {
      setUpdating(false);
    }
  };

  const getStageLabel = (stage: string) => {
    const labels: Record<string, string> = {
      nieuw: "Nieuw",
      screening: "Screening",
      interview: "Interview",
      goedgekeurd: "Goedgekeurd",
      geplaatst: "Geplaatst",
    };
    return labels[stage] || stage;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      nieuw: "Nieuw",
      in_behandeling: "In behandeling",
      wacht_op_info: "Wacht op info",
      compleet: "Compleet",
      afgerond: "Afgerond",
    };
    return labels[status] || status;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Mail className="h-5 w-5" />
            Sollicitatie Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Header Info */}
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <p className="text-lg font-semibold">{application.email_from}</p>
                {application.email_subject && (
                  <p className="text-sm text-muted-foreground">{application.email_subject}</p>
                )}
              </div>
              <Badge variant="outline" className="shrink-0">
                {getStatusLabel(application.status)}
              </Badge>
            </div>

            {/* Professional Link */}
            {application.professionals && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{application.professionals.full_name}</p>
                  <p className="text-xs text-muted-foreground">{application.professionals.functie_niveau}</p>
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                <span>Aangemaakt: {format(new Date(application.created_at), "d MMM yyyy HH:mm", { locale: nl })}</span>
              </div>
              {application.updated_at && (
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Bijgewerkt: {format(new Date(application.updated_at), "d MMM yyyy HH:mm", { locale: nl })}</span>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Completeness Score */}
          {application.completeness_score !== null && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Compleetheid</span>
                <span className="text-sm font-semibold">{application.completeness_score}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    application.completeness_score >= 80
                      ? "bg-green-500"
                      : application.completeness_score >= 50
                      ? "bg-yellow-500"
                      : "bg-red-500"
                  }`}
                  style={{ width: `${application.completeness_score}%` }}
                />
              </div>
            </div>
          )}

          {/* Missing Info */}
          {application.missing_info && Array.isArray(application.missing_info) && application.missing_info.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span>Ontbrekende informatie</span>
              </div>
              <ul className="space-y-1 pl-6">
                {application.missing_info.map((item: string, index: number) => (
                  <li key={index} className="text-sm text-muted-foreground list-disc">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Extracted Data */}
          {application.extracted_data && Object.keys(application.extracted_data).length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>Geëxtraheerde gegevens</span>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 space-y-2 text-sm">
                {Object.entries(application.extracted_data).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}:</span>
                    <span className="font-medium">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CV File */}
          {application.cv_file_name && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{application.cv_file_name}</span>
            </div>
          )}

          {/* Email Body */}
          {application.email_body && (
            <div className="space-y-2">
              <span className="text-sm font-medium">E-mail inhoud</span>
              <div className="p-3 rounded-lg bg-muted/50 text-sm whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                {application.email_body}
              </div>
            </div>
          )}

          <Separator />

          {/* Pipeline Stage Actions */}
          <div className="space-y-3">
            <span className="text-sm font-medium">Verplaats naar:</span>
            <div className="flex flex-wrap gap-2">
              {["nieuw", "screening", "interview", "goedgekeurd", "geplaatst"].map((stage) => (
                <Button
                  key={stage}
                  variant={application.pipeline_stage === stage ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleStageChange(stage)}
                  disabled={updating || application.pipeline_stage === stage}
                >
                  {getStageLabel(stage)}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
