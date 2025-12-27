import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Upload, 
  FileText, 
  Loader2, 
  Download, 
  Trash2, 
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Building2,
  CreditCard,
  Shield,
  FileCheck,
  FileWarning,
  Heart,
  Car,
  Plus,
  Eye,
  ExternalLink
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logDocumentAction } from '@/lib/documentAuditLogger';
import { DocumentAuditHistory } from './DocumentAuditHistory';

// ZZP Document types
type ZZPDocumentType = 
  | 'beroepsaansprakelijkheid'
  | 'kvk_uittreksel'
  | 'klachtenportaal_wkkgz'
  | 'identiteitsbewijs'
  | 'bhv_certificaat'
  | 'tillift_certificaat'
  | 'overig_certificaat';

interface ZZPDocumentConfig {
  type: ZZPDocumentType;
  label: string;
  description: string;
  icon: React.ReactNode;
  required: boolean;
  pathField: string;
}

const ZZP_DOCUMENTS: ZZPDocumentConfig[] = [
  {
    type: 'beroepsaansprakelijkheid',
    label: 'Beroepsaansprakelijkheidsverzekering',
    description: 'Bewijs van beroepsaansprakelijkheidsverzekering',
    icon: <Shield className="h-4 w-4" />,
    required: true,
    pathField: 'beroepsaansprakelijkheid_path'
  },
  {
    type: 'identiteitsbewijs',
    label: 'Identiteitsbewijs (voor én achterkant)',
    description: 'Paspoort of ID-kaart, beide zijden',
    icon: <FileCheck className="h-4 w-4" />,
    required: true,
    pathField: 'identiteitsbewijs_path'
  },
  {
    type: 'kvk_uittreksel',
    label: 'Inschrijving KvK',
    description: 'Recent uittreksel Kamer van Koophandel',
    icon: <Building2 className="h-4 w-4" />,
    required: true,
    pathField: 'kvk_uittreksel_path'
  },
  {
    type: 'klachtenportaal_wkkgz',
    label: 'Klachtenportaal / WKKGZ',
    description: 'Bewijs aansluiting klachtenportaal',
    icon: <FileWarning className="h-4 w-4" />,
    required: true,
    pathField: 'klachtenportaal_wkkgz_path'
  },
  {
    type: 'bhv_certificaat',
    label: 'Bedrijfshulpverlening (BHV)',
    description: 'BHV certificaat (optioneel)',
    icon: <Heart className="h-4 w-4" />,
    required: false,
    pathField: 'bhv_certificaat_path'
  },
  {
    type: 'tillift_certificaat',
    label: 'Tillift certificaat',
    description: 'Certificaat voor gebruik tillift (optioneel)',
    icon: <Car className="h-4 w-4" />,
    required: false,
    pathField: 'tillift_certificaat_path'
  }
];

interface ZZPDocumentUploadSectionProps {
  applicationId: string;
  werkvorm: string | null;
  // ZZP bedrijfsgegevens
  bedrijfsnaam?: string | null;
  kvkNummer?: string | null;
  iban?: string | null;
  // Document paths
  beroepsaansprakelijkheidPath?: string | null;
  kvkUittrekselPath?: string | null;
  klachtenportaalWkkgzPath?: string | null;
  identiteitsbewijsPath?: string | null;
  bhvCertificaatPath?: string | null;
  tilliftCertificaatPath?: string | null;
  overigeCertificeringenPaths?: string[] | null;
  onUploadComplete: () => void;
}

export function ZZPDocumentUploadSection({
  applicationId,
  werkvorm,
  bedrijfsnaam,
  kvkNummer,
  iban,
  beroepsaansprakelijkheidPath,
  kvkUittrekselPath,
  klachtenportaalWkkgzPath,
  identiteitsbewijsPath,
  bhvCertificaatPath,
  tilliftCertificaatPath,
  overigeCertificeringenPaths,
  onUploadComplete
}: ZZPDocumentUploadSectionProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [downloadingDoc, setDownloadingDoc] = useState<string | null>(null);
  const [previewingDoc, setPreviewingDoc] = useState<string | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  
  // Inline viewer state
  const [inlineViewerOpen, setInlineViewerOpen] = useState(false);
  const [inlineViewerUrl, setInlineViewerUrl] = useState<string | null>(null);
  const [inlineViewerType, setInlineViewerType] = useState<'pdf' | 'image'>('pdf');
  const [inlineViewerTitle, setInlineViewerTitle] = useState('');
  const [loadingInlineViewer, setLoadingInlineViewer] = useState(false);
  
  // Bedrijfsgegevens state
  const [localBedrijfsnaam, setLocalBedrijfsnaam] = useState(bedrijfsnaam || '');
  const [localKvkNummer, setLocalKvkNummer] = useState(kvkNummer || '');
  const [localIban, setLocalIban] = useState(iban || '');
  
  // File input refs
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const overigInputRef = useRef<HTMLInputElement>(null);

  // Only show for ZZP werkvorm
  if (werkvorm?.toLowerCase() !== 'zzp') {
    return null;
  }

  // Map document type to current path
  const getDocumentPath = (docType: ZZPDocumentType): string | null => {
    switch (docType) {
      case 'beroepsaansprakelijkheid': return beroepsaansprakelijkheidPath || null;
      case 'kvk_uittreksel': return kvkUittrekselPath || null;
      case 'klachtenportaal_wkkgz': return klachtenportaalWkkgzPath || null;
      case 'identiteitsbewijs': return identiteitsbewijsPath || null;
      case 'bhv_certificaat': return bhvCertificaatPath || null;
      case 'tillift_certificaat': return tilliftCertificaatPath || null;
      default: return null;
    }
  };

  const handleFileUpload = async (file: File, docType: ZZPDocumentType) => {
    setUploadingDoc(docType);

    try {
      // Validate file type
      const allowedTypes = [
        'application/pdf', 
        'image/jpeg', 
        'image/png', 
        'image/jpg',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Alleen PDF, JPEG, PNG of Word bestanden zijn toegestaan');
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
      const filePath = `${applicationId}/zzp/${docType}/${timestamp}_${sanitizedName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('zzp-documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        toast.error(`Upload mislukt: ${uploadError.message}`);
        return;
      }

      // Find the correct path field
      const docConfig = ZZP_DOCUMENTS.find(d => d.type === docType);
      if (!docConfig) return;

      // Update the application with the file path
      const { error: updateError } = await supabase
        .from('professional_applications')
        .update({ 
          [docConfig.pathField]: filePath,
          updated_at: new Date().toISOString()
        })
        .eq('id', applicationId);

      if (updateError) throw updateError;

      // Log audit event for upload
      await logDocumentAction({
        applicationId,
        documentType: docType,
        action: 'upload',
        filePath,
        metadata: { fileName: file.name, fileSize: file.size, mimeType: file.type }
      });

      toast.success(`${docConfig.label} geüpload`);
      onUploadComplete();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Fout bij uploaden');
    } finally {
      setUploadingDoc(null);
    }
  };

  const handleOverigUpload = async (file: File) => {
    setUploadingDoc('overig');

    try {
      const allowedTypes = [
        'application/pdf', 
        'image/jpeg', 
        'image/png', 
        'image/jpg',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Alleen PDF, JPEG, PNG of Word bestanden zijn toegestaan');
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        toast.error('Bestand is te groot (max 10MB)');
        return;
      }

      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `${applicationId}/zzp/overig/${timestamp}_${sanitizedName}`;

      const { error: uploadError } = await supabase.storage
        .from('zzp-documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        toast.error(`Upload mislukt: ${uploadError.message}`);
        return;
      }

      // Add to existing paths array
      const currentPaths = overigeCertificeringenPaths || [];
      const newPaths = [...currentPaths, filePath];

      const { error: updateError } = await supabase
        .from('professional_applications')
        .update({ 
          overige_certificeringen_paths: newPaths,
          updated_at: new Date().toISOString()
        })
        .eq('id', applicationId);

      if (updateError) throw updateError;

      // Log audit event for overig upload
      await logDocumentAction({
        applicationId,
        documentType: 'overig',
        action: 'upload',
        filePath,
        metadata: { fileName: file.name, fileSize: file.size, mimeType: file.type }
      });

      toast.success('Certificering toegevoegd');
      onUploadComplete();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Fout bij uploaden');
    } finally {
      setUploadingDoc(null);
    }
  };

  const handleDownload = async (filePath: string, docType: string) => {
    setDownloadingDoc(docType);

    try {
      // Use blob download to bypass browser blocking
      const { data: blobData, error: downloadError } = await supabase.storage
        .from('zzp-documents')
        .download(filePath);

      if (downloadError) throw downloadError;

      // Create blob URL and trigger download
      const url = URL.createObjectURL(blobData);
      const a = document.createElement('a');
      a.href = url;
      
      const filename = filePath.split('/').pop() || 'document';
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
      
      toast.success('Document gedownload');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Fout bij downloaden');
    } finally {
      setDownloadingDoc(null);
    }
  };

  const handlePreview = async (filePath: string, docType: string) => {
    setPreviewingDoc(docType);

    try {
      // Download as blob to bypass browser blocking
      const { data: blobData, error: downloadError } = await supabase.storage
        .from('zzp-documents')
        .download(filePath);

      if (downloadError) throw downloadError;

      // Determine MIME type for correct display
      const fileName = filePath.toLowerCase();
      let mimeType = 'application/pdf';
      if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
        mimeType = 'image/jpeg';
      } else if (fileName.endsWith('.png')) {
        mimeType = 'image/png';
      } else if (fileName.endsWith('.docx')) {
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
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
      console.error('Preview error:', error);
      toast.error('Fout bij openen document');
    } finally {
      setPreviewingDoc(null);
    }
  };

  // Inline preview handler - opens document in modal
  const handleInlinePreview = async (filePath: string, docLabel: string) => {
    setLoadingInlineViewer(true);
    
    try {
      const { data: blobData, error } = await supabase.storage
        .from('zzp-documents')
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
      } else if (fileName.endsWith('.docx')) {
        // DOCX files cannot be displayed inline, open in new tab instead
        toast.info('Word documenten kunnen niet inline bekeken worden');
        setLoadingInlineViewer(false);
        return;
      }

      const blob = new Blob([blobData], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      
      setInlineViewerUrl(blobUrl);
      setInlineViewerType(viewerType);
      setInlineViewerTitle(docLabel);
      setInlineViewerOpen(true);
      
      // Log audit event for inline preview
      await logDocumentAction({
        applicationId,
        documentType: docLabel.toLowerCase().replace(/ /g, '_'),
        action: 'inline_preview',
        filePath
      });
      
    } catch (error) {
      console.error('Inline preview error:', error);
      toast.error('Fout bij laden document');
    } finally {
      setLoadingInlineViewer(false);
    }
  };

  const handleDelete = async (docType: ZZPDocumentType) => {
    const filePath = getDocumentPath(docType);
    if (!filePath) return;

    try {
      await supabase.storage
        .from('zzp-documents')
        .remove([filePath]);

      const docConfig = ZZP_DOCUMENTS.find(d => d.type === docType);
      if (!docConfig) return;

      const { error: updateError } = await supabase
        .from('professional_applications')
        .update({ 
          [docConfig.pathField]: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', applicationId);

      if (updateError) throw updateError;

      // Log audit event for delete
      await logDocumentAction({
        applicationId,
        documentType: docType,
        action: 'delete',
        filePath
      });

      toast.success('Document verwijderd');
      onUploadComplete();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Fout bij verwijderen');
    }
  };

  const handleDeleteOverig = async (filePath: string) => {
    try {
      await supabase.storage
        .from('zzp-documents')
        .remove([filePath]);

      const currentPaths = overigeCertificeringenPaths || [];
      const newPaths = currentPaths.filter(p => p !== filePath);

      const { error: updateError } = await supabase
        .from('professional_applications')
        .update({ 
          overige_certificeringen_paths: newPaths,
          updated_at: new Date().toISOString()
        })
        .eq('id', applicationId);

      if (updateError) throw updateError;

      // Log audit event for delete overig
      await logDocumentAction({
        applicationId,
        documentType: 'overig',
        action: 'delete',
        filePath
      });

      toast.success('Certificering verwijderd');
      onUploadComplete();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Fout bij verwijderen');
    }
  };

  const handleSaveBedrijfsgegevens = async () => {
    setSavingDetails(true);
    try {
      const { error } = await supabase
        .from('professional_applications')
        .update({
          bedrijfsnaam: localBedrijfsnaam || null,
          iban: localIban || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', applicationId);

      if (error) throw error;

      // KVK nummer wordt opgeslagen in extracted_data
      const { data: currentApp } = await supabase
        .from('professional_applications')
        .select('extracted_data')
        .eq('id', applicationId)
        .single();

      const currentExtracted = (currentApp?.extracted_data as Record<string, unknown>) || {};
      const { error: updateError } = await supabase
        .from('professional_applications')
        .update({
          extracted_data: {
            ...currentExtracted,
            kvk_nummer: localKvkNummer || null
          }
        })
        .eq('id', applicationId);

      if (updateError) throw updateError;

      toast.success('Bedrijfsgegevens opgeslagen');
      onUploadComplete();
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Fout bij opslaan');
    } finally {
      setSavingDetails(false);
    }
  };

  // Calculate completeness
  const requiredDocs = ZZP_DOCUMENTS.filter(d => d.required);
  const completedRequiredDocs = requiredDocs.filter(d => getDocumentPath(d.type));
  const completenessPercent = Math.round((completedRequiredDocs.length / requiredDocs.length) * 100);

  return (
    <TooltipProvider>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card className="border-primary/30 bg-primary/5">
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 px-4 cursor-pointer hover:bg-primary/10 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm font-medium">ZZP Documenten & Gegevens</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge 
                    variant="outline" 
                    className={completenessPercent === 100 
                      ? "text-green-600 border-green-300" 
                      : "text-amber-600 border-amber-300"
                    }
                  >
                    {completenessPercent}% compleet
                  </Badge>
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-6">
              {/* Bedrijfsgegevens sectie */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  Bedrijfsgegevens
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bedrijfsnaam">Bedrijfsnaam *</Label>
                    <Input
                      id="bedrijfsnaam"
                      placeholder="Bijv. Zorg & Co"
                      value={localBedrijfsnaam}
                      onChange={(e) => setLocalBedrijfsnaam(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="kvk">KVK nummer *</Label>
                    <Input
                      id="kvk"
                      placeholder="12345678"
                      value={localKvkNummer}
                      onChange={(e) => setLocalKvkNummer(e.target.value)}
                      maxLength={8}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="iban">IBAN nummer *</Label>
                    <Input
                      id="iban"
                      placeholder="NL00BANK0123456789"
                      value={localIban}
                      onChange={(e) => setLocalIban(e.target.value.toUpperCase())}
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={handleSaveBedrijfsgegevens}
                  disabled={savingDetails}
                >
                  {savingDetails ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Opslaan...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Gegevens opslaan
                    </>
                  )}
                </Button>
              </div>

              {/* Verplichte documenten */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Verplichte documenten
                </h4>
                <div className="grid gap-3">
                  {ZZP_DOCUMENTS.filter(d => d.required).map((doc) => {
                    const filePath = getDocumentPath(doc.type);
                    const isUploading = uploadingDoc === doc.type;
                    const isDownloading = downloadingDoc === doc.type;
                    const isPreviewing = previewingDoc === doc.type;

                    return (
                      <div 
                        key={doc.type}
                        className="flex items-center justify-between p-3 rounded-lg border bg-background"
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-muted-foreground">{doc.icon}</div>
                          <div>
                            <p className="text-sm font-medium">{doc.label}</p>
                            <p className="text-xs text-muted-foreground">{doc.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {filePath ? (
                            <>
                              <Badge variant="outline" className="text-green-600 border-green-300">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Aanwezig
                              </Badge>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleInlinePreview(filePath, doc.label)}
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
                                    onClick={() => handlePreview(filePath, doc.type)}
                                    disabled={isPreviewing}
                                  >
                                    {isPreviewing ? (
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
                                    onClick={() => handleDownload(filePath, doc.type)}
                                    disabled={isDownloading}
                                  >
                                    {isDownloading ? (
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
                                    onClick={() => handleDelete(doc.type)}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Verwijderen</TooltipContent>
                              </Tooltip>
                            </>
                          ) : (
                            <>
                              <Badge variant="outline" className="text-destructive border-destructive/30">
                                Ontbreekt
                              </Badge>
                              <input
                                type="file"
                                ref={(el) => { fileInputRefs.current[doc.type] = el; }}
                                className="hidden"
                                accept=".pdf,.jpg,.jpeg,.png,.docx"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleFileUpload(file, doc.type);
                                  e.target.value = '';
                                }}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => fileInputRefs.current[doc.type]?.click()}
                                disabled={isUploading}
                              >
                                {isUploading ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Upload className="h-4 w-4 mr-1" />
                                    Upload
                                  </>
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Optionele documenten */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Optionele documenten
                </h4>
                <div className="grid gap-3">
                  {ZZP_DOCUMENTS.filter(d => !d.required).map((doc) => {
                    const filePath = getDocumentPath(doc.type);
                    const isUploading = uploadingDoc === doc.type;
                    const isDownloading = downloadingDoc === doc.type;
                    const isPreviewing = previewingDoc === doc.type;

                    return (
                      <div 
                        key={doc.type}
                        className="flex items-center justify-between p-3 rounded-lg border bg-background/50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-muted-foreground">{doc.icon}</div>
                          <div>
                            <p className="text-sm font-medium">{doc.label}</p>
                            <p className="text-xs text-muted-foreground">{doc.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {filePath ? (
                            <>
                              <Badge variant="outline" className="text-green-600 border-green-300">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Aanwezig
                              </Badge>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleInlinePreview(filePath, doc.label)}
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
                                    onClick={() => handlePreview(filePath, doc.type)}
                                    disabled={isPreviewing}
                                  >
                                    {isPreviewing ? (
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
                                    onClick={() => handleDownload(filePath, doc.type)}
                                    disabled={isDownloading}
                                  >
                                    {isDownloading ? (
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
                                    onClick={() => handleDelete(doc.type)}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Verwijderen</TooltipContent>
                              </Tooltip>
                            </>
                          ) : (
                            <>
                              <input
                                type="file"
                                ref={(el) => { fileInputRefs.current[doc.type] = el; }}
                                className="hidden"
                                accept=".pdf,.jpg,.jpeg,.png,.docx"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleFileUpload(file, doc.type);
                                  e.target.value = '';
                                }}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => fileInputRefs.current[doc.type]?.click()}
                                disabled={isUploading}
                              >
                                {isUploading ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Upload className="h-4 w-4 mr-1" />
                                    Upload
                                  </>
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Overige certificeringen */}
                  <div className="p-3 rounded-lg border bg-background/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Plus className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Overige certificeringen</p>
                          <p className="text-xs text-muted-foreground">Extra certificaten of diploma's</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          ref={overigInputRef}
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png,.docx"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleOverigUpload(file);
                            e.target.value = '';
                          }}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => overigInputRef.current?.click()}
                          disabled={uploadingDoc === 'overig'}
                        >
                          {uploadingDoc === 'overig' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Plus className="h-4 w-4 mr-1" />
                              Toevoegen
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                    
                    {/* List of uploaded overige certificeringen */}
                    {overigeCertificeringenPaths && overigeCertificeringenPaths.length > 0 && (
                      <div className="space-y-2 pt-2 border-t">
                        {overigeCertificeringenPaths.map((path, index) => (
                          <div key={path} className="flex items-center justify-between p-2 rounded bg-muted/50">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm truncate max-w-[200px]">
                                {path.split('/').pop()}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleInlinePreview(path, `Certificering ${index + 1}`)}
                                disabled={loadingInlineViewer}
                              >
                                {loadingInlineViewer ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handlePreview(path, `overig-preview-${index}`)}
                                disabled={previewingDoc === `overig-preview-${index}`}
                              >
                                {previewingDoc === `overig-preview-${index}` ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <ExternalLink className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownload(path, `overig-${index}`)}
                                disabled={downloadingDoc === `overig-${index}`}
                              >
                                {downloadingDoc === `overig-${index}` ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Download className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteOverig(path)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

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
