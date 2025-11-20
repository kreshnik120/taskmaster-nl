import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Trash2, FileText, MessageSquare, Brain, AlertTriangle, XCircle, Filter, Lock, Users, Clock, GraduationCap, ClipboardCheck, Edit, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { VersionHistory } from "./VersionHistory";
import { KnowledgeEditDialog } from "./KnowledgeEditDialog";

export const KnowledgeOverview = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: knowledge, refetch } = useQuery({
    queryKey: ["ai-knowledge"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_knowledge_base")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Realtime subscription for knowledge base updates
  useEffect(() => {
    const channel = supabase
      .channel('knowledge-base-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_knowledge_base'
        },
        () => {
          console.log('[KNOWLEDGE] Realtime update detected, refreshing...');
          queryClient.invalidateQueries({ queryKey: ["ai-knowledge"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("ai_knowledge_base").delete().eq("id", id);

      if (error) throw error;

      toast({
        title: "Kennis verwijderd",
        description: "Het kennis item is succesvol verwijderd",
      });
      refetch();
    } catch (error: any) {
      toast({
        title: "Verwijderen mislukt",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["ai-knowledge"] });
      await refetch();
      toast({
        title: "Data ververst",
        description: "Kennisbank data is opnieuw geladen uit de database",
      });
    } catch (error) {
      toast({
        title: "Refresh mislukt",
        description: "Kon data niet verversen",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleEditSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["ai-knowledge"] });
    refetch();
  };

  const getSourceIcon = (source: string | null) => {
    if (!source) return <Brain className="h-4 w-4" />;
    if (source.includes("document")) return <FileText className="h-4 w-4" />;
    if (source.includes("chat")) return <MessageSquare className="h-4 w-4" />;
    return <Brain className="h-4 w-4" />;
  };

  const getCategoryIcon = (category: string) => {
    if (category.startsWith('hr_')) {
      switch (category) {
        case 'hr_verlof': return <Clock className="h-4 w-4" />;
        case 'hr_arbeidsvoorwaarden': return <Users className="h-4 w-4" />;
        case 'hr_onboarding': return <GraduationCap className="h-4 w-4" />;
        case 'hr_evaluatie': return <ClipboardCheck className="h-4 w-4" />;
        default: return <Users className="h-4 w-4" />;
      }
    }
    return null;
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      'hr_verlof': 'HR Verlof',
      'hr_arbeidsvoorwaarden': 'HR Arbeidsvoorwaarden',
      'hr_onboarding': 'HR Onboarding',
      'hr_evaluatie': 'HR Evaluatie'
    };
    return labels[category] || category;
  };

  const filteredKnowledge = knowledge?.filter(
    (item) => {
      // Text search filter
      const matchesSearch = 
        item.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        JSON.stringify(item.value).toLowerCase().includes(searchQuery.toLowerCase());
      
      // Source filter
      const matchesSource = !sourceFilter || item.source?.includes(sourceFilter);
      
      // Category filter
      const matchesCategory = !categoryFilter || item.category === categoryFilter;
      
      return matchesSearch && matchesSource && matchesCategory;
    }
  );

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-2">Kennisbank Overzicht</h2>
            <p className="text-sm text-muted-foreground">
              Beheer alle opgeslagen kennis die het AI systeem gebruikt
            </p>
          </div>

          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Zoek in kennisbank..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button 
              variant="outline" 
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="shrink-0"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Verversen...' : 'Ververs Data'}
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Filter op bron:</p>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={sourceFilter === null ? "default" : "outline"}
                size="sm"
                onClick={() => setSourceFilter(null)}
              >
                Alle bronnen
              </Button>
              <Button
                variant={sourceFilter === "document" ? "default" : "outline"}
                size="sm"
                onClick={() => setSourceFilter("document")}
              >
                <FileText className="h-4 w-4 mr-2" />
                Documenten
              </Button>
              <Button
                variant={sourceFilter === "chat" ? "default" : "outline"}
                size="sm"
                onClick={() => setSourceFilter("chat")}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Chat
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Filter op categorie:</p>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={categoryFilter === null ? "default" : "outline"}
                size="sm"
                onClick={() => setCategoryFilter(null)}
              >
                Alle categorieën
              </Button>
              <Button
                variant={categoryFilter === "hr_verlof" ? "default" : "outline"}
                size="sm"
                onClick={() => setCategoryFilter("hr_verlof")}
              >
                <Clock className="h-4 w-4 mr-2" />
                HR Verlof
              </Button>
              <Button
                variant={categoryFilter === "hr_arbeidsvoorwaarden" ? "default" : "outline"}
                size="sm"
                onClick={() => setCategoryFilter("hr_arbeidsvoorwaarden")}
              >
                <Users className="h-4 w-4 mr-2" />
                HR Arbeidsvoorwaarden
              </Button>
              <Button
                variant={categoryFilter === "hr_onboarding" ? "default" : "outline"}
                size="sm"
                onClick={() => setCategoryFilter("hr_onboarding")}
              >
                <GraduationCap className="h-4 w-4 mr-2" />
                HR Onboarding
              </Button>
              <Button
                variant={categoryFilter === "hr_evaluatie" ? "default" : "outline"}
                size="sm"
                onClick={() => setCategoryFilter("hr_evaluatie")}
              >
                <ClipboardCheck className="h-4 w-4 mr-2" />
                HR Evaluatie
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4">
        {filteredKnowledge && filteredKnowledge.length > 0 ? (
          filteredKnowledge.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    {getSourceIcon(item.source)}
                    {getCategoryIcon(item.category)}
                    <h3 className="font-semibold">{item.key}</h3>
                    <Badge variant="secondary">{getCategoryLabel(item.category)}</Badge>
                    {item.confidentiality === 'vertrouwelijk' && (
                      <Badge variant="outline" className="text-orange-600 border-orange-600">
                        <Lock className="h-3 w-3 mr-1" />
                        Vertrouwelijk
                      </Badge>
                    )}
                    {item.needs_review && (
                      <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Needs Review
                      </Badge>
                    )}
                    {item.deleted_at && (
                      <Badge variant="outline" className="text-red-600 border-red-600">
                        <XCircle className="h-3 w-3 mr-1" />
                        Deleted
                      </Badge>
                    )}
                  </div>

                  <div className="text-sm text-muted-foreground">
                    {typeof item.value === "object" ? (
                      <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                        {JSON.stringify(item.value, null, 2)}
                      </pre>
                    ) : (
                      <p>{String(item.value)}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    <span>
                      Confidence: {((item.confidence_score || 0) * 100).toFixed(0)}%
                    </span>
                    <span>Gebruikt: {item.usage_count || 0}x</span>
                    <span>
                      Aangemaakt: {new Date(item.created_at).toLocaleDateString("nl-NL")}
                    </span>
                    {item.last_reviewed_at && (
                      <span>
                        Gereviewed: {new Date(item.last_reviewed_at).toLocaleDateString("nl-NL")}
                      </span>
                    )}
                    {item.role_tags && item.role_tags.length > 0 && (
                      <span className="flex items-center gap-1">
                        Rollen: {item.role_tags.join(', ')}
                      </span>
                    )}
                    {item.acl && Array.isArray(item.acl) && item.acl.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Lock className="h-3 w-3" />
                        Toegang: {item.acl.join(', ')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <VersionHistory 
                    knowledgeId={item.id} 
                    currentCategory={item.category}
                    currentKey={item.key}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingItem(item)}
                    title="Bewerk kennis item"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(item.id)}
                    className="text-destructive hover:text-destructive"
                    title="Verwijder kennis item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))
        ) : (
          <Card className="p-8">
            <p className="text-center text-muted-foreground">
              {searchQuery
                ? "Geen kennis items gevonden met deze zoekopdracht"
                : "Nog geen kennis opgeslagen in het systeem"}
            </p>
          </Card>
        )}
      </div>

      <KnowledgeEditDialog
        knowledgeItem={editingItem}
        open={!!editingItem}
        onOpenChange={(open) => !open && setEditingItem(null)}
        onSuccess={handleEditSuccess}
      />
    </div>
  );
};
