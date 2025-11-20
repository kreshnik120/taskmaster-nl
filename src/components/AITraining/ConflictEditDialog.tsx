import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AlertTriangle, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ConflictEditDialogProps {
  conflict: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const ConflictEditDialog = ({ 
  conflict, 
  open, 
  onOpenChange,
  onSuccess 
}: ConflictEditDialogProps) => {
  const [editedValue, setEditedValue] = useState(
    JSON.stringify(conflict?.conflicting_suggestion || {}, null, 2)
  );
  const [isValid, setIsValid] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const validateJSON = (value: string) => {
    try {
      JSON.parse(value);
      setIsValid(true);
      return true;
    } catch (e) {
      setIsValid(false);
      return false;
    }
  };

  const handleValueChange = (value: string) => {
    setEditedValue(value);
    validateJSON(value);
  };

  const handleSave = async () => {
    if (!validateJSON(editedValue)) {
      toast.error('Ongeldige JSON structuur');
      return;
    }

    setIsSaving(true);
    try {
      const parsedValue = JSON.parse(editedValue);
      
      // Roep de edge function aan om de bewerkte waarde op te slaan
      const { data, error } = await supabase.functions.invoke('update-knowledge-from-conflict', {
        body: {
          conflict_id: conflict.id,
          edited_value: parsedValue,
          resolution_action: 'edited'
        }
      });

      if (error) throw error;

      toast.success('Conflict opgelost met aangepaste waarde');
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving edited conflict:', error);
      toast.error('Kon bewerkte waarde niet opslaan');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conflict Data Bewerken</DialogTitle>
          <DialogDescription>
            Pas de voorgestelde waarde aan voordat je het conflict accepteert. 
            Let op: de JSON structuur moet geldig blijven.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">
              Bewerk Voorgestelde Waarde
            </label>
            <Textarea
              value={editedValue}
              onChange={(e) => handleValueChange(e.target.value)}
              className="font-mono text-sm min-h-[400px]"
              placeholder='{"key": "value"}'
            />
            {!isValid && (
              <div className="flex items-center gap-2 mt-2 text-destructive text-sm">
                <AlertTriangle className="h-4 w-4" />
                <span>Ongeldige JSON structuur - controleer haakjes en komma's</span>
              </div>
            )}
          </div>

          <div className="bg-muted p-4 rounded-lg space-y-2">
            <p className="text-sm font-medium">Tips voor bewerken:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Verwijder foute velden door de hele regel te verwijderen</li>
              <li>• Pas waarden aan door tekst tussen de aanhalingstekens te wijzigen</li>
              <li>• Vergeet niet komma's tussen velden (maar niet na het laatste veld)</li>
              <li>• Test je JSON structuur voordat je opslaat</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!isValid || isSaving}
          >
            <Check className="h-4 w-4 mr-2" />
            {isSaving ? 'Opslaan...' : 'Opslaan & Accepteren'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
