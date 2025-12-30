import { useState } from 'react';
import { AlertTriangle, User, Briefcase } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { calculateHRCompletenessScore, detectMissingInfoHR } from '@/lib/hrValidation';

interface WerkvormDetectionBannerProps {
  applicationId: string;
  currentWerkvorm: string | null | undefined;
  onWerkvormUpdated: () => void;
}

export function WerkvormDetectionBanner({
  applicationId,
  currentWerkvorm,
  onWerkvormUpdated
}: WerkvormDetectionBannerProps) {
  const [selectedWerkvorm, setSelectedWerkvorm] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Don't show if werkvorm is already set
  if (currentWerkvorm && currentWerkvorm !== '' && currentWerkvorm !== 'Onbekend') {
    return null;
  }

  const handleSaveWerkvorm = async () => {
    if (!selectedWerkvorm) {
      toast.error('Selecteer eerst een werkvorm');
      return;
    }

    setSaving(true);
    try {
      // Update application extracted_data with werkvorm
      const { data: currentApp, error: fetchError } = await supabase
        .from('professional_applications')
        .select('extracted_data')
        .eq('id', applicationId)
        .single();

      if (fetchError) throw fetchError;

      const currentExtracted = (currentApp?.extracted_data as Record<string, unknown>) || {};
      const updatedExtractedData = {
        ...currentExtracted,
        werkvorm: selectedWerkvorm
      };

      // Recalculate missing info and completeness score with new werkvorm
      const newMissingInfo = detectMissingInfoHR(updatedExtractedData);
      const newScore = calculateHRCompletenessScore(updatedExtractedData);

      const { error: updateError } = await supabase
        .from('professional_applications')
        .update({ 
          extracted_data: updatedExtractedData as any,
          missing_info: newMissingInfo,
          completeness_score: Math.max(0, Math.min(100, newScore))
        })
        .eq('id', applicationId);

      if (updateError) throw updateError;

      toast.success(`Werkvorm ingesteld op ${selectedWerkvorm} (${newScore}% compleet)`);
      onWerkvormUpdated();
    } catch (error) {
      console.error('Error saving werkvorm:', error);
      toast.error('Fout bij opslaan werkvorm');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Alert variant="destructive" className="mb-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30">
      <AlertTriangle className="h-5 w-5 text-amber-600" />
      <AlertTitle className="text-amber-800 dark:text-amber-400 font-semibold">
        Werkvorm onbekend
      </AlertTitle>
      <AlertDescription className="text-amber-700 dark:text-amber-300">
        <p className="mb-3">
          Het is niet duidelijk of deze sollicitant een ZZP'er of uitzendkracht is. 
          Selecteer de juiste werkvorm om de correcte documenten uit te vragen.
        </p>
        <div className="flex items-center gap-3">
          <Select value={selectedWerkvorm} onValueChange={setSelectedWerkvorm}>
            <SelectTrigger className="w-[200px] bg-background">
              <SelectValue placeholder="Selecteer werkvorm..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ZZP">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  <span>ZZP'er (Freelance)</span>
                </div>
              </SelectItem>
              <SelectItem value="Uitzendkracht">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>Uitzendkracht</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <Button 
            onClick={handleSaveWerkvorm} 
            disabled={!selectedWerkvorm || saving}
            size="sm"
          >
            {saving ? 'Opslaan...' : 'Bevestigen'}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
