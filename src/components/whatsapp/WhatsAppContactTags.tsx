import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { WHATSAPP_TAGS, getTagConfig } from "@/lib/whatsapp-tags";
import { useUpdateContactTags } from "@/hooks/whatsapp/useUpdateContactTags";

interface WhatsAppContactTagsProps {
  contactId: string;
  tags: string[];
  editable?: boolean;
}

export function WhatsAppContactTags({ contactId, tags, editable = false }: WhatsAppContactTagsProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<string | null>(null);
  
  const updateTags = useUpdateContactTags();
  
  const availableTags = WHATSAPP_TAGS.filter(t => !tags.includes(t.id));
  
  const handleAddTag = (tagId: string) => {
    updateTags.mutate({ 
      contactId, 
      tags: [...tags, tagId] 
    });
    setPopoverOpen(false);
  };
  
  const handleRemoveTag = (tagId: string) => {
    setTagToDelete(tagId);
    setDeleteDialogOpen(true);
  };
  
  const confirmRemoveTag = () => {
    if (tagToDelete) {
      updateTags.mutate({ 
        contactId, 
        tags: tags.filter(t => t !== tagToDelete) 
      });
    }
    setDeleteDialogOpen(false);
    setTagToDelete(null);
  };

  // Get label for tag to delete for better UX
  const tagToDeleteLabel = tagToDelete ? getTagConfig(tagToDelete)?.label : '';
  
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {tags.length === 0 && !editable && (
        <span className="text-sm text-muted-foreground italic">Geen labels</span>
      )}
      
      {tags.map(tagId => {
        const config = getTagConfig(tagId);
        if (!config) return null;
        return (
          <Badge
            key={tagId}
            className={cn(
              config.color.bg, 
              config.color.text, 
              config.color.border, 
              "border font-normal"
            )}
          >
            {config.label}
            {editable && (
              <button 
                onClick={() => handleRemoveTag(tagId)} 
                className="ml-1 hover:opacity-70 transition-opacity"
                aria-label={`Verwijder label ${config.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        );
      })}
      
      {editable && availableTags.length > 0 && (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 text-xs">
              <Plus className="h-3 w-3 mr-1" />
              Label
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Voeg label toe
            </p>
            <div className="space-y-1">
              {availableTags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => handleAddTag(tag.id)}
                  className="w-full flex items-center gap-2 p-1.5 rounded hover:bg-muted text-sm text-left transition-colors"
                >
                  <div className={cn("w-3 h-3 rounded-full", tag.color.bg, tag.color.border, "border")} />
                  {tag.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
      
      {/* Confirm delete dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Label verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je het label "{tagToDeleteLabel}" wilt verwijderen van dit contact?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoveTag}>
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
