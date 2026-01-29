import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X } from "lucide-react";

interface WhatsAppImageLightboxProps {
  imageUrl: string;
  onClose: () => void;
}

export function WhatsAppImageLightbox({ imageUrl, onClose }: WhatsAppImageLightboxProps) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 bg-black/95 border-none overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          aria-label="Sluiten"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex items-center justify-center w-full h-full p-4">
          <img
            src={imageUrl}
            alt="WhatsApp afbeelding"
            className="max-w-full max-h-[85vh] object-contain rounded"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
