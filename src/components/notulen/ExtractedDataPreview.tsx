import { ExtractedMeetingData } from "@/hooks/notulen/useAIExtractMeeting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, AlertCircle, Users, ListChecks, Lightbulb, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExtractedDataPreviewProps {
  data: ExtractedMeetingData;
  onApply: () => void;
  onCancel: () => void;
  isApplying?: boolean;
}

function ConfidenceBadge({ score }: { score: number }) {
  const colors = score >= 80 
    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    : score >= 50 
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  
  return (
    <Badge className={cn("text-xs font-normal", colors)}>
      {score}%
    </Badge>
  );
}

function FieldRow({ label, value, confidence }: { 
  label: string; 
  value: string | null; 
  confidence: number 
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{value || '—'}</span>
        <ConfidenceBadge score={confidence} />
      </div>
    </div>
  );
}

export function ExtractedDataPreview({ 
  data, 
  onApply, 
  onCancel,
  isApplying 
}: ExtractedDataPreviewProps) {
  const overallConfidence = data.confidence_scores?.overall || 0;
  
  return (
    <Card className="border-primary/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            AI Extractie Resultaat
          </CardTitle>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            Totaal:
            <ConfidenceBadge score={overallConfidence} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Basic Info */}
        <div className="space-y-1">
          <FieldRow 
            label="Titel" 
            value={data.title} 
            confidence={data.confidence_scores?.title || 0} 
          />
          <FieldRow 
            label="Datum" 
            value={data.meeting_date} 
            confidence={data.confidence_scores?.meeting_date || 0} 
          />
          <FieldRow 
            label="Tijd" 
            value={data.meeting_time} 
            confidence={data.confidence_scores?.meeting_time || 0} 
          />
          <FieldRow 
            label="Locatie" 
            value={data.location} 
            confidence={data.confidence_scores?.location || 0} 
          />
          <FieldRow 
            label="Type" 
            value={data.meeting_type} 
            confidence={data.confidence_scores?.meeting_type || 0} 
          />
        </div>

        {/* Participants */}
        {data.participants.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-3.5 w-3.5" />
              Deelnemers ({data.participants.length})
              <ConfidenceBadge score={data.confidence_scores?.participants || 0} />
            </div>
            <p className="text-xs text-muted-foreground">
              {data.participants.map(p => p.name).join(', ')}
            </p>
          </div>
        )}

        {/* Agenda - toon items */}
        {data.agenda_items.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ListChecks className="h-3.5 w-3.5" />
              Agenda ({data.agenda_items.length} items)
              <ConfidenceBadge score={data.confidence_scores?.agenda_items || 0} />
            </div>
            <ul className="text-xs text-muted-foreground space-y-0.5 pl-5 list-disc">
              {data.agenda_items.slice(0, 3).map((item, i) => (
                <li key={i} className="truncate">{item.item}</li>
              ))}
              {data.agenda_items.length > 3 && (
                <li className="italic">+{data.agenda_items.length - 3} meer...</li>
              )}
            </ul>
          </div>
        )}

        {/* Decisions - toon items */}
        {data.decisions.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-3.5 w-3.5" />
              Beslissingen ({data.decisions.length})
              <ConfidenceBadge score={data.confidence_scores?.decisions || 0} />
            </div>
            <ul className="text-xs text-muted-foreground space-y-0.5 pl-5 list-disc">
              {data.decisions.slice(0, 2).map((d, i) => (
                <li key={i} className="truncate">{d.decision}</li>
              ))}
              {data.decisions.length > 2 && (
                <li className="italic">+{data.decisions.length - 2} meer...</li>
              )}
            </ul>
          </div>
        )}

        {/* Summary */}
        {data.summary && (
          <div className="text-xs text-muted-foreground italic border-l-2 pl-2">
            {data.summary}
          </div>
        )}

        {/* Low confidence warning */}
        {overallConfidence < 50 && (
          <div className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-950/20 rounded text-xs">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <span className="text-amber-700 dark:text-amber-400">
              Lage betrouwbaarheid. Controleer de geëxtraheerde gegevens zorgvuldig.
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onCancel}
            disabled={isApplying}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Negeren
          </Button>
          <Button 
            size="sm" 
            onClick={onApply}
            disabled={isApplying}
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            Toepassen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
