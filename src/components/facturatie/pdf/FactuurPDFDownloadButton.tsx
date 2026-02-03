import { useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { FactuurPDFDocument } from './FactuurPDFDocument';
import { useFacturatieInstellingen } from '@/hooks/facturatie';
import type { FactuurWithDetails } from '@/types/facturatie';

interface FactuurPDFDownloadButtonProps {
  factuur: FactuurWithDetails;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export function FactuurPDFDownloadButton({
  factuur,
  variant = 'outline',
  size = 'default',
  className,
}: FactuurPDFDownloadButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const { data: instellingen } = useFacturatieInstellingen();

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      // Generate PDF blob
      const blob = await pdf(
        <FactuurPDFDocument factuur={factuur} instellingen={instellingen || null} />
      ).toBlob();

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${factuur.factuur_nummer}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('PDF gedownload', {
        description: `${factuur.factuur_nummer}.pdf`,
      });
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error('PDF genereren mislukt', {
        description: 'Probeer het opnieuw',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleDownload}
      disabled={isGenerating}
      className={className}
    >
      {isGenerating ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Genereren...
        </>
      ) : (
        <>
          <Download className="h-4 w-4 mr-2" />
          Download PDF
        </>
      )}
    </Button>
  );
}
