import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle } from "lucide-react";

interface ConflictDiffViewProps {
  existingValue: any;
  suggestedValue: any;
  existingMetadata?: {
    source_type?: string;
    stability_score?: number;
  };
  reason?: string;
}

export const ConflictDiffView = ({ 
  existingValue, 
  suggestedValue, 
  existingMetadata,
  reason 
}: ConflictDiffViewProps) => {
  // Helper to detect which fields differ
  const getFieldDifferences = () => {
    const diffs: Record<string, { old: any; new: any; isDifferent: boolean }> = {};
    
    const existingObj = typeof existingValue === 'object' ? existingValue : { value: existingValue };
    const suggestedObj = typeof suggestedValue === 'object' ? suggestedValue : { value: suggestedValue };
    
    const allKeys = new Set([...Object.keys(existingObj), ...Object.keys(suggestedObj)]);
    
    allKeys.forEach(key => {
      const oldVal = existingObj[key];
      const newVal = suggestedObj[key];
      const isDifferent = JSON.stringify(oldVal) !== JSON.stringify(newVal);
      
      diffs[key] = {
        old: oldVal,
        new: newVal,
        isDifferent
      };
    });
    
    return diffs;
  };

  const fieldDiffs = getFieldDifferences();
  
  return (
    <div className="space-y-3">
      {reason && (
        <div className="bg-muted/50 p-3 rounded-lg border border-border">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <span className="font-medium">Reden: </span>
              <span className="text-muted-foreground">{reason}</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Existing Value Column */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">Huidige Waarde</span>
            {existingMetadata && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-xs">
                  {existingMetadata.source_type}
                </Badge>
                {existingMetadata.stability_score !== undefined && (
                  <span>Stabiliteit: {(existingMetadata.stability_score * 100).toFixed(0)}%</span>
                )}
              </div>
            )}
          </div>
          
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3 space-y-2">
            {Object.entries(fieldDiffs).map(([key, diff]) => (
              <div key={`old-${key}`} className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">{key}:</div>
                <div className={`text-sm p-2 rounded ${
                  diff.isDifferent 
                    ? 'bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700' 
                    : 'bg-background'
                }`}>
                  {diff.old !== undefined ? (
                    typeof diff.old === 'object' 
                      ? <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(diff.old, null, 2)}</pre>
                      : <span>{String(diff.old)}</span>
                  ) : (
                    <span className="text-muted-foreground italic">niet ingesteld</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Suggested Value Column */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">Voorgestelde Waarde</span>
          </div>
          
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 space-y-2">
            {Object.entries(fieldDiffs).map(([key, diff]) => (
              <div key={`new-${key}`} className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  {key}:
                  {diff.isDifferent && (
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                  )}
                </div>
                <div className={`text-sm p-2 rounded ${
                  diff.isDifferent 
                    ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700' 
                    : 'bg-background'
                }`}>
                  {diff.new !== undefined ? (
                    typeof diff.new === 'object' 
                      ? <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(diff.new, null, 2)}</pre>
                      : <span>{String(diff.new)}</span>
                  ) : (
                    <span className="text-muted-foreground italic">niet ingesteld</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
