import { useState, useRef, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import { 
  Building2, 
  CreditCard, 
  FileText, 
  Shield, 
  Award,
  Check,
  Upload,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Eye,
  X,
  PartyPopper,
  AlertCircle
} from 'lucide-react';
import { calculateHRCompletenessScore, detectMissingInfoHR } from '@/lib/hrValidation';

// Validation helpers
const isValidKvK = (kvk: string): boolean => {
  const cleaned = kvk.replace(/[\s-]/g, '');
  return /^\d{8}$/.test(cleaned);
};

const isValidDutchIBAN = (iban: string): boolean => {
  const cleaned = iban.replace(/\s/g, '').toUpperCase();
  // Dutch IBAN: NL + 2 digits + 4 letters (bank code) + 10 digits
  return /^NL\d{2}[A-Z]{4}\d{10}$/.test(cleaned);
};

const formatIBAN = (iban: string): string => {
  const cleaned = iban.replace(/\s/g, '').toUpperCase();
  // Add spaces every 4 characters for readability
  return cleaned.match(/.{1,4}/g)?.join(' ') || cleaned;
};

interface ZZPDocumentWizardProps {
  applicationId: string;
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  initialBedrijfsnaam?: string | null;
  initialKvkNummer?: string | null;
  initialIban?: string | null;
  initialExtractedData?: Record<string, unknown>;
}

interface WizardStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  isOptional: boolean;
}

const WIZARD_STEPS: WizardStep[] = [
  {
    id: 'bedrijfsgegevens',
    title: 'Bedrijfsgegevens',
    description: 'Vul je ZZP bedrijfsgegevens in',
    icon: <Building2 className="h-5 w-5" />,
    isOptional: false
  },
  {
    id: 'identiteitsbewijs',
    title: 'Identiteitsbewijs',
    description: 'Upload je ID-kaart of paspoort',
    icon: <CreditCard className="h-5 w-5" />,
    isOptional: false
  },
  {
    id: 'zakelijke_documenten',
    title: 'Zakelijke Documenten',
    description: 'KvK uittreksel en verzekering',
    icon: <FileText className="h-5 w-5" />,
    isOptional: false
  },
  {
    id: 'zorg_compliance',
    title: 'Zorg Compliance',
    description: 'WKKGZ klachtenportaal registratie',
    icon: <Shield className="h-5 w-5" />,
    isOptional: false
  },
  {
    id: 'optionele_certificaten',
    title: 'Optionele Certificaten',
    description: 'BHV, Tillift en andere certificaten',
    icon: <Award className="h-5 w-5" />,
    isOptional: true
  }
];

type DocType = 'identiteitsbewijs' | 'kvk_uittreksel' | 'beroepsaansprakelijkheid' | 'klachtenportaal_wkkgz' | 'bhv_certificaat' | 'tillift_certificaat';

export function ZZPDocumentWizard({
  applicationId,
  isOpen,
  onClose,
  onComplete,
  initialBedrijfsnaam,
  initialKvkNummer,
  initialIban,
  initialExtractedData
}: ZZPDocumentWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  
  // Bedrijfsgegevens state
  const [bedrijfsnaam, setBedrijfsnaam] = useState(initialBedrijfsnaam || '');
  const [kvkNummer, setKvkNummer] = useState(initialKvkNummer || '');
  const [iban, setIban] = useState(initialIban || '');
  
  // Validation error states
  const [kvkError, setKvkError] = useState<string | null>(null);
  const [ibanError, setIbanError] = useState<string | null>(null);
  
  // Document paths state
  const [uploadedDocs, setUploadedDocs] = useState<Record<DocType, string | null>>({
    identiteitsbewijs: (initialExtractedData?.identiteitsbewijs_path as string) || null,
    kvk_uittreksel: (initialExtractedData?.kvk_uittreksel_path as string) || null,
    beroepsaansprakelijkheid: (initialExtractedData?.beroepsaansprakelijkheid_path as string) || null,
    klachtenportaal_wkkgz: (initialExtractedData?.klachtenportaal_wkkgz_path as string) || null,
    bhv_certificaat: (initialExtractedData?.bhv_certificaat_path as string) || null,
    tillift_certificaat: (initialExtractedData?.tillift_certificaat_path as string) || null
  });

  const fileInputRefs = useRef<Record<DocType, HTMLInputElement | null>>({
    identiteitsbewijs: null,
    kvk_uittreksel: null,
    beroepsaansprakelijkheid: null,
    klachtenportaal_wkkgz: null,
    bhv_certificaat: null,
    tillift_certificaat: null
  });

  // Calculate highest completed step for state persistence
  const calculateInitialStep = useMemo(() => {
    // Step 0: Bedrijfsgegevens
    const hasStep0 = !!(initialBedrijfsnaam && initialKvkNummer && initialIban);
    if (!hasStep0) return 0;
    
    // Step 1: Identiteitsbewijs
    const hasStep1 = !!initialExtractedData?.identiteitsbewijs_path;
    if (!hasStep1) return 1;
    
    // Step 2: Zakelijke documenten
    const hasStep2 = !!(initialExtractedData?.kvk_uittreksel_path && initialExtractedData?.beroepsaansprakelijkheid_path);
    if (!hasStep2) return 2;
    
    // Step 3: Zorg compliance
    const hasStep3 = !!initialExtractedData?.klachtenportaal_wkkgz_path;
    if (!hasStep3) return 3;
    
    // All required steps complete, go to optional or stay at last required
    return 4;
  }, [initialBedrijfsnaam, initialKvkNummer, initialIban, initialExtractedData]);

  // Navigate to highest incomplete step when dialog opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(calculateInitialStep);
    }
  }, [isOpen, calculateInitialStep]);

  // Validate KvK on change
  const handleKvkChange = (value: string) => {
    const cleaned = value.replace(/[^\d]/g, '').slice(0, 8);
    setKvkNummer(cleaned);
    
    if (cleaned.length > 0 && cleaned.length !== 8) {
      setKvkError('KvK nummer moet exact 8 cijfers zijn');
    } else if (cleaned.length === 8 && !isValidKvK(cleaned)) {
      setKvkError('Ongeldig KvK nummer');
    } else {
      setKvkError(null);
    }
  };

  // Validate IBAN on change
  const handleIbanChange = (value: string) => {
    const cleaned = value.replace(/\s/g, '').toUpperCase();
    setIban(cleaned);
    
    if (cleaned.length > 0) {
      if (!cleaned.startsWith('NL')) {
        setIbanError('Alleen Nederlandse IBAN\'s (NL) worden geaccepteerd');
      } else if (cleaned.length > 2 && cleaned.length < 18) {
        setIbanError('IBAN moet 18 karakters zijn');
      } else if (cleaned.length === 18 && !isValidDutchIBAN(cleaned)) {
        setIbanError('Ongeldig IBAN formaat (NL00BANK0123456789)');
      } else if (cleaned.length > 18) {
        setIbanError('IBAN is te lang');
      } else {
        setIbanError(null);
      }
    } else {
      setIbanError(null);
    }
  };

  // Check if step is completed (for step indicators)
  const isStepCompleted = (stepIndex: number): boolean => {
    switch (stepIndex) {
      case 0:
        return !!(bedrijfsnaam && kvkNummer && iban && isValidKvK(kvkNummer) && isValidDutchIBAN(iban));
      case 1:
        return !!uploadedDocs.identiteitsbewijs;
      case 2:
        return !!(uploadedDocs.kvk_uittreksel && uploadedDocs.beroepsaansprakelijkheid);
      case 3:
        return !!uploadedDocs.klachtenportaal_wkkgz;
      case 4:
        return true; // Optional step
      default:
        return false;
    }
  };

  const progressPercentage = ((currentStep + 1) / WIZARD_STEPS.length) * 100;

  const handleFileUpload = async (docType: DocType, file: File) => {
    setUploadingDoc(docType);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${applicationId}/${docType}_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('application-documents')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Update local state
      setUploadedDocs(prev => ({ ...prev, [docType]: fileName }));

      // Persist to database immediately
      const { data: currentApp } = await supabase
        .from('professional_applications')
        .select('extracted_data')
        .eq('id', applicationId)
        .single();

      const currentExtracted = (currentApp?.extracted_data as Record<string, unknown>) || {};
      const updatedExtractedData = {
        ...currentExtracted,
        [`${docType}_path`]: fileName
      };

      await supabase
        .from('professional_applications')
        .update({ extracted_data: updatedExtractedData as any })
        .eq('id', applicationId);

      toast.success(`${getDocLabel(docType)} geüpload`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Fout bij uploaden');
    } finally {
      setUploadingDoc(null);
    }
  };

  const getDocLabel = (docType: DocType): string => {
    const labels: Record<DocType, string> = {
      identiteitsbewijs: 'Identiteitsbewijs',
      kvk_uittreksel: 'KvK Uittreksel',
      beroepsaansprakelijkheid: 'Beroepsaansprakelijkheid',
      klachtenportaal_wkkgz: 'WKKGZ Klachtenportaal',
      bhv_certificaat: 'BHV Certificaat',
      tillift_certificaat: 'Tillift Certificaat'
    };
    return labels[docType];
  };

  const saveBedrijfsgegevens = async () => {
    setIsSubmitting(true);
    try {
      const { data: currentApp } = await supabase
        .from('professional_applications')
        .select('extracted_data')
        .eq('id', applicationId)
        .single();

      const currentExtracted = (currentApp?.extracted_data as Record<string, unknown>) || {};
      const updatedExtractedData = {
        ...currentExtracted,
        bedrijfsnaam: bedrijfsnaam || null,
        kvk_nummer: kvkNummer || null,
        iban: iban || null
      };

      await supabase
        .from('professional_applications')
        .update({ extracted_data: updatedExtractedData })
        .eq('id', applicationId);

      toast.success('Bedrijfsgegevens opgeslagen');
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Fout bij opslaan');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 0: // Bedrijfsgegevens - with validation
        return !!(
          bedrijfsnaam && 
          kvkNummer && 
          iban && 
          isValidKvK(kvkNummer) && 
          isValidDutchIBAN(iban) &&
          !kvkError &&
          !ibanError
        );
      case 1: // Identiteitsbewijs
        return !!uploadedDocs.identiteitsbewijs;
      case 2: // Zakelijke documenten
        return !!(uploadedDocs.kvk_uittreksel && uploadedDocs.beroepsaansprakelijkheid);
      case 3: // Zorg compliance
        return !!uploadedDocs.klachtenportaal_wkkgz;
      case 4: // Optionele certificaten
        return true; // Always can proceed (optional step)
      default:
        return false;
    }
  };

  const handleNext = async () => {
    if (currentStep === 0) {
      await saveBedrijfsgegevens();
    }
    
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      await handleComplete();
    }
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      // Fetch current data and recalculate completeness
      const { data: currentApp } = await supabase
        .from('professional_applications')
        .select('extracted_data')
        .eq('id', applicationId)
        .single();

      const extractedData = (currentApp?.extracted_data as Record<string, unknown>) || {};
      const newMissingInfo = detectMissingInfoHR(extractedData);
      const newScore = calculateHRCompletenessScore(extractedData);

      await supabase
        .from('professional_applications')
        .update({
          missing_info: newMissingInfo,
          completeness_score: Math.max(0, Math.min(100, newScore))
        })
        .eq('id', applicationId);

      // Celebrate!
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });

      toast.success(`ZZP documenten compleet! (${newScore}%)`);
      onComplete();
    } catch (error) {
      console.error('Complete error:', error);
      toast.error('Fout bij afronden');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderDocumentUpload = (docType: DocType, label: string, description: string, isRequired: boolean = true) => {
    const isUploaded = !!uploadedDocs[docType];
    const isUploading = uploadingDoc === docType;

    return (
      <div 
        key={docType}
        className={`p-4 rounded-lg border transition-colors ${
          isUploaded 
            ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800' 
            : 'bg-muted/30 border-border'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${isUploaded ? 'bg-emerald-100 dark:bg-emerald-900' : 'bg-muted'}`}>
              {isUploaded ? (
                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <FileText className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="font-medium text-sm">
                {label}
                {!isRequired && <span className="text-muted-foreground ml-1">(optioneel)</span>}
              </p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isUploaded && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const { data } = await supabase.storage
                    .from('application-documents')
                    .createSignedUrl(uploadedDocs[docType]!, 60);
                  if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                }}
              >
                <Eye className="h-4 w-4" />
              </Button>
            )}
            <input
              type="file"
              ref={el => { fileInputRefs.current[docType] = el; }}
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(docType, file);
              }}
            />
            <Button
              variant={isUploaded ? "outline" : "default"}
              size="sm"
              disabled={isUploading}
              onClick={() => fileInputRefs.current[docType]?.click()}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isUploaded ? (
                'Vervang'
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-1" />
                  Upload
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Bedrijfsgegevens
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bedrijfsnaam">Bedrijfsnaam *</Label>
              <Input
                id="bedrijfsnaam"
                value={bedrijfsnaam}
                onChange={(e) => setBedrijfsnaam(e.target.value)}
                placeholder="Jouw ZZP Zorg B.V."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kvk">KvK Nummer *</Label>
              <Input
                id="kvk"
                value={kvkNummer}
                onChange={(e) => handleKvkChange(e.target.value)}
                placeholder="12345678"
                maxLength={8}
                className={kvkError ? 'border-destructive' : kvkNummer.length === 8 && isValidKvK(kvkNummer) ? 'border-emerald-500' : ''}
              />
              {kvkError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {kvkError}
                </p>
              )}
              {!kvkError && kvkNummer.length === 8 && (
                <p className="text-xs text-emerald-600 flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Geldig KvK nummer
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="iban">IBAN *</Label>
              <Input
                id="iban"
                value={formatIBAN(iban)}
                onChange={(e) => handleIbanChange(e.target.value)}
                placeholder="NL00 BANK 0123 4567 89"
                maxLength={22}
                className={ibanError ? 'border-destructive' : iban.length === 18 && isValidDutchIBAN(iban) ? 'border-emerald-500' : ''}
              />
              {ibanError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {ibanError}
                </p>
              )}
              {!ibanError && iban.length === 18 && isValidDutchIBAN(iban) && (
                <p className="text-xs text-emerald-600 flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Geldig IBAN
                </p>
              )}
            </div>
          </div>
        );

      case 1: // Identiteitsbewijs
        return (
          <div className="space-y-4">
            {renderDocumentUpload(
              'identiteitsbewijs',
              'Identiteitsbewijs',
              'ID-kaart of paspoort (voor- en achterkant)'
            )}
          </div>
        );

      case 2: // Zakelijke documenten
        return (
          <div className="space-y-4">
            {renderDocumentUpload(
              'kvk_uittreksel',
              'KvK Uittreksel',
              'Recent uittreksel van de Kamer van Koophandel'
            )}
            {renderDocumentUpload(
              'beroepsaansprakelijkheid',
              'Beroepsaansprakelijkheidsverzekering',
              'Polis of bewijs van dekking'
            )}
          </div>
        );

      case 3: // Zorg compliance
        return (
          <div className="space-y-4">
            {renderDocumentUpload(
              'klachtenportaal_wkkgz',
              'WKKGZ Klachtenportaal',
              'Bewijs van aansluiting bij klachtenportaal'
            )}
          </div>
        );

      case 4: // Optionele certificaten
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground mb-4">
              Deze certificaten zijn optioneel maar kunnen je kansen op plaatsingen vergroten.
            </p>
            {renderDocumentUpload(
              'bhv_certificaat',
              'BHV Certificaat',
              'Bedrijfshulpverlening certificaat',
              false
            )}
            {renderDocumentUpload(
              'tillift_certificaat',
              'Tillift Certificaat',
              'Certificaat voor het gebruik van tilliften',
              false
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const isLastStep = currentStep === WIZARD_STEPS.length - 1;
  const currentStepData = WIZARD_STEPS[currentStep];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <span>Stap {currentStep + 1} van {WIZARD_STEPS.length}</span>
            {currentStepData.isOptional && (
              <span className="text-xs bg-muted px-2 py-0.5 rounded">Optioneel</span>
            )}
          </div>
          <Progress value={progressPercentage} className="mb-4" />
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              {currentStepData.icon}
            </div>
            {currentStepData.title}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{currentStepData.description}</p>
        </DialogHeader>

        <div className="py-4">
          {renderStepContent()}
        </div>

        {/* Step indicators with completion status */}
        <div className="flex justify-center gap-2 py-2">
          {WIZARD_STEPS.map((step, index) => (
            <div
              key={step.id}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentStep
                  ? 'bg-primary ring-2 ring-primary/30'
                  : isStepCompleted(index)
                  ? 'bg-emerald-500'
                  : 'bg-muted'
              }`}
              title={`${step.title}${isStepCompleted(index) ? ' ✓' : ''}`}
            />
          ))}
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="ghost"
            onClick={() => currentStep > 0 ? setCurrentStep(prev => prev - 1) : onClose()}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {currentStep > 0 ? 'Terug' : 'Sluiten'}
          </Button>

          <div className="flex gap-2">
            {currentStepData.isOptional && !isLastStep && (
              <Button
                variant="ghost"
                onClick={() => setCurrentStep(prev => prev + 1)}
              >
                Overslaan
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={!canProceed() && !currentStepData.isOptional || isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isLastStep ? (
                <>
                  <PartyPopper className="h-4 w-4 mr-1" />
                  Afronden
                </>
              ) : (
                <>
                  Volgende
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
