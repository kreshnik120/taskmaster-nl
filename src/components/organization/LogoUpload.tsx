import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Upload, X, Loader2 } from "lucide-react";

interface LogoUploadProps {
  organizationId: string;
  organizationName: string;
  currentLogoUrl: string | null;
  onLogoUpdate: (newUrl: string | null) => void;
}

export function LogoUpload({
  organizationId,
  organizationName,
  currentLogoUrl,
  onLogoUpdate,
}: LogoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentLogoUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(word => word[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Selecteer een afbeelding");
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Afbeelding mag maximaal 2MB zijn");
      return;
    }

    setIsUploading(true);

    try {
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Upload to Supabase Storage
      const fileExt = file.name.split(".").pop();
      const fileName = `${organizationId}_logo.${fileExt}`;
      const filePath = `organization-logos/${fileName}`;

      // Delete existing logo if present
      if (currentLogoUrl) {
        const oldPath = currentLogoUrl.split("/").pop();
        if (oldPath) {
          await supabase.storage
            .from("organization-logos")
            .remove([`organization-logos/${oldPath}`]);
        }
      }

      const { error: uploadError } = await supabase.storage
        .from("organization-logos")
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        toast.error("Upload mislukt");
        setPreviewUrl(currentLogoUrl);
        return;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("organization-logos")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      // Update organization record
      const { error: updateError } = await supabase
        .from("client_organizations")
        .update({ logo_url: publicUrl })
        .eq("id", organizationId);

      if (updateError) {
        console.error("Update error:", updateError);
        toast.error("Database update mislukt");
        return;
      }

      onLogoUpdate(publicUrl);
      toast.success("Logo geüpload");

    } catch (error) {
      console.error("Logo upload error:", error);
      toast.error("Er ging iets mis");
      setPreviewUrl(currentLogoUrl);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!currentLogoUrl) return;

    setIsUploading(true);
    try {
      // Remove from storage
      const fileName = currentLogoUrl.split("/").pop();
      if (fileName) {
        await supabase.storage
          .from("organization-logos")
          .remove([`organization-logos/${fileName}`]);
      }

      // Update organization record
      const { error } = await supabase
        .from("client_organizations")
        .update({ logo_url: null })
        .eq("id", organizationId);

      if (error) {
        toast.error("Verwijderen mislukt");
        return;
      }

      setPreviewUrl(null);
      onLogoUpdate(null);
      toast.success("Logo verwijderd");

    } catch (error) {
      console.error("Remove logo error:", error);
      toast.error("Er ging iets mis");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative group">
        <Avatar className="h-16 w-16 border-2 border-border">
          <AvatarImage src={previewUrl || undefined} alt={organizationName} className="object-contain" />
          <AvatarFallback className="text-lg bg-primary/10 text-primary">
            {getInitials(organizationName)}
          </AvatarFallback>
        </Avatar>
        
        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-full">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          <Upload className="h-4 w-4 mr-2" />
          {previewUrl ? "Wijzig logo" : "Upload logo"}
        </Button>

        {previewUrl && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemoveLogo}
            disabled={isUploading}
            className="text-destructive hover:text-destructive"
          >
            <X className="h-4 w-4 mr-2" />
            Verwijder
          </Button>
        )}
      </div>
    </div>
  );
}
