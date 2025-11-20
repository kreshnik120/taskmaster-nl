import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AlertTriangle, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cleanupDuplicateFields } from "@/lib/deepMerge";

interface KnowledgeEditDialogProps {
  knowledgeItem: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const KnowledgeEditDialog = ({ 
  knowledgeItem, 
  open, 
  onOpenChange,
  onSuccess 
}: KnowledgeEditDialogProps) => {
  const [editedValue, setEditedValue] = useState("");
  const [isValid, setIsValid] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Update edited value when knowledge item changes
  useEffect(() => {
    if (knowledgeItem?.value) {
      setEditedValue(JSON.stringify(knowledgeItem.value, null, 2));
      setIsValid(true);
    }
  }, [knowledgeItem]);

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
      
      // Cleanup duplicate fields before saving
      const cleaned = cleanupDuplicateFields({ value: parsedValue });
      const finalValue = cleaned.value || parsedValue;
      
      // Update the knowledge base directly
      const { error } = await supabase
        .from('ai_knowledge_base')
        .update({ 
          value: finalValue,
          updated_at: new Date().toISOString()
        })
        .eq('id', knowledgeItem.id);

      if (error) throw error;

      toast.success('Kennis item succesvol bijgewerkt');
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving knowledge item:', error);
      toast.error('Kon kennis item niet opslaan');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kennis Item Bewerken</DialogTitle>
          <DialogDescription>
            Pas de waarde van het kennis item aan. Let op: de JSON structuur moet geldig blijven.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted p-3 rounded-lg space-y-1">
            <p className="text-sm font-medium">Kennis Item Details</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p><span className="font-medium">Key:</span> {knowledgeItem?.key}</p>
              <p><span className="font-medium">Category:</span> {knowledgeItem?.category}</p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">
              Bewerk Waarde (JSON)
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
              <li>• Duplicate velden worden automatisch opgeschoond bij opslaan</li>
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
            {isSaving ? 'Opslaan...' : 'Opslaan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
