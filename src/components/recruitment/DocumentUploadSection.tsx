import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { 
  Upload, 
  FileText, 
  Loader2, 
  Download, 
  Trash2, 
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  GraduationCap,
  Shield,
  Info,
  ShieldCheck,
  Clock,
  Eye
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface VogVerificationResponse {
  gaav_code?: number;
  gaav_description?: string;
  requires_manual_review?: boolean;
  issue_date?: string | null;
  valid_until?: string | null;
  days_remaining?: number | null;
  screening_profile?: {
    extracted_code?: string | null;
    extracted_aspecten?: string[];
    extracted_functie?: string | null;
    required_code?: string | null;
    required_aspecten?: string[];
    missing_aspecten?: string[];
    profile_valid?: boolean | null;
    profile_reason?: string | null;
  };
}

interface DocumentUploadSectionProps {
  applicationId: string;
  vogFilePath?: string | null;
  diplomaFilePath?: string | null;
  cvFilePath?: string | null;
  cvFileName?: string | null;
  vogStatus?: string | null;
  diplomaStatus?: string | null;
  diplomaVerificationResponse?: any | null;
  vogVerificationResponse?: VogVerificationResponse | null;
  pipelineStage?: string | null; // For VOG flow differentiation
  onUploadComplete: () => void;
  onRequestNewVog?: () => void; // Callback for new VOG request at screening
}

type DocumentType = 'vog' | 'diploma' | 'cv';

// Screening profile descriptions
const SCREENING_PROFILES: Record<string, string> = {
  '45': 'Gezondheidszorg en welzijn',
  '84': 'Zorg voor minderjarigen',
  '85': 'Zorg voor hulpbehoevenden',
};

export function DocumentUploadSection({
  applicationId,
  vogFilePath,
  diplomaFilePath,
  cvFilePath,
  cvFileName,
  vogStatus,
  diplomaStatus,
  diplomaVerificationResponse,
  vogVerificationResponse,
  pipelineStage = 'nieuw',
  onUploadComplete,
  onRequestNewVog
}: DocumentUploadSectionProps) {
  // Determine if we're at screening stage for new VOG request
  const isScreeningStage = pipelineStage === 'screening';
  const isNieuwStage = pipelineStage === 'nieuw' || !pipelineStage;
  const [uploadingVog, setUploadingVog] = useState(false);
  const [uploadingDiploma, setUploadingDiploma] = useState(false);
  const [uploadingCV, setUploadingCV] = useState(false);
  const [downloadingVog, setDownloadingVog] = useState(false);
  const [downloadingDiploma, setDownloadingDiploma] = useState(false);
  const [downloadingCV, setDownloadingCV] = useState(false);
  const [verifyingDiploma, setVerifyingDiploma] = useState(false);
  
  const vogInputRef = useRef<HTMLInputElement>(null);
  const diplomaInputRef = useRef<HTMLInputElement>(null);
  const cvInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (
    file: File,
    docType: DocumentType
  ) => {
    const setUploading = docType === 'vog' ? setUploadingVog : docType === 'diploma' ? setUploadingDiploma : setUploadingCV;
    setUploading(true);

    try {
      // Validate file type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Alleen PDF, JPEG of PNG bestanden zijn toegestaan');
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Bestand is te groot (max 10MB)');
        return;
      }

      // Generate unique filename
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `${applicationId}/${docType}/${timestamp}_${sanitizedName}`;

      // Upload to storage - CV goes to application-cvs, others to application-documents
      const bucket = docType === 'cv' ? 'application-cvs' : 'application-documents';
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        toast.error(`Upload mislukt: ${uploadError.message}`);
        return;
      }

      // CV is stored differently than VOG/Diploma
      if (docType === 'cv') {
        const { error: updateError } = await supabase
          .from('professional_applications')
          .update({ 
            cv_file_path: filePath,
            cv_file_name: file.name
          })
          .eq('id', applicationId);

        if (updateError) throw updateError;
      } else {
        // Update extracted_data with file path for VOG/Diploma
        const fieldName = docType === 'vog' ? 'vog_file_path' : 'diploma_file_path';
        
        const { data: currentApp, error: fetchError } = await supabase
          .from('professional_applications')
          .select('extracted_data')
          .eq('id', applicationId)
          .single();

        if (fetchError) throw fetchError;

        const currentExtracted = (currentApp?.extracted_data as Record<string, unknown>) || {};
        const updatedExtractedData = {
          ...currentExtracted,
          [fieldName]: filePath
        };

        const { error: updateError } = await supabase
          .from('professional_applications')
          .update({ 
            extracted_data: updatedExtractedData as any,
            ...(docType === 'diploma' ? { diploma_validation_status: 'received' as const } : {})
          })
          .eq('id', applicationId);

        if (updateError) throw updateError;
      }

      toast.success(
        docType === 'vog' 
          ? 'VOG geüpload - automatische verificatie gestart' 
          : docType === 'diploma'
          ? 'Diploma geüpload - DUO verificatie gestart...'
          : 'CV geüpload'
      );
      
      // Auto-trigger DUO verification for diploma
      if (docType === 'diploma') {
        setVerifyingDiploma(true);
        try {
          const { data: verifyResult, error: verifyError } = await supabase.functions.invoke('verify-diploma-duo', {
            body: { application_id: applicationId }
          });

          if (verifyError) {
            console.error('DUO verification error:', verifyError);
            toast.warning('Diploma geüpload - automatische verificatie niet beschikbaar, handmatige controle vereist');
            
            // Still trigger level validation even if DUO failed
            await supabase.functions.invoke('validate-diploma-level', {
              body: { application_id: applicationId, diploma_info: { diploma_naam: file.name } }
            });
          } else if (verifyResult?.status === 'verified_duo') {
            toast.success('✅ Diploma automatisch geverifieerd via DUO!');
            
            // Trigger level validation with DUO details
            await supabase.functions.invoke('validate-diploma-level', {
              body: { application_id: applicationId, diploma_info: verifyResult.details }
            });
          } else if (verifyResult?.status === 'manual_review') {
            toast.info('Diploma ontvangen - handmatige verificatie vereist');
            
            // Still trigger level validation for manual review cases
            await supabase.functions.invoke('validate-diploma-level', {
              body: { application_id: applicationId, diploma_info: verifyResult.details || { diploma_naam: file.name } }
            });
          } else if (verifyResult?.status === 'duo_invalid') {
            toast.warning('⚠️ Diploma kon niet via DUO geverifieerd worden');
            
            // Still trigger level validation even if DUO invalid
            await supabase.functions.invoke('validate-diploma-level', {
              body: { application_id: applicationId, diploma_info: verifyResult.details || { diploma_naam: file.name } }
            });
          }
        } catch (e) {
          console.error('Error during diploma verification:', e);
        } finally {
          setVerifyingDiploma(false);
        }
      }
      
      onUploadComplete();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(`Fout bij uploaden ${docType.toUpperCase()}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (filePath: string, docType: DocumentType) => {
    const setDownloading = docType === 'vog' ? setDownloadingVog : docType === 'diploma' ? setDownloadingDiploma : setDownloadingCV;
    setDownloading(true);

    try {
      // CV files are stored in 'application-cvs' bucket, others in 'application-documents'
      const bucket = docType === 'cv' ? 'application-cvs' : 'application-documents';
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(filePath, 60);

      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Fout bij downloaden');
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async (docType: DocumentType) => {
    const filePath = docType === 'vog' ? vogFilePath : docType === 'diploma' ? diplomaFilePath : cvFilePath;
    if (!filePath) return;

    try {
      // CV files are stored in 'application-cvs' bucket, others in 'application-documents'
      const bucket = docType === 'cv' ? 'application-cvs' : 'application-documents';
      const { error: deleteError } = await supabase.storage
        .from(bucket)
        .remove([filePath]);

      if (deleteError) {
        console.error('Delete error:', deleteError);
      }

      if (docType === 'cv') {
        // CV is stored in separate columns
        const { error: updateError } = await supabase
          .from('professional_applications')
          .update({ 
            cv_file_path: null,
            cv_file_name: null
          })
          .eq('id', applicationId);

        if (updateError) throw updateError;
      } else {
        // VOG/Diploma stored in extracted_data
        const fieldName = docType === 'vog' ? 'vog_file_path' : 'diploma_file_path';
        
        const { data: currentApp, error: fetchError } = await supabase
          .from('professional_applications')
          .select('extracted_data')
          .eq('id', applicationId)
          .single();

        if (fetchError) throw fetchError;

        const currentExtracted = (currentApp?.extracted_data as Record<string, unknown>) || {};
        const updatedExtractedData = { ...currentExtracted };
        delete updatedExtractedData[fieldName];

        const updateData: any = { 
          extracted_data: updatedExtractedData 
        };
        
        if (docType === 'vog') {
          updateData.vog_validation_status = 'missing';
          updateData.vog_verification_response = null;
        } else {
          updateData.diploma_validation_status = 'missing';
        }

        const { error: updateError } = await supabase
          .from('professional_applications')
          .update(updateData)
          .eq('id', applicationId);

        if (updateError) throw updateError;
      }

      toast.success(`${docType.toUpperCase()} verwijderd`);
      onUploadComplete();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Fout bij verwijderen');
    }
  };

  const getStatusBadge = (status: string | null | undefined, docType: DocumentType) => {
    if (!status || status === 'missing') {
      return <Badge variant="outline" className="text-destructive border-destructive/30">Ontbreekt</Badge>;
    }
    if (status === 'received') {
      return <Badge variant="outline" className="text-amber-600 border-amber-300">Ontvangen</Badge>;
    }
    if (status === 'validating') {
      return <Badge variant="outline" className="text-blue-600 border-blue-300">Valideren...</Badge>;
    }
    if (status === 'authentic_ok' || status === 'verified_emrex' || status === 'verified_manual') {
      return <Badge variant="outline" className="text-green-600 border-green-300">Geverifieerd</Badge>;
    }
    if (status === 'authentic_fail' || status === 'expired') {
      return <Badge variant="outline" className="text-destructive border-destructive/30">Afgekeurd</Badge>;
    }
    if (status === 'wrong_profile') {
      return <Badge variant="outline" className="text-amber-600 border-amber-300">Verkeerd profiel</Badge>;
    }
    if (status === 'manual_review') {
      return <Badge variant="outline" className="text-amber-600 border-amber-300">Handmatig controleren</Badge>;
    }
    return <Badge variant="outline">{status}</Badge>;
  };

  // Render screening profile info
  const renderScreeningProfileInfo = () => {
    const profile = vogVerificationResponse?.screening_profile;
    if (!profile) return null;

    const hasExtractedData = profile.extracted_code || (profile.extracted_aspecten && profile.extracted_aspecten.length > 0);
    
    return (
      <div className="mt-3 p-3 rounded-lg bg-muted/50 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Info className="h-4 w-4 text-muted-foreground" />
          <span>Screeningsprofiel Analyse</span>
        </div>
        
        {hasExtractedData ? (
          <>
            {/* Extracted profile */}
            <div className="text-xs space-y-1">
              {profile.extracted_code && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Profiel:</span>
                  <span className="font-medium">
                    {profile.extracted_code} - {SCREENING_PROFILES[profile.extracted_code] || 'Onbekend'}
                  </span>
                </div>
              )}
              {profile.extracted_aspecten && profile.extracted_aspecten.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Functieaspecten:</span>
                  <span className="font-medium">
                    {profile.extracted_aspecten.map(a => `${a} (${SCREENING_PROFILES[a] || 'Onbekend'})`).join(', ')}
                  </span>
                </div>
              )}
              {profile.extracted_functie && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Functie:</span>
                  <span className="font-medium">{profile.extracted_functie}</span>
                </div>
              )}
            </div>

            {/* Validation result */}
            {profile.profile_valid !== null && (
              <div className={`flex items-start gap-2 p-2 rounded text-xs ${
                profile.profile_valid 
                  ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400' 
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
              }`}>
                {profile.profile_valid ? (
                  <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                )}
                <div className="space-y-1">
                  <span className="font-medium">{profile.profile_reason}</span>
                  {!profile.profile_valid && profile.required_code && (
                    <div className="text-xs opacity-80">
                      Vereist: Profiel {profile.required_code} 
                      {profile.required_aspecten && profile.required_aspecten.length > 0 && (
                        <> met aspecten {profile.required_aspecten.join(', ')}</>
                      )}
                    </div>
                  )}
                  {profile.missing_aspecten && profile.missing_aspecten.length > 0 && (
                    <div className="text-xs opacity-80">
                      Ontbrekende aspecten: {profile.missing_aspecten.map(a => 
                        `${a} (${SCREENING_PROFILES[a] || 'Onbekend'})`
                      ).join(', ')}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2 p-2 rounded bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 text-xs">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>Kon screeningsprofiel niet automatisch extraheren - handmatige controle vereist</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* CV Upload */}
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">CV (Curriculum Vitae)</CardTitle>
              </div>
              {cvFilePath ? (
                <Badge variant="outline" className="text-green-600 border-green-300">Aanwezig</Badge>
              ) : (
                <Badge variant="outline" className="text-destructive border-destructive/30">Ontbreekt</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="py-2 px-4">
            {cvFilePath ? (
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm truncate max-w-[200px]">
                    {cvFileName || cvFilePath.split('/').pop()}
                  </span>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </div>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownload(cvFilePath, 'cv')}
                        disabled={downloadingCV}
                      >
                        {downloadingCV ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Bekijken</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete('cv')}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Verwijderen</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ) : (
              <div
                className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                onClick={() => cvInputRef.current?.click()}
              >
                {uploadingCV ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Uploaden...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Klik om CV te uploaden
                    </span>
                    <span className="text-xs text-muted-foreground">
                      PDF, JPEG of PNG (max 10MB)
                    </span>
                  </div>
                )}
              </div>
            )}
            <input
              ref={cvInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file, 'cv');
                e.target.value = '';
              }}
            />
          </CardContent>
        </Card>

        {/* VOG Upload - differentiated by pipeline stage */}
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">
                  {isNieuwStage ? 'Tijdelijke VOG (Huidige/Oude VOG)' : 'VOG (Verklaring Omtrent Gedrag)'}
                </CardTitle>
              </div>
              {vogFilePath ? (
                <Badge variant="outline" className="text-amber-600 border-amber-300">
                  {isNieuwStage ? 'Tijdelijk ontvangen' : 'Ontvangen'}
                </Badge>
              ) : (
                getStatusBadge(vogStatus, 'vog')
              )}
            </div>
            {isNieuwStage && (
              <p className="text-xs text-muted-foreground mt-1">
                Upload uw huidige of oude VOG - officiële aanvraag volgt bij Screening
              </p>
            )}
          </CardHeader>
          <CardContent className="py-2 px-4">
            {vogFilePath ? (
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm truncate max-w-[200px]">
                    {vogFilePath.split('/').pop()}
                  </span>
                  {vogStatus === 'authentic_ok' && (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  )}
                  {vogStatus === 'validating' && (
                    <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                  )}
                  {(vogStatus === 'expired' || vogStatus === 'authentic_fail') && (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  )}
                  {vogStatus === 'wrong_profile' && (
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownload(vogFilePath, 'vog')}
                        disabled={downloadingVog}
                      >
                        {downloadingVog ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Bekijken</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete('vog')}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Verwijderen</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ) : (
              <div
                className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                onClick={() => vogInputRef.current?.click()}
              >
                {uploadingVog ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Uploaden...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Klik om VOG te uploaden
                    </span>
                    <span className="text-xs text-muted-foreground">
                      PDF, JPEG of PNG (max 10MB)
                    </span>
                  </div>
                )}
              </div>
            )}
            <input
              ref={vogInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file, 'vog');
                e.target.value = '';
              }}
            />

            
            {/* Status messages */}
            {vogStatus === 'authentic_ok' && (
              <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                VOG is automatisch geverifieerd via GAAV
              </p>
            )}
            {vogStatus === 'manual_review' && (
              <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Handmatige verificatie vereist
              </p>
            )}
            {vogStatus === 'wrong_profile' && (
              <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                VOG heeft verkeerd screeningsprofiel voor deze functie
              </p>
            )}
            {vogStatus === 'expired' && (
              <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                VOG is verlopen (ouder dan 3 maanden)
              </p>
            )}

            {/* Screening profile details */}
            {vogFilePath && vogVerificationResponse && renderScreeningProfileInfo()}
            
            {/* New VOG Request button at Screening stage */}
            {isScreeningStage && onRequestNewVog && (
              <div className="mt-3 pt-3 border-t">
                <Button
                  variant="default"
                  size="sm"
                  className="w-full"
                  onClick={onRequestNewVog}
                >
                  <Shield className="h-4 w-4 mr-2" />
                  Nieuwe VOG Aanvragen
                </Button>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Start het officiële VOG aanvraagproces voor deze kandidaat
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Diploma Upload */}
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Diploma</CardTitle>
              </div>
              {getStatusBadge(diplomaStatus, 'diploma')}
            </div>
          </CardHeader>
          <CardContent className="py-2 px-4">
            {/* DUO Verification Status Banner */}
            {diplomaFilePath && diplomaStatus === 'verified_duo' && (
              <div className="flex items-center gap-2 p-3 mb-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                <div className="flex-1">
                  <span className="text-green-700 dark:text-green-400 font-medium text-sm">✅ Geverifieerd via DUO</span>
                  {diplomaVerificationResponse?.verified_at && (
                    <p className="text-xs text-green-600 dark:text-green-500">
                      Geverifieerd op {new Date(diplomaVerificationResponse.verified_at).toLocaleDateString('nl-NL')}
                    </p>
                  )}
                </div>
                <Badge className="bg-green-600 text-white">DUO Verified</Badge>
              </div>
            )}

            {diplomaFilePath && diplomaStatus === 'verified_manual' && (
              <div className="flex items-center gap-2 p-3 mb-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                <Eye className="h-5 w-5 text-blue-600" />
                <div className="flex-1">
                  <span className="text-blue-700 dark:text-blue-400 font-medium text-sm">✓ Handmatig Geverifieerd</span>
                </div>
                <Badge className="bg-blue-600 text-white">Handmatig</Badge>
              </div>
            )}

            {diplomaFilePath && diplomaStatus === 'manual_review' && (
              <div className="flex items-center gap-2 p-3 mb-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <Clock className="h-5 w-5 text-amber-600" />
                <span className="text-amber-700 dark:text-amber-400 font-medium text-sm">Handmatige verificatie vereist</span>
              </div>
            )}

            {diplomaFilePath && diplomaStatus === 'duo_invalid' && (
              <div className="flex items-center gap-2 p-3 mb-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <span className="text-red-700 dark:text-red-400 font-medium text-sm">⚠️ DUO verificatie gefaald - handmatige controle vereist</span>
              </div>
            )}

            {verifyingDiploma && (
              <div className="flex items-center gap-2 p-3 mb-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                <span className="text-blue-700 dark:text-blue-400 font-medium text-sm">DUO verificatie bezig...</span>
              </div>
            )}

            {diplomaFilePath ? (
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm truncate max-w-[200px]">
                    {diplomaFilePath.split('/').pop()}
                  </span>
                  {(diplomaStatus === 'verified_duo' || diplomaStatus === 'verified_emrex' || diplomaStatus === 'verified_manual') && (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownload(diplomaFilePath, 'diploma')}
                        disabled={downloadingDiploma}
                      >
                        {downloadingDiploma ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Bekijken</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete('diploma')}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Verwijderen</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ) : (
              <div
                className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                onClick={() => diplomaInputRef.current?.click()}
              >
                {uploadingDiploma ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Uploaden...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Klik om diploma te uploaden
                    </span>
                    <span className="text-xs text-muted-foreground">
                      PDF, JPEG of PNG (max 10MB)
                    </span>
                  </div>
                )}
              </div>
            )}
            <input
              ref={diplomaInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file, 'diploma');
                e.target.value = '';
              }}
            />
            {diplomaStatus === 'verified_emrex' && (
              <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Diploma geverifieerd via DUO EMREX
              </p>
            )}
            {diplomaStatus === 'received' && !verifyingDiploma && (
              <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Diploma ontvangen - verificatie in behandeling
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
