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
  FileWarning,
  GraduationCap,
  Shield
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DocumentUploadSectionProps {
  applicationId: string;
  vogFilePath?: string | null;
  diplomaFilePath?: string | null;
  vogStatus?: string | null;
  diplomaStatus?: string | null;
  onUploadComplete: () => void;
}

type DocumentType = 'vog' | 'diploma';

export function DocumentUploadSection({
  applicationId,
  vogFilePath,
  diplomaFilePath,
  vogStatus,
  diplomaStatus,
  onUploadComplete
}: DocumentUploadSectionProps) {
  const [uploadingVog, setUploadingVog] = useState(false);
  const [uploadingDiploma, setUploadingDiploma] = useState(false);
  const [downloadingVog, setDownloadingVog] = useState(false);
  const [downloadingDiploma, setDownloadingDiploma] = useState(false);
  
  const vogInputRef = useRef<HTMLInputElement>(null);
  const diplomaInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (
    file: File,
    docType: DocumentType
  ) => {
    const setUploading = docType === 'vog' ? setUploadingVog : setUploadingDiploma;
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

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('application-documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        toast.error(`Upload mislukt: ${uploadError.message}`);
        return;
      }

      // Update extracted_data with file path
      // This will trigger the auto_verify_vog_on_upload trigger for VOG documents
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
          // Set diploma status to received if uploading diploma
          ...(docType === 'diploma' ? { diploma_validation_status: 'received' as const } : {})
        })
        .eq('id', applicationId);

      if (updateError) throw updateError;

      toast.success(
        docType === 'vog' 
          ? 'VOG geüpload - automatische verificatie gestart' 
          : 'Diploma geüpload'
      );
      
      onUploadComplete();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(`Fout bij uploaden ${docType.toUpperCase()}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (filePath: string, docType: DocumentType) => {
    const setDownloading = docType === 'vog' ? setDownloadingVog : setDownloadingDiploma;
    setDownloading(true);

    try {
      const { data, error } = await supabase.storage
        .from('application-documents')
        .createSignedUrl(filePath, 60); // 60 seconds validity

      if (error) throw error;

      // Open in new tab
      window.open(data.signedUrl, '_blank');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Fout bij downloaden');
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async (docType: DocumentType) => {
    const filePath = docType === 'vog' ? vogFilePath : diplomaFilePath;
    if (!filePath) return;

    try {
      // Delete from storage
      const { error: deleteError } = await supabase.storage
        .from('application-documents')
        .remove([filePath]);

      if (deleteError) {
        console.error('Delete error:', deleteError);
        // Continue anyway to remove reference
      }

      // Update extracted_data to remove file path
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
      
      // Reset status when deleting
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
    if (status === 'manual_review') {
      return <Badge variant="outline" className="text-amber-600 border-amber-300">Handmatig controleren</Badge>;
    }
    return <Badge variant="outline">{status}</Badge>;
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* VOG Upload */}
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">VOG (Verklaring Omtrent Gedrag)</CardTitle>
              </div>
              {getStatusBadge(vogStatus, 'vog')}
            </div>
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
            {diplomaFilePath ? (
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm truncate max-w-[200px]">
                    {diplomaFilePath.split('/').pop()}
                  </span>
                  {(diplomaStatus === 'verified_emrex' || diplomaStatus === 'verified_manual') && (
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
            {diplomaStatus === 'verified_manual' && (
              <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Diploma handmatig geverifieerd
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
