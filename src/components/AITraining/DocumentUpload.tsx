import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Loader2, CheckCircle, XCircle, AlertCircle, FolderOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB

export const DocumentUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isFirefox, setIsFirefox] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    // Detect Firefox browser
    setIsFirefox(/firefox/i.test(navigator.userAgent));
  }, []);

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

  // Auto-refresh for processing or failed documents
  useEffect(() => {
    const hasActiveProcessing = documents?.some(doc => 
      ["failed", "processing"].includes(doc.status) && !doc.processed_at
    );
    if (!hasActiveProcessing) return;

    const interval = setInterval(() => {
      refetch();
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(interval);
  }, [documents, refetch]);

  // Calculate elapsed time in minutes
  const getElapsedTime = (createdAt: string) => {
    const now = new Date().getTime();
    const created = new Date(createdAt).getTime();
    const diffMs = now - created;
    return Math.floor(diffMs / 60000);
  };

  const processFiles = async (files: FileList | File[], folderName?: string) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    const fileArray = Array.from(files);
    
    toast({
      title: folderName ? `Map "${folderName}" uploaden...` : "Uploading documenten...",
      description: `Bezig met uploaden van ${fileArray.length} document(en)`,
    });

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Niet ingelogd");

      const { data: orgData } = await supabase
        .from("user_organizations")
        .select("org_id")
        .eq("user_id", user.id)
        .single();

      if (!orgData) throw new Error("Geen organisatie gevonden");

      let successCount = 0;
      const uploadedPaths: string[] = [];
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          toast({
            title: "Bestand te groot",
            description: `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum is 500MB.`,
            variant: "destructive",
          });
          continue;
        }

        // Validate file type
        const validTypes = ['.pdf', '.docx', '.xlsx', '.xls', '.txt', '.md'];
        const fileExt = '.' + file.name.split(".").pop()?.toLowerCase();
        if (!validTypes.includes(fileExt)) {
          toast({
            title: "Ongeldig bestandstype",
            description: `${file.name} wordt niet ondersteund. Gebruik PDF, DOCX, XLSX, XLS, TXT of MD bestanden.`,
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

        // Extract relative path for folder uploads
        const relativePath = (file as any).webkitRelativePath || file.name;
        const pathParts = relativePath.split('/');
        const relativePathWithoutRoot = pathParts.length > 1 
          ? pathParts.slice(1).join('/') 
          : file.name;

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
          relative_path: folderName ? relativePathWithoutRoot : null,
          original_folder: folderName || null,
        });

        if (dbError) throw dbError;
        successCount++;

        const invokeResult = await supabase.functions.invoke("process-training-document", {
          body: { filePath, fileName: file.name },
        });
        
        if (invokeResult.data?.filePath) {
          uploadedPaths.push(invokeResult.data.filePath);
        } else {
          uploadedPaths.push(filePath);
        }
      }

      toast({
        title: "Upload succesvol",
        description: folderName 
          ? `${successCount} document(en) uit map "${folderName}" worden verwerkt`
          : `${successCount} document(en) worden verwerkt`,
      });
      
      // 🔄 POLL FOR COMPLETION & FORCE REFRESH
      console.log('[UPLOAD] Waiting for processing to complete...');
      let pollAttempts = 0;
      const maxPollAttempts = 30;

      while (pollAttempts < maxPollAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 sec
        
        const { data: docs } = await supabase
          .from("training_documents")
          .select("file_path, status")
          .in("file_path", uploadedPaths);
        
        const allCompleted = docs?.every(d => d.status === 'completed' || d.status === 'failed');
        
        if (allCompleted) {
          console.log('[UPLOAD] All documents processed, refreshing knowledge base...');
          // Force refresh knowledge base
          queryClient.invalidateQueries({ queryKey: ["ai-knowledge"] });
          refetch();
          break;
        }
        
        pollAttempts++;
      }

      if (pollAttempts >= maxPollAttempts) {
        console.warn('[UPLOAD] Polling timeout, knowledge base may not be refreshed yet');
      }
      
      // Initial refresh
      refetch();
      queryClient.invalidateQueries({ queryKey: ["ai-knowledge"] });
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload mislukt",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await processFiles(files);
    event.target.value = "";
  };

  const handleFolderUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Extract folder name from first file's webkitRelativePath
    const firstFile = files[0] as any;
    const folderName = firstFile.webkitRelativePath?.split('/')[0] || 'Onbekend';

    await processFiles(files, folderName);
    event.target.value = "";
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    await processFiles(files);
  };

  const forceStopStuckDocuments = async () => {
    setReprocessing(true);
    try {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      
      const { data: stuckDocs, error } = await supabase
        .from("training_documents")
        .select("*")
        .eq("status", "processing")
        .is("processed_at", null)
        .lt("created_at", twoMinutesAgo);

      if (error) throw error;
      if (!stuckDocs || stuckDocs.length === 0) {
        toast({
          title: "Geen vastgelopen documenten",
          description: "Alle documenten worden normaal verwerkt.",
        });
        return;
      }

      // Update status to failed first
      const { error: updateError } = await supabase
        .from("training_documents")
        .update({ 
          status: "failed",
          error_message: "Manually failed (stuck watchdog)",
          processing_progress: 100
        })
        .in("id", stuckDocs.map(d => d.id));

      if (updateError) throw updateError;

      toast({
        title: "Forceer stoppen gestart",
        description: `${stuckDocs.length} vastgelopen document(en) worden gestopt en herverwerkt`,
      });

      // Now reprocess them
      for (const doc of stuckDocs) {
        await supabase
          .from("training_documents")
          .update({ 
            status: "processing",
            processing_progress: 0,
            error_message: null
          })
          .eq("id", doc.id);
          
        await supabase.functions.invoke("process-training-document", {
          body: { filePath: doc.file_path, fileName: doc.file_name },
        });
      }

      refetch();
    } catch (error: any) {
      console.error("Force stop error:", error);
      toast({
        title: "Forceer stoppen mislukt",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setReprocessing(false);
    }
  };

  const reprocessFailedDocuments = async () => {
    setReprocessing(true);
    try {
      const { data: failedDocs, error } = await supabase
        .from("training_documents")
        .select("*")
        .or('and(status.eq.failed,processed_at.is.null),and(status.eq.processing,processed_at.is.null),and(status.eq.completed,extracted_knowledge_count.eq.0)');

      if (error) throw error;
      if (!failedDocs || failedDocs.length === 0) {
        toast({
          title: "Geen documenten om te herverwerken",
          description: "Alle documenten zijn succesvol verwerkt.",
        });
        return;
      }

      toast({
        title: "Herverwerken gestart",
        description: `${failedDocs.length} document(en) worden opnieuw verwerkt met Vision API`,
      });

      for (const doc of failedDocs) {
        // Reset status to "processing" before reprocessing
        await supabase
          .from("training_documents")
          .update({ 
            status: "processing",
            processing_progress: 0 
          })
          .eq("id", doc.id);
          
        await supabase.functions.invoke("process-training-document", {
          body: { filePath: doc.file_path, fileName: doc.file_name },
        });
      }

      toast({
        title: "Herverwerking succesvol",
        description: `${failedDocs.length} document(en) worden nu verwerkt`,
      });
      
      refetch();
    } catch (error: any) {
      console.error("Reprocess error:", error);
      toast({
        title: "Herverwerking mislukt",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setReprocessing(false);
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

  // Calculate failed/processing documents count (single source of truth)
  const failedDocsCount = documents?.filter(doc => 
    ["failed", "processing"].includes(doc.status) && !doc.processed_at
  ).length || 0;

  // Calculate stuck documents count
  const stuckDocsCount = documents?.filter(doc => {
    const elapsedMin = getElapsedTime(doc.created_at);
    return doc.status === "processing" && !doc.processed_at && elapsedMin > 2;
  }).length || 0;

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

          {isFirefox && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Map upload wordt niet ondersteund in Firefox. Gebruik Chrome, Edge of Safari, of selecteer individuele bestanden.
              </AlertDescription>
            </Alert>
          )}

          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${
              isDragging 
                ? 'border-primary bg-primary/5 scale-[1.02]' 
                : 'border-border hover:border-primary/50'
            }`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload className={`h-12 w-12 mx-auto mb-4 transition-colors ${
              isDragging ? 'text-primary' : 'text-muted-foreground'
            }`} />
            <p className="text-sm text-muted-foreground mb-4">
              {isDragging ? 'Laat bestanden los om te uploaden' : 'Sleep documenten hierheen of klik om te uploaden'}
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Ondersteunde formaten: PDF, DOCX, TXT, MD (max 500MB)
            </p>
            <p className="text-xs text-amber-600 mb-4 flex items-center justify-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Bestanden &gt;100MB worden verwerkt in achtergrond
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <input
                type="file"
                onChange={handleFileUpload}
                multiple
                accept=".pdf,.docx,.txt,.md"
                className="hidden"
                id="file-upload"
                disabled={uploading}
              />
              <Button asChild disabled={uploading} variant="default">
                <label htmlFor="file-upload" className="cursor-pointer">
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Selecteer bestanden
                    </>
                  )}
                </label>
              </Button>

              {!isFirefox && (
                <>
                  <input
                    type="file"
                    onChange={handleFolderUpload}
                    /* @ts-ignore - webkitdirectory is not in TS types but widely supported */
                    webkitdirectory="true"
                    multiple
                    className="hidden"
                    id="folder-upload"
                    disabled={uploading}
                  />
                  <Button asChild disabled={uploading} variant="outline">
                    <label htmlFor="folder-upload" className="cursor-pointer">
                      {uploading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <FolderOpen className="h-4 w-4 mr-2" />
                          Kies Map
                        </>
                      )}
                    </label>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Geüploade Documenten</h3>
          {(failedDocsCount > 0 || stuckDocsCount > 0) && (
            <div className="flex gap-2">
              {stuckDocsCount > 0 && (
                <Button 
                  onClick={forceStopStuckDocuments} 
                  disabled={reprocessing}
                  variant="destructive"
                  size="sm"
                >
                  {reprocessing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Stoppen...
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-4 w-4 mr-2" />
                      Forceer Stoppen ({stuckDocsCount})
                    </>
                  )}
                </Button>
              )}
              {failedDocsCount > 0 && (
                <Button 
                  onClick={reprocessFailedDocuments} 
                  disabled={reprocessing}
                  variant="outline"
                  size="sm"
                >
                  {reprocessing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Herverwerken...
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-4 w-4 mr-2" />
                      Herverwerk Gefaalde ({failedDocsCount})
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="space-y-2">
          {documents && documents.length > 0 ? (
            documents.map((doc) => {
              const elapsedMin = getElapsedTime(doc.created_at);
              const isStuck = doc.status === "processing" && !doc.processed_at && elapsedMin > 2;
              
              return (
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
                      {doc.status === "processing" && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            Processing sinds {elapsedMin} min
                          </span>
                          {isStuck && (
                            <Badge variant="destructive" className="text-xs">
                              mogelijk vastgelopen
                            </Badge>
                          )}
                        </div>
                      )}
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
              );
            })
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
