import { useState, useRef, useEffect } from "react";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useUpdateContactName } from "@/hooks/whatsapp/useUpdateContactName";

interface WhatsAppContactNameProps {
  contactId: string;
  displayName: string | null;
  pushName: string | null;
  phoneNumber: string;
  editable?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'text-sm',
  md: 'text-base font-medium',
  lg: 'text-lg font-medium',
};

export function WhatsAppContactName({
  contactId,
  displayName,
  pushName,
  phoneNumber,
  editable = false,
  size = 'md',
}: WhatsAppContactNameProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  const updateName = useUpdateContactName();
  
  // Displayed name: displayName || pushName || phoneNumber
  const currentName = displayName || pushName || phoneNumber;
  
  // Show WhatsApp name hint if displayName differs from pushName
  const showPushNameHint = displayName && pushName && displayName !== pushName;
  
  // Show reset option if displayName is set (user changed it)
  const canReset = displayName !== null;
  
  const startEditing = () => {
    if (!editable) return;
    setEditValue(currentName);
    setIsEditing(true);
  };
  
  const saveEdit = () => {
    const trimmedValue = editValue.trim();
    if (trimmedValue && trimmedValue !== currentName) {
      updateName.mutate({ contactId, displayName: trimmedValue });
    }
    setIsEditing(false);
  };
  
  const cancelEdit = () => {
    setIsEditing(false);
  };
  
  const resetToWhatsAppName = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    updateName.mutate({ contactId, displayName: null });
    setIsEditing(false);
  };
  
  // Focus and select text when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };
  
  if (isEditing) {
    return (
      <div className="space-y-1">
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={handleKeyDown}
          className="h-8 text-sm"
          disabled={updateName.isPending}
        />
        {canReset && pushName && (
          <button
            type="button"
            onMouseDown={resetToWhatsAppName}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Reset naar WhatsApp naam
          </button>
        )}
      </div>
    );
  }
  
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5 group">
        <span 
          className={cn(sizeClasses[size], "truncate cursor-default", editable && "cursor-pointer")}
          onClick={editable ? startEditing : undefined}
        >
          {currentName}
        </span>
        {editable && (
          <button
            onClick={startEditing}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
            aria-label="Naam bewerken"
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>
      {showPushNameHint && (
        <p className="text-xs text-muted-foreground">
          (WhatsApp: {pushName})
        </p>
      )}
    </div>
  );
}
