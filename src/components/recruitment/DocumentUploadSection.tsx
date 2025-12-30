import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  Eye,
  RefreshCw,
  ShieldX,
  XCircle,
  ExternalLink
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logDocumentAction } from '@/lib/documentAuditLogger';
import { registerDocument, calculateExpiryDate, checkDocumentExistsInStorage } from '@/lib/services/documentService';
import { DocumentAuditHistory } from './DocumentAuditHistory';
import { logger } from '@/lib/logger';

const log = logger.create('DocumentUploadSection');

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
  const [previewingVog, setPreviewingVog] = useState(false);
  const [previewingDiploma, setPreviewingDiploma] = useState(false);
  const [previewingCV, setPreviewingCV] = useState(false);
  const [verifyingDiploma, setVerifyingDiploma] = useState(false);
  const [retryingDuoVerification, setRetryingDuoVerification] = useState(false);
  
  // Inline viewer state
  const [inlineViewerOpen, setInlineViewerOpen] = useState(false);
  const [inlineViewerUrl, setInlineViewerUrl] = useState<string | null>(null);
  const [inlineViewerType, setInlineViewerType] = useState<'pdf' | 'image'>('pdf');
  const [inlineViewerTitle, setInlineViewerTitle] = useState('');
  const [loadingInlineViewer, setLoadingInlineViewer] = useState(false);
  
  const vogInputRef = useRef<HTMLInputElement>(null);
  const diplomaInputRef = useRef<HTMLInputElement>(null);
  const cvInputRef = useRef<HTMLInputElement>(null);

  // Storage existence check states
  const [diplomaExistsInStorage, setDiplomaExistsInStorage] = useState<boolean | null>(null);
  const [checkingDiplomaStorage, setCheckingDiplomaStorage] = useState(false);

  // Check if diploma file actually exists in storage on mount
  useEffect(() => {
    const checkDiplomaInStorage = async () => {
      if (!diplomaFilePath) {
        setDiplomaExistsInStorage(false);
        return;
      }

      setCheckingDiplomaStorage(true);
      try {
        const result = await checkDocumentExistsInStorage({
          applicationId,
          documentType: 'diploma',
          filePath: diplomaFilePath,
          autoCleanupOrphan: true
        });

        setDiplomaExistsInStorage(result.exists);

        if (result.wasOrphan && result.cleanedUp) {
          toast.info('Diploma bestand niet gevonden in storage - upload optie beschikbaar');
          onUploadComplete(); // Trigger refresh to get updated data
        }
      } catch (e) {
        log.error('Error checking diploma storage:', e);
        setDiplomaExistsInStorage(false);
      } finally {
        setCheckingDiplomaStorage(false);
      }
    };

    checkDiplomaInStorage();
  }, [diplomaFilePath, applicationId, onUploadComplete]);

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
        log.error('Upload error:', uploadError);
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

          log.log('DUO verification result:', verifyResult);

          // Determine the final status from the edge function response
          const finalStatus = verifyResult?.status;
          
          // FALLBACK: Ensure database is updated even if edge function update failed
          if (finalStatus && finalStatus !== 'received') {
            log.log('Applying fallback database update with status:', finalStatus);
            const { error: fallbackError } = await supabase
              .from('professional_applications')
              .update({
                diploma_validation_status: finalStatus,
                diploma_verification_response: verifyResult.details || null,
                duo_verified_at: verifyResult.verified_at || new Date().toISOString()
              })
              .eq('id', applicationId);
            
            if (fallbackError) {
              log.error('Fallback update failed:', fallbackError);
            } else {
              log.log('Fallback update successful');
            }
          }

          if (verifyError) {
            log.error('DUO verification error:', verifyError);
            toast.warning('Diploma geüpload - automatische verificatie niet beschikbaar, handmatige controle vereist');
            
            // Update status to manual_review if DUO failed
            await supabase
              .from('professional_applications')
              .update({ diploma_validation_status: 'manual_review' })
              .eq('id', applicationId);
            
            // Still trigger level validation even if DUO failed
            await supabase.functions.invoke('validate-diploma-level', {
              body: { application_id: applicationId, diploma_info: { diploma_naam: file.name } }
            });
          } else if (finalStatus === 'verified_duo') {
            toast.success('✅ Diploma automatisch geverifieerd via DUO!');
            
            // Trigger level validation with DUO details
            await supabase.functions.invoke('validate-diploma-level', {
              body: { application_id: applicationId, diploma_info: verifyResult.details }
            });
          } else if (finalStatus === 'manual_review') {
            toast.info('Diploma ontvangen - handmatige verificatie vereist');
            
            // Still trigger level validation for manual review cases
            await supabase.functions.invoke('validate-diploma-level', {
              body: { application_id: applicationId, diploma_info: verifyResult.details || { diploma_naam: file.name } }
            });
          } else if (finalStatus === 'duo_invalid' || finalStatus === 'duo_not_digital') {
            toast.warning('⚠️ Diploma kon niet via DUO geverifieerd worden');
            
            // Still trigger level validation even if DUO invalid
            await supabase.functions.invoke('validate-diploma-level', {
              body: { application_id: applicationId, diploma_info: verifyResult.details || { diploma_naam: file.name } }
            });
          } else {
            // Unknown status - set to manual_review
            toast.info('Diploma ontvangen - handmatige verificatie vereist');
            await supabase
              .from('professional_applications')
              .update({ diploma_validation_status: 'manual_review' })
              .eq('id', applicationId);
          }
        } catch (e) {
          log.error('Error during diploma verification:', e);
          // Set to manual_review on any error
          await supabase
            .from('professional_applications')
            .update({ diploma_validation_status: 'manual_review' })
            .eq('id', applicationId);
        } finally {
          setVerifyingDiploma(false);
        }
      }
      
      // Register in centralized application_documents table
      const expiryDate = calculateExpiryDate(docType);
      await registerDocument({
        applicationId,
        documentType: docType,
        filename: file.name,
        filePath,
        category: 'basis',
        source: 'manual_upload',
        expiryDate: expiryDate?.toISOString().split('T')[0] || null,
        contentType: file.type,
        metadata: { fileSize: file.size }
      });
      
      // Log audit event for upload
      await logDocumentAction({
        applicationId,
        documentType: docType,
        action: 'upload',
        filePath,
        metadata: { fileName: file.name, fileSize: file.size, mimeType: file.type }
      });
      
      onUploadComplete();
    } catch (error) {
      log.error('Upload error:', error);
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
      
      // Use blob download instead of window.open to bypass browser blocking (Edge, adblockers)
      const { data: blobData, error: downloadError } = await supabase.storage
        .from(bucket)
        .download(filePath);

      if (downloadError) throw downloadError;

      // Create blob URL and trigger download
      const url = URL.createObjectURL(blobData);
      const a = document.createElement('a');
      a.href = url;
      
      // Extract filename from path
      const filename = filePath.split('/').pop() || `${docType}-document`;
      a.download = filename;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      // Log audit event for download
      await logDocumentAction({
        applicationId,
        documentType: docType,
        action: 'download',
        filePath
      });
      
      toast.success(`${docType.toUpperCase()} gedownload`);
    } catch (error) {
      log.error('Download error:', error);
      toast.error('Fout bij downloaden');
    } finally {
      setDownloading(false);
    }
  };

  // Preview handler - opens document in new tab
  const handlePreview = async (filePath: string, docType: DocumentType) => {
    const setPreviewing = docType === 'vog' ? setPreviewingVog : docType === 'diploma' ? setPreviewingDiploma : setPreviewingCV;
    setPreviewing(true);

    try {
      const bucket = docType === 'cv' ? 'application-cvs' : 'application-documents';
      
      // Download as blob to bypass browser blocking
      const { data: blobData, error: downloadError } = await supabase.storage
        .from(bucket)
        .download(filePath);

      if (downloadError) throw downloadError;

      // Determine MIME type for correct display
      const fileName = filePath.toLowerCase();
      let mimeType = 'application/pdf';
      if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
        mimeType = 'image/jpeg';
      } else if (fileName.endsWith('.png')) {
        mimeType = 'image/png';
      }

      // Create blob URL and open in new tab
      const blob = new Blob([blobData], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      
      const newWindow = window.open(blobUrl, '_blank');
      
      // Revoke URL after delay to free memory
      if (newWindow) {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
      }
      
      // Log audit event for preview
      await logDocumentAction({
        applicationId,
        documentType: docType,
        action: 'preview',
        filePath
      });
      
    } catch (error) {
      log.error('Preview error:', error);
      toast.error('Fout bij openen document');
    } finally {
      setPreviewing(false);
    }
  };

  // Inline preview handler - opens document in modal
  const handleInlinePreview = async (filePath: string, docType: DocumentType) => {
    setLoadingInlineViewer(true);
    
    try {
      const bucket = docType === 'cv' ? 'application-cvs' : 'application-documents';
      
      const { data: blobData, error } = await supabase.storage
        .from(bucket)
        .download(filePath);

      if (error) throw error;

      // Detect MIME type
      const fileName = filePath.toLowerCase();
      let mimeType = 'application/pdf';
      let viewerType: 'pdf' | 'image' = 'pdf';
      
      if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
        mimeType = 'image/jpeg';
        viewerType = 'image';
      } else if (fileName.endsWith('.png')) {
        mimeType = 'image/png';
        viewerType = 'image';
      }

      const blob = new Blob([blobData], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      
      setInlineViewerUrl(blobUrl);
      setInlineViewerType(viewerType);
      setInlineViewerTitle(docType === 'cv' ? 'CV' : docType === 'vog' ? 'VOG' : 'Diploma');
      setInlineViewerOpen(true);
      
      // Log audit event for inline preview
      await logDocumentAction({
        applicationId,
        documentType: docType,
        action: 'inline_preview',
        filePath
      });
      
    } catch (error) {
      log.error('Inline preview error:', error);
      toast.error('Fout bij laden document');
    } finally {
      setLoadingInlineViewer(false);
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
        log.error('Delete error:', deleteError);
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
        // VOG/Diploma stored in extracted_data AND separate columns
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
          // FIX: Ook de diploma_file_path kolom op null zetten zodat upload weer mogelijk is
          updateData.diploma_file_path = null;
          updateData.diploma_validation_status = 'missing';
          updateData.diploma_verification_response = null;
          updateData.duo_verification_result = null;
          updateData.duo_verified_at = null;
        }

        const { error: updateError } = await supabase
          .from('professional_applications')
          .update(updateData)
          .eq('id', applicationId);

        if (updateError) throw updateError;
      }

      // Log audit event for delete
      await logDocumentAction({
        applicationId,
        documentType: docType,
        action: 'delete',
        filePath
      });

      toast.success(`${docType.toUpperCase()} verwijderd`);
      onUploadComplete();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Fout bij verwijderen');
    }
  };

  // Retry DUO verification handler
  const handleRetryDuoVerification = async () => {
    if (!diplomaFilePath) {
      toast.error('Geen diploma bestand gevonden');
      return;
    }
    
    setRetryingDuoVerification(true);
    
    try {
      log.log('🔄 Retry DUO verificatie voor diploma:', diplomaFilePath);
      
      const { data: verifyResult, error: verifyError } = await supabase.functions.invoke('verify-diploma-duo', {
        body: { 
          application_id: applicationId,
          action: 'retry'
        }
      });
      
      if (verifyError) {
        log.error('DUO retry verificatie fout:', verifyError);
        toast.error('DUO verificatie opnieuw proberen mislukt');
        return;
      }
      
      log.log('DUO retry result:', verifyResult);
      
      // Update database met resultaat (fallback)
      if (verifyResult?.status) {
        const { error: updateError } = await supabase
          .from('professional_applications')
          .update({
            diploma_validation_status: verifyResult.status,
            diploma_verification_response: verifyResult.details || null,
            duo_verified_at: verifyResult.verified_at || new Date().toISOString()
          })
          .eq('id', applicationId);
        
        if (updateError) {
          console.error('Fallback update failed:', updateError);
        }
      }
      
      // Trigger ook niveau validatie
      await supabase.functions.invoke('validate-diploma-level', {
        body: { 
          application_id: applicationId, 
          diploma_info: verifyResult?.details || {}
        }
      });
      
      if (verifyResult?.status === 'verified_duo') {
        toast.success('✅ Diploma geverifieerd via DUO!');
      } else if (verifyResult?.status === 'manual_review') {
        toast.info('Handmatige verificatie vereist');
      } else {
        toast.info(`Verificatie resultaat: ${verifyResult?.message || 'Onbekend'}`);
      }
      
      onUploadComplete(); // Refresh data
      
    } catch (error) {
      console.error('DUO retry error:', error);
      toast.error('Er ging iets mis bij het opnieuw verifiëren');
    } finally {
      setRetryingDuoVerification(false);
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
    if (status === 'verified_duo') {
      return <Badge variant="outline" className="text-green-600 border-green-300">DUO Geverifieerd</Badge>;
    }
    if (status === 'authentic_fail' || status === 'expired') {
      return <Badge variant="outline" className="text-destructive border-destructive/30">Afgekeurd</Badge>;
    }
    if (status === 'duo_invalid') {
      return <Badge variant="outline" className="text-destructive border-destructive/30">DUO Ongeldig</Badge>;
    }
    if (status === 'duo_not_digital') {
      return <Badge variant="outline" className="text-amber-600 border-amber-300">Niet Digitaal</Badge>;
    }
    if (status === 'duo_error') {
      return <Badge variant="outline" className="text-blue-600 border-blue-300">Verificatie Fout</Badge>;
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
                        onClick={() => handleInlinePreview(cvFilePath, 'cv')}
                        disabled={loadingInlineViewer}
                      >
                        {loadingInlineViewer ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Bekijken in modal</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePreview(cvFilePath, 'cv')}
                        disabled={previewingCV}
                      >
                        {previewingCV ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ExternalLink className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open in nieuw tabblad</TooltipContent>
                  </Tooltip>
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
                    <TooltipContent>Downloaden</TooltipContent>
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
                        onClick={() => handleInlinePreview(vogFilePath, 'vog')}
                        disabled={loadingInlineViewer}
                      >
                        {loadingInlineViewer ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Bekijken in modal</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePreview(vogFilePath, 'vog')}
                        disabled={previewingVog}
                      >
                        {previewingVog ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ExternalLink className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open in nieuw tabblad</TooltipContent>
                  </Tooltip>
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
                    <TooltipContent>Downloaden</TooltipContent>
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
              <div className="p-4 mb-3 rounded-lg bg-red-100 dark:bg-red-950/50 border-2 border-red-400 dark:border-red-700">
                <div className="flex items-start gap-3">
                  <ShieldX className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-red-800 dark:text-red-300 text-sm">⚠️ WAARSCHUWING: Diploma Ongeldig</h4>
                    <p className="text-red-700 dark:text-red-400 text-xs mt-1">
                      Dit diploma is NIET gevonden in het DUO register of is als ongeldig gemarkeerd. Dit kan betekenen:
                    </p>
                    <ul className="text-red-700 dark:text-red-400 text-xs mt-2 list-disc list-inside space-y-0.5">
                      <li>Het diploma is mogelijk vervalst</li>
                      <li>De gegevens komen niet overeen met het register</li>
                      <li>Het diploma is ingetrokken</li>
                    </ul>
                    <p className="text-red-800 dark:text-red-300 font-medium text-xs mt-2">
                      Vraag de kandidaat om een origineel diploma of neem contact op met de onderwijsinstelling.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {diplomaFilePath && diplomaStatus === 'duo_not_digital' && (
              <div className="flex items-center gap-2 p-3 mb-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <div className="flex-1">
                  <span className="text-amber-700 dark:text-amber-400 font-medium text-sm">Diploma niet digitaal geregistreerd</span>
                  <p className="text-amber-600 dark:text-amber-500 text-xs mt-1">
                    Dit diploma is niet in het digitale DUO register gevonden (mogelijk van voor 1996). Handmatige verificatie vereist.
                  </p>
                </div>
              </div>
            )}

            {diplomaFilePath && diplomaStatus === 'duo_error' && (
              <div className="flex items-center gap-2 p-3 mb-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                <AlertCircle className="h-5 w-5 text-blue-600" />
                <div className="flex-1">
                  <span className="text-blue-700 dark:text-blue-400 font-medium text-sm">DUO verificatie kon niet worden uitgevoerd</span>
                  <p className="text-blue-600 dark:text-blue-500 text-xs mt-1">
                    Er is een technische fout opgetreden. Probeer het opnieuw of voer handmatige verificatie uit.
                  </p>
                </div>
              </div>
            )}

            {/* Retry DUO Verification Button */}
            {diplomaFilePath && (
              diplomaStatus === 'manual_review' || 
              diplomaStatus === 'duo_invalid' || 
              diplomaStatus === 'received' ||
              diplomaStatus === 'pending'
            ) && !verifyingDiploma && (
              <div className="mb-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetryDuoVerification}
                  disabled={retryingDuoVerification}
                  className="w-full"
                >
                  {retryingDuoVerification ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      DUO verificatie bezig...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Opnieuw Verifiëren via DUO
                    </>
                  )}
                </Button>
              </div>
            )}

            {verifyingDiploma && (
              <div className="flex items-center gap-2 p-3 mb-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                <span className="text-blue-700 dark:text-blue-400 font-medium text-sm">DUO verificatie bezig...</span>
              </div>
            )}

            {checkingDiplomaStorage && (
              <div className="flex items-center gap-2 p-3 mb-3 rounded-lg bg-muted/50">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Bestand controleren...</span>
              </div>
            )}

            {diplomaFilePath && diplomaExistsInStorage ? (
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
                        onClick={() => handleInlinePreview(diplomaFilePath, 'diploma')}
                        disabled={loadingInlineViewer}
                      >
                        {loadingInlineViewer ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Bekijken in modal</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePreview(diplomaFilePath, 'diploma')}
                        disabled={previewingDiploma}
                      >
                        {previewingDiploma ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ExternalLink className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open in nieuw tabblad</TooltipContent>
                  </Tooltip>
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
                    <TooltipContent>Downloaden</TooltipContent>
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

      {/* Inline Document Viewer Modal */}
      <Dialog open={inlineViewerOpen} onOpenChange={(open) => {
        setInlineViewerOpen(open);
        if (!open && inlineViewerUrl) {
          URL.revokeObjectURL(inlineViewerUrl);
          setInlineViewerUrl(null);
        }
      }}>
        <DialogContent className="max-w-4xl h-[85vh] p-0 flex flex-col">
          <DialogHeader className="p-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {inlineViewerTitle} Bekijken
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden p-2">
            {loadingInlineViewer ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : inlineViewerUrl ? (
              inlineViewerType === 'pdf' ? (
                <iframe
                  src={inlineViewerUrl}
                  className="w-full h-full rounded border"
                  title={inlineViewerTitle}
                />
              ) : (
                <div className="flex items-center justify-center h-full bg-muted/30 rounded">
                  <img
                    src={inlineViewerUrl}
                    alt={inlineViewerTitle}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              )
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* Document Audit History */}
      <DocumentAuditHistory applicationId={applicationId} />
    </TooltipProvider>
  );
}
