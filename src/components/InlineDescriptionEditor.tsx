import { useState, useEffect, useRef, useCallback } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface InlineDescriptionEditorProps {
  taskId: string;
  description: string | null;
  onSaved: (newDescription: string) => void;
  onCancel: () => void;
  className?: string;
}

export function InlineDescriptionEditor({
  taskId,
  description,
  onSaved,
  onCancel,
  className
}: InlineDescriptionEditorProps) {
  const [value, setValue] = useState(description || "");
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const originalValueRef = useRef(description || ""); // Track original for proper hasChanges
  const { toast } = useToast();

  // Auto-focus and resize on mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      // Move cursor to end
      textareaRef.current.selectionStart = textareaRef.current.value.length;
      textareaRef.current.selectionEnd = textareaRef.current.value.length;
      adjustHeight();
    }
  }, []);

  // Adjust textarea height based on content
  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, []);

  // Track changes
  useEffect(() => {
    setHasChanges(value !== (description || ""));
  }, [value, description]);

  // Debounced auto-save (2 seconds idle)
  useEffect(() => {
    if (!hasChanges) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      handleSave();
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [value, hasChanges]);

  const handleSave = async () => {
    // FIX 1: Cancel pending auto-save timer to prevent duplicate requests
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    if (!hasChanges || isSaving) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ description: value.trim() || null })
        .eq('id', taskId);

      if (error) throw error;

      const savedValue = value.trim() || "";
      
      // FIX 2: Update original reference and reset hasChanges
      originalValueRef.current = savedValue;
      setHasChanges(false);
      
      toast({
        title: "Beschrijving opgeslagen",
        description: "De wijziging is vastgelegd in het verloop"
      });

      onSaved(savedValue);
    } catch (error) {
      console.error('Error saving description:', error);
      toast({
        title: "Fout bij opslaan",
        description: "Kon beschrijving niet opslaan",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl+Enter or Cmd+Enter = save immediately
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      handleSave();
      return;
    }

    // Escape = cancel
    if (e.key === 'Escape') {
      e.preventDefault();
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      onCancel();
      return;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    adjustHeight();
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Beschrijving toevoegen..."
          className={cn(
            "w-full min-h-[80px] p-3 text-sm rounded-lg resize-none",
            "border border-primary/30 dark:border-primary/20",
            "bg-background/80 dark:bg-slate-900/50",
            "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50",
            "placeholder:text-muted-foreground/60",
            "transition-all duration-200"
          )}
          disabled={isSaving}
        />

        {/* Saving indicator */}
        {isSaving && (
          <div className="absolute top-2 right-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Opslaan...</span>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-end gap-3 text-sm">
        {hasChanges && !isSaving && (
          <span className="text-amber-600 dark:text-amber-400 text-xs mr-auto">
            Niet-opgeslagen wijzigingen
          </span>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="px-3 py-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
        >
          Annuleren
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className={cn(
            "px-3 py-1.5 rounded-md transition-colors font-medium",
            hasChanges && !isSaving
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          Opslaan
        </button>
      </div>
    </div>
  );
}
