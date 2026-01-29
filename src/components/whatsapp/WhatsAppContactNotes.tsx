import { useState, useEffect, useRef } from "react";
import { FileText, Loader2, Check } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateContactNotes } from "@/hooks/whatsapp/useUpdateContactNotes";

interface WhatsAppContactNotesProps {
  contactId: string;
  notes: string | null;
  editable?: boolean;
}

export function WhatsAppContactNotes({ contactId, notes, editable = false }: WhatsAppContactNotesProps) {
  const [value, setValue] = useState(notes || '');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const updateNotes = useUpdateContactNotes();
  const initialValueRef = useRef(notes || '');
  
  // Sync local state when contact changes
  useEffect(() => {
    setValue(notes || '');
    initialValueRef.current = notes || '';
    setSaveStatus('idle');
  }, [contactId, notes]);
  
  // Debounced save
  useEffect(() => {
    if (!editable) return;
    
    // Don't save if value hasn't changed from initial
    if (value === initialValueRef.current) {
      return;
    }
    
    setSaveStatus('saving');
    
    const timer = setTimeout(() => {
      const trimmedValue = value.trim();
      updateNotes.mutate(
        { contactId, notes: trimmedValue || null },
        {
          onSuccess: () => {
            setSaveStatus('saved');
            initialValueRef.current = trimmedValue;
          },
          onError: () => setSaveStatus('idle'),
        }
      );
    }, 1000); // 1 second debounce
    
    return () => clearTimeout(timer);
  }, [value, contactId, editable, updateNotes]);
  
  // Reset "saved" indicator after 2 seconds
  useEffect(() => {
    if (saveStatus === 'saved') {
      const timer = setTimeout(() => setSaveStatus('idle'), 2000);
      return () => clearTimeout(timer);
    }
  }, [saveStatus]);
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <FileText className="h-3.5 w-3.5" />
          Notities
        </h4>
        {saveStatus !== 'idle' && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            {saveStatus === 'saving' && (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Opslaan...
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <Check className="h-3 w-3 text-green-500" />
                Opgeslagen
              </>
            )}
          </span>
        )}
      </div>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Voeg notities toe over dit contact..."
        className="min-h-[100px] resize-none"
        disabled={!editable}
      />
    </div>
  );
}
