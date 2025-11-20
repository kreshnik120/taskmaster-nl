import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertTriangle, Edit2, Check, X } from "lucide-react";
import { useState } from "react";

interface ConflictDiffViewProps {
  existingValue: any;
  suggestedValue: any;
  existingMetadata?: {
    source_type?: string;
    stability_score?: number;
  };
  reason?: string;
  onFieldEdit?: (fieldName: string, newValue: any) => void;
  editedFields?: Record<string, any>;
}

export const ConflictDiffView = ({ 
  existingValue, 
  suggestedValue, 
  existingMetadata,
  reason,
  onFieldEdit,
  editedFields = {}
}: ConflictDiffViewProps) => {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState<string>("");
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
  
  const handleStartEdit = (key: string, value: any) => {
    setEditingField(key);
    setTempValue(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value || ''));
  };

  const handleSaveEdit = (key: string) => {
    if (!onFieldEdit) return;
    
    try {
      let parsedValue = tempValue;
      // Try to parse as JSON if it looks like JSON
      if (tempValue.trim().startsWith('{') || tempValue.trim().startsWith('[')) {
        parsedValue = JSON.parse(tempValue);
      }
      onFieldEdit(key, parsedValue);
      setEditingField(null);
    } catch (e) {
      // If JSON parsing fails, save as string
      onFieldEdit(key, tempValue);
      setEditingField(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setTempValue("");
  };

  const getDisplayValue = (key: string, originalValue: any) => {
    if (editedFields[key] !== undefined) {
      return editedFields[key];
    }
    return originalValue;
  };
  
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
            {Object.keys(editedFields).length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {Object.keys(editedFields).length} veld(en) aangepast
              </Badge>
            )}
          </div>
          
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 space-y-2">
            {Object.entries(fieldDiffs).map(([key, diff]) => {
              const displayValue = getDisplayValue(key, diff.new);
              const isEditing = editingField === key;
              const isEdited = editedFields[key] !== undefined;
              
              return (
                <div key={`new-${key}`} className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    {key}:
                    {diff.isDifferent && !isEdited && (
                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                    )}
                    {isEdited && (
                      <Badge variant="default" className="text-xs ml-1">Aangepast</Badge>
                    )}
                  </div>
                  
                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={tempValue}
                        onChange={(e) => setTempValue(e.target.value)}
                        className="w-full min-h-[80px] p-2 text-sm border rounded-md bg-background"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleSaveEdit(key)}
                          className="h-7 text-xs"
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Opslaan
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCancelEdit}
                          className="h-7 text-xs"
                        >
                          <X className="h-3 w-3 mr-1" />
                          Annuleer
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className={`text-sm p-2 rounded relative group ${
                      isEdited
                        ? 'bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700'
                        : diff.isDifferent 
                          ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700' 
                          : 'bg-background'
                    }`}>
                      {displayValue !== undefined ? (
                        typeof displayValue === 'object' 
                          ? <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(displayValue, null, 2)}</pre>
                          : <span>{String(displayValue)}</span>
                      ) : (
                        <span className="text-muted-foreground italic">niet ingesteld</span>
                      )}
                      
                      {onFieldEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleStartEdit(key, displayValue)}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
