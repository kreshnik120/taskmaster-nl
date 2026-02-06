import { useState, useEffect, useRef, useCallback } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface InlineDescriptionEditorProps {
  taskId: string;
  description: string | null;
  onSaved: () => void;
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
    if (!hasChanges || isSaving) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ description: value.trim() || null })
        .eq('id', taskId);

      if (error) throw error;

      toast({
        title: "Beschrijving opgeslagen",
        description: "De wijziging is vastgelegd in het verloop"
      });

      onSaved();
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
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-muted/50 border border-border/50 font-mono text-[10px]">
              Ctrl+Enter
            </kbd>
            <span>Opslaan</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-muted/50 border border-border/50 font-mono text-[10px]">
              Esc
            </kbd>
            <span>Annuleren</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {hasChanges && !isSaving && (
            <span className="text-amber-600 dark:text-amber-400">
              Niet-opgeslagen wijzigingen
            </span>
          )}
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              hasChanges && !isSaving
                ? "bg-primary/10 text-primary hover:bg-primary/20"
                : "text-muted-foreground/50 cursor-not-allowed"
            )}
          >
            <Check className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
