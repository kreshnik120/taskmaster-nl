import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB

export const DocumentUpload = () => {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const { data: documents, refetch } = useQuery({
    queryKey: ["training-documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_documents")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Auto-refresh for processing documents
  useEffect(() => {
    const hasProcessing = documents?.some(doc => doc.status === "processing");
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      refetch();
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [documents, refetch]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Niet ingelogd");

      const { data: orgData } = await supabase
        .from("user_organizations")
        .select("org_id")
        .eq("user_id", user.id)
        .single();

      if (!orgData) throw new Error("Geen organisatie gevonden");

      for (const file of Array.from(files)) {
        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          toast({
            title: "Bestand te groot",
            description: `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum is 500MB.`,
            variant: "destructive",
          });
          continue;
        }

        // Show warning for large files
        if (file.size > LARGE_FILE_THRESHOLD) {
          toast({
            title: "Groot bestand gedetecteerd",
            description: `${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB) wordt verwerkt in achtergrond. Dit kan enkele minuten duren.`,
          });
        }

        const fileExt = file.name.split(".").pop();
        const filePath = `${user.id}/${Date.now()}_${file.name}`;

        const { error: uploadError } = await supabase.storage
          .from("training-documents")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { error: dbError } = await supabase.from("training_documents").insert({
          user_id: user.id,
          org_id: orgData.org_id,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          mime_type: file.type,
          status: "processing",
          processing_progress: 0,
        });

        if (dbError) throw dbError;

        await supabase.functions.invoke("process-training-document", {
          body: { filePath, fileName: file.name },
        });
      }

      toast({
        title: "Documenten geüpload",
        description: "De documenten worden verwerkt...",
      });
      refetch();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload mislukt",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-2">Document Upload</h2>
            <p className="text-sm text-muted-foreground">
              Upload bedrijfsdocumenten om het AI systeem automatisch te trainen
            </p>
          </div>

          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-4">
              Sleep documenten hierheen of klik om te uploaden
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Ondersteunde formaten: PDF, DOCX, TXT, MD (max 500MB)
            </p>
            <p className="text-xs text-amber-600 mb-4 flex items-center justify-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Bestanden &gt;100MB worden verwerkt in achtergrond
            </p>
            <Button disabled={uploading} asChild>
              <label className="cursor-pointer">
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploaden...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Selecteer bestanden
                  </>
                )}
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt,.md"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Geüploade Documenten</h3>
        <div className="space-y-2">
          {documents && documents.length > 0 ? (
            documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3 flex-1">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{doc.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(doc.created_at).toLocaleDateString("nl-NL")}
                      {doc.extracted_knowledge_count > 0 &&
                        ` • ${doc.extracted_knowledge_count} kennis items`}
                    </p>
                    {doc.status === "processing" && doc.processing_progress > 0 && (
                      <div className="mt-2 space-y-1">
                        <Progress value={doc.processing_progress} className="h-1" />
                        <p className="text-xs text-muted-foreground">
                          {doc.processing_progress}% verwerkt
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(doc.status)}
                  <span className="text-xs text-muted-foreground capitalize">
                    {doc.status}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nog geen documenten geüpload
            </p>
          )}
        </div>
      </Card>
    </div>
  );
};
