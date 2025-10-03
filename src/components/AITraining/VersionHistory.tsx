import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { History, RotateCcw, Loader2, Clock, User, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Version {
  id: string;
  version_number: number;
  category: string;
  key: string;
  value: any;
  confidence_score: number;
  change_type: string;
  changed_by: string | null;
  change_reason: string | null;
  created_at: string;
}

interface VersionHistoryProps {
  knowledgeId: string;
  currentCategory: string;
  currentKey: string;
}

export function VersionHistory({ knowledgeId, currentCategory, currentKey }: VersionHistoryProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      loadVersions();
    }
  }, [isOpen, knowledgeId]);

  const loadVersions = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('ai_knowledge_versions')
        .select('*')
        .eq('knowledge_id', knowledgeId)
        .order('version_number', { ascending: false });

      if (error) throw error;
      setVersions(data || []);
    } catch (error: any) {
      console.error('Error loading versions:', error);
      toast({
        title: "Fout bij laden",
        description: "Kon versiegeschiedenis niet laden",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRollback = async (versionNumber: number) => {
    setIsRollingBack(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Niet ingelogd');

      const { data, error } = await supabase.functions.invoke('rollback-knowledge', {
        body: { knowledgeId, versionNumber }
      });

      if (error) throw error;

      toast({
        title: "✅ Teruggedraaid",
        description: `Succesvol teruggerold naar versie ${versionNumber}`,
      });

      setIsOpen(false);
      window.location.reload(); // Refresh to show updated data
    } catch (error: any) {
      console.error('Error rolling back:', error);
      toast({
        title: "Fout bij terugdraaien",
        description: error.message || "Kon niet terugdraaien naar deze versie",
        variant: "destructive",
      });
    } finally {
      setIsRollingBack(false);
    }
  };

  const getChangeTypeColor = (changeType: string) => {
    switch (changeType) {
      case 'created': return 'bg-green-500/10 text-green-700 dark:text-green-400';
      case 'updated': return 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
      case 'deleted': return 'bg-red-500/10 text-red-700 dark:text-red-400';
      case 'restored': return 'bg-purple-500/10 text-purple-700 dark:text-purple-400';
      case 'auto_resolved': return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400';
      case 'ai_suggested': return 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400';
      default: return 'bg-gray-500/10 text-gray-700 dark:text-gray-400';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <History className="h-4 w-4 mr-2" />
          Versiegeschiedenis
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Versiegeschiedenis</DialogTitle>
          <DialogDescription>
            {currentCategory} / {currentKey}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : versions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Geen versiegeschiedenis beschikbaar
          </div>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-4">
              {versions.map((version, index) => (
                <Card key={version.id} className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="font-mono">
                        v{version.version_number}
                      </Badge>
                      <Badge className={getChangeTypeColor(version.change_type)}>
                        {version.change_type}
                      </Badge>
                      {index === 0 && (
                        <Badge className="bg-primary/10 text-primary">
                          Huidige versie
                        </Badge>
                      )}
                    </div>
                    {index > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRollback(version.version_number)}
                        disabled={isRollingBack}
                      >
                        {isRollingBack ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Terugdraaien
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      {new Date(version.created_at).toLocaleString('nl-NL')}
                    </div>

                    {version.changed_by && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <User className="h-4 w-4" />
                        {version.changed_by === 'ai_automated_review' ? 'AI Automated Review' :
                         version.changed_by === 'ai_auto_cleanup' ? 'AI Auto Cleanup' :
                         version.changed_by}
                      </div>
                    )}

                    {version.change_reason && (
                      <div className="flex items-start gap-2 text-muted-foreground">
                        <FileText className="h-4 w-4 mt-0.5" />
                        <span>{version.change_reason}</span>
                      </div>
                    )}

                    <div className="mt-3 p-3 bg-muted/50 rounded-md">
                      <div className="text-xs text-muted-foreground mb-1">Waarde:</div>
                      <pre className="text-xs whitespace-pre-wrap">
                        {JSON.stringify(version.value, null, 2)}
                      </pre>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Confidence: {(version.confidence_score * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
