import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUpdateContactName } from "@/hooks/whatsapp/useUpdateContactName";

interface ContactForRename {
  id: string;
  display_name: string | null;
  push_name: string | null;
  phone_number: string;
}

interface WhatsAppRenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: ContactForRename | null;
}

export function WhatsAppRenameDialog({ open, onOpenChange, contact }: WhatsAppRenameDialogProps) {
  const [name, setName] = useState('');
  const updateName = useUpdateContactName();
  
  useEffect(() => {
    if (open && contact) {
      setName(contact.display_name || contact.push_name || contact.phone_number);
    }
  }, [open, contact]);
  
  const handleSave = () => {
    if (contact && name.trim()) {
      updateName.mutate({ contactId: contact.id, displayName: name.trim() });
      onOpenChange(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contact hernoemen</DialogTitle>
          <DialogDescription>
            Geef dit contact een aangepaste naam.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Naam"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            Opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
