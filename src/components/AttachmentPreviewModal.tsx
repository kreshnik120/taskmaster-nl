import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, X, FileText, Loader2, ExternalLink, ZoomIn, ZoomOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getFileCategory, getFileCategoryLabel, canPreview } from "@/lib/fileHelpers";
import { cn } from "@/lib/utils";

interface Attachment {
  id: string;
  name: string;
  url: string;
  created_at?: string;
}

interface AttachmentPreviewModalProps {
  attachment: Attachment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload: () => void;
}

export function AttachmentPreviewModal({
  attachment,
  open,
  onOpenChange,
  onDownload
}: AttachmentPreviewModalProps) {
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const fileCategory = attachment ? getFileCategory(attachment.name) : 'other';
  const isPreviewable = attachment ? canPreview(attachment.name) : false;

  useEffect(() => {
    if (attachment && open) {
      loadPreviewUrl();
    }
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [attachment, open]);

  // Reset zoom when modal opens/closes
  useEffect(() => {
    if (!open) {
      setZoom(1);
    }
  }, [open]);

  const loadPreviewUrl = async () => {
    if (!attachment) return;
    
    setLoading(true);
    setError(null);

    try {
      const { data, error: downloadError } = await supabase.storage
        .from('task-attachments')
        .download(attachment.url);

      if (downloadError) throw downloadError;

      const url = URL.createObjectURL(data);
      setPreviewUrl(url);
    } catch (err: any) {
      console.error('Error loading preview:', err);
      setError('Kon bestand niet laden voor preview');
    } finally {
      setLoading(false);
    }
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));

  if (!attachment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-4 border-b bg-muted/30">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <DialogTitle className="text-lg font-semibold truncate">
                {attachment.name}
              </DialogTitle>
              <Badge variant="secondary" className="shrink-0">
                {getFileCategoryLabel(fileCategory)}
              </Badge>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {fileCategory === 'image' && (
                <>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handleZoomOut}
                    disabled={zoom <= 0.5}
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground w-12 text-center">
                    {Math.round(zoom * 100)}%
                  </span>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handleZoomIn}
                    disabled={zoom >= 3}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </>
              )}
              <Button variant="outline" onClick={onDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
          <DialogDescription className="sr-only">
            Bekijk bestand: {attachment.name}
          </DialogDescription>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-muted/10 min-h-[400px] max-h-[calc(90vh-100px)]">
          {loading ? (
            <div className="flex items-center justify-center h-full min-h-[400px]">
              <div className="text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground">Bestand laden...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full min-h-[400px]">
              <div className="text-center space-y-4 p-8">
                <FileText className="h-16 w-16 mx-auto text-muted-foreground/50" />
                <p className="text-muted-foreground">{error}</p>
                <Button onClick={onDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download bestand
                </Button>
              </div>
            </div>
          ) : isPreviewable && previewUrl ? (
            <>
              {fileCategory === 'image' && (
                <div className="flex items-center justify-center p-4 overflow-auto h-full">
                  <img
                    src={previewUrl}
                    alt={attachment.name}
                    className="max-w-full object-contain transition-transform duration-200"
                    style={{ transform: `scale(${zoom})` }}
                  />
                </div>
              )}
              {fileCategory === 'pdf' && (
                <iframe
                  src={previewUrl}
                  className="w-full h-full min-h-[500px]"
                  title={attachment.name}
                />
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full min-h-[400px]">
              <div className="text-center space-y-4 p-8 max-w-md">
                <FileText className="h-16 w-16 mx-auto text-muted-foreground/50" />
                <div className="space-y-2">
                  <p className="font-medium">Preview niet beschikbaar</p>
                  <p className="text-sm text-muted-foreground">
                    Dit bestandstype ({getFileCategoryLabel(fileCategory)}) kan niet in de browser worden weergegeven.
                  </p>
                </div>
                <Button onClick={onDownload} size="lg">
                  <Download className="h-4 w-4 mr-2" />
                  Download om te bekijken
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
