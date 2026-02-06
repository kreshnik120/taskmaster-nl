import { useState, useRef, useEffect } from "react";
import { Plus, X, User, Calendar, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface TeamMember {
  id: string;
  name: string;
  email: string;
}

interface QuickSubtaskInputProps {
  onSubmit: (title: string, assigneeId?: string, dueDate?: Date) => Promise<void>;
  onCancel: () => void;
  teamMembers?: TeamMember[];
  className?: string;
}

export function QuickSubtaskInput({
  onSubmit,
  onCancel,
  teamMembers = [],
  className
}: QuickSubtaskInputProps) {
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | undefined>();
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showExtended, setShowExtended] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (!title.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit(title.trim(), assigneeId, dueDate);
      setTitle("");
      setAssigneeId(undefined);
      setDueDate(undefined);
      setShowExtended(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className={cn(
      "flex-1 rounded-xl border border-primary/30 bg-background/80 p-3 space-y-3",
      "animate-in fade-in-0 slide-in-from-top-2 duration-200",
      className
    )}>
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nieuwe processtap..."
          className="flex-1 h-9 text-sm border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
          disabled={isSubmitting}
        />
      </div>

      {/* Extended options toggle */}
      {!showExtended && (teamMembers.length > 0) && (
        <button
          type="button"
          onClick={() => setShowExtended(true)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <Plus className="h-3 w-3" />
          Toewijzing of deadline toevoegen
        </button>
      )}

      {/* Extended options */}
      {showExtended && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-border/50">
          {/* Assignee selector */}
          {teamMembers.length > 0 && (
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger className="w-auto h-8 text-xs gap-1.5 border-dashed">
                <User className="h-3 w-3" />
                <SelectValue placeholder="Toewijzen" />
              </SelectTrigger>
              <SelectContent>
                {teamMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id} className="text-xs">
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Due date picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                size="sm"
                className={cn(
                  "h-8 text-xs gap-1.5 border-dashed",
                  dueDate && "text-primary border-primary/50"
                )}
              >
                <Calendar className="h-3 w-3" />
                {dueDate ? format(dueDate, "d MMM", { locale: nl }) : "Deadline"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={dueDate}
                onSelect={setDueDate}
                initialFocus
                locale={nl}
              />
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isSubmitting}
          className="h-7 px-2 text-xs"
        >
          <X className="h-3 w-3 mr-1" />
          Annuleren
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSubmit}
          disabled={!title.trim() || isSubmitting}
          className="h-7 px-3 text-xs"
        >
          {isSubmitting ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Plus className="h-3 w-3 mr-1" />
          )}
          Toevoegen
        </Button>
      </div>
    </div>
  );
}
