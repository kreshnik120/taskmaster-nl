import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Shield, Calendar, MapPin, Users, Lock, Layers, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const Week1To2TestPanel = () => {
  // Fetch knowledge items with Week 1-2 metadata
  const { data: knowledgeItems } = useQuery({
    queryKey: ['week1-2-knowledge'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_knowledge_base')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data;
    }
  });

  // Calculate Week 1-2 stats
  const stats = {
    total: knowledgeItems?.length || 0,
    withChunks: knowledgeItems?.filter(k => k.chunk_id).length || 0,
    withPII: knowledgeItems?.filter(k => k.original_text && k.redacted_text).length || 0,
    withValidity: knowledgeItems?.filter(k => k.valid_from).length || 0,
    withJurisdiction: knowledgeItems?.filter(k => k.jurisdiction).length || 0,
    withRoleTags: knowledgeItems?.filter(k => k.role_tags?.length > 0).length || 0,
    withACL: knowledgeItems?.filter(k => k.acl && (Array.isArray(k.acl) ? k.acl.length > 0 : Object.keys(k.acl).length > 0)).length || 0,
    byConfidentiality: knowledgeItems?.reduce((acc, k) => {
      const level = k.confidentiality || 'unknown';
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  };

  const chunkItems = knowledgeItems?.filter(k => k.chunk_id) || [];
  const piiItems = knowledgeItems?.filter(k => k.original_text && k.redacted_text) || [];
  const metadataItems = knowledgeItems?.filter(k => k.valid_from || k.jurisdiction || k.confidentiality) || [];

  const getConfidentialityColor = (level: string) => {
    switch (level) {
      case 'publiek': return 'bg-green-500/10 text-green-700 border-green-500/20';
      case 'intern': return 'bg-blue-500/10 text-blue-700 border-blue-500/20';
      case 'vertrouwelijk': return 'bg-orange-500/10 text-orange-700 border-orange-500/20';
      case 'strikt_vertrouwelijk': return 'bg-red-500/10 text-red-700 border-red-500/20';
      default: return 'bg-gray-500/10 text-gray-700 border-gray-500/20';
    }
  };

  return (
    <div className="space-y-6">
      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>Week 1-2 Features Test Panel</AlertTitle>
        <AlertDescription>
          Dit panel toont alle Week 1-2 features: Smart Chunking, PII Redactie, Metadata (validity, jurisdiction, confidentiality, role_tags, ACL)
        </AlertDescription>
      </Alert>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Layers className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Met Chunks</p>
              <p className="text-2xl font-bold">{stats.withChunks}</p>
              <p className="text-xs text-muted-foreground">{((stats.withChunks / stats.total) * 100).toFixed(0)}%</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-xs text-muted-foreground">PII Redacted</p>
              <p className="text-2xl font-bold">{stats.withPII}</p>
              <p className="text-xs text-muted-foreground">{((stats.withPII / stats.total) * 100).toFixed(0)}%</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-xs text-muted-foreground">Met Validity</p>
              <p className="text-2xl font-bold">{stats.withValidity}</p>
              <p className="text-xs text-muted-foreground">{((stats.withValidity / stats.total) * 100).toFixed(0)}%</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-purple-600" />
            <div>
              <p className="text-xs text-muted-foreground">Met ACL</p>
              <p className="text-2xl font-bold">{stats.withACL}</p>
              <p className="text-xs text-muted-foreground">{((stats.withACL / stats.total) * 100).toFixed(0)}%</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Confidentiality Distribution */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Confidentiality Levels
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Object.entries(stats.byConfidentiality || {}).map(([level, count]) => (
            <div key={level} className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground capitalize mb-1">
                {level.replace(/_/g, ' ')}
              </p>
              <p className="text-xl font-bold">{count}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Detailed Tabs */}
      <Tabs defaultValue="chunks" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="chunks">🧩 Chunks</TabsTrigger>
          <TabsTrigger value="pii">🛡️ PII Redactie</TabsTrigger>
          <TabsTrigger value="metadata">📋 Metadata</TabsTrigger>
        </TabsList>

        <TabsContent value="chunks" className="mt-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Smart Chunking (800-1200 tokens)</h3>
            
            {chunkItems.length === 0 ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Upload een document via DocumentUpload om chunks te zien
                </AlertDescription>
              </Alert>
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="space-y-4">
                  {chunkItems.map((item) => (
                    <div key={item.id} className="p-4 border rounded-lg space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Layers className="h-4 w-4" />
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {item.chunk_id}
                            </code>
                            <Badge variant="outline">Chunk #{item.chunk_index}</Badge>
                          </div>
                          <p className="font-semibold text-sm">{item.key}</p>
                          <Badge variant="secondary" className="mt-1">{item.category}</Badge>
                        </div>
                      </div>
                      
                      {item.redacted_text && (
                        <div className="text-xs bg-muted p-3 rounded">
                          <p className="text-muted-foreground mb-1">Chunk Text (eerste 200 chars):</p>
                          <p className="font-mono">{item.redacted_text.substring(0, 200)}...</p>
                        </div>
                      )}
                      
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        <span>Confidence: {((item.confidence_score || 0) * 100).toFixed(0)}%</span>
                        <span>•</span>
                        <span>Gebruikt: {item.usage_count || 0}x</span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="pii" className="mt-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">PII Redactie Voorbeelden</h3>
            
            {piiItems.length === 0 ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Nog geen items met PII redactie. Upload documenten of chat met het systeem.
                </AlertDescription>
              </Alert>
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="space-y-4">
                  {piiItems.slice(0, 10).map((item) => (
                    <div key={item.id} className="p-4 border rounded-lg space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Shield className="h-4 w-4 text-blue-600" />
                        <p className="font-semibold text-sm">{item.key}</p>
                        <Badge variant="secondary">{item.category}</Badge>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="text-xs bg-red-500/5 border border-red-500/20 p-3 rounded">
                          <p className="text-red-700 dark:text-red-400 font-semibold mb-1">
                            🔒 Original (met PII - encrypted in DB):
                          </p>
                          <p className="font-mono text-xs">
                            {item.original_text?.substring(0, 150)}...
                          </p>
                        </div>
                        
                        <div className="text-xs bg-green-500/5 border border-green-500/20 p-3 rounded">
                          <p className="text-green-700 dark:text-green-400 font-semibold mb-1">
                            ✅ Redacted (voor embeddings):
                          </p>
                          <p className="font-mono text-xs">
                            {item.redacted_text?.substring(0, 150)}...
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="metadata" className="mt-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Week 1-2 Metadata Velden</h3>
            
            {metadataItems.length === 0 ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Nog geen items met Week 1-2 metadata. Nieuwe items krijgen automatisch metadata.
                </AlertDescription>
              </Alert>
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="space-y-4">
                  {metadataItems.map((item) => (
                    <div key={item.id} className="p-4 border rounded-lg space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm">{item.key}</p>
                          <Badge variant="secondary" className="mt-1">{item.category}</Badge>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={getConfidentialityColor(item.confidentiality || 'intern')}
                        >
                          {item.confidentiality || 'intern'}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <div>
                            <p className="text-muted-foreground">Valid From:</p>
                            <p className="font-semibold">
                              {item.valid_from ? new Date(item.valid_from).toLocaleDateString('nl-NL') : 'N/A'}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <div>
                            <p className="text-muted-foreground">Valid To:</p>
                            <p className="font-semibold">
                              {item.valid_to ? new Date(item.valid_to).toLocaleDateString('nl-NL') : 'Geen expiry'}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          <div>
                            <p className="text-muted-foreground">Jurisdiction:</p>
                            <p className="font-semibold">{item.jurisdiction || 'N/A'}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <div>
                            <p className="text-muted-foreground">Role Tags:</p>
                            <p className="font-semibold">
                              {item.role_tags?.length > 0 ? item.role_tags.join(', ') : 'Alle rollen'}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {item.acl && Array.isArray(item.acl) && item.acl.length > 0 && (
                        <div className="flex items-center gap-2 text-xs">
                          <Lock className="h-3 w-3 text-purple-600" />
                          <p className="text-muted-foreground">ACL:</p>
                          <div className="flex gap-1">
                            {item.acl.map((role: string) => (
                              <Badge key={role} variant="outline" className="text-xs">
                                {role}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
