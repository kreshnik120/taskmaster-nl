import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Search, Trash2, FileText, MessageSquare, Brain, AlertTriangle, XCircle, Lock, Users, Clock, GraduationCap, ClipboardCheck, Edit, RefreshCw, Zap, ChevronDown } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { VersionHistory } from "./VersionHistory";
import { KnowledgeEditDialog } from "./KnowledgeEditDialog";
import { CATEGORY_GROUPS, CATEGORY_LABELS, getCoverageIcon } from "@/lib/constants/knowledgeCategoryHierarchy";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";

export const KnowledgeOverview = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [sharedFilter, setSharedFilter] = useState<'all' | 'shared' | 'own'>('all');
  const [onlyEmbedded, setOnlyEmbedded] = useState(false);
  const [sortBy, setSortBy] = useState<'recent' | 'usage' | 'confidence'>('recent');
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch knowledge with embedding status
  const { data: knowledge, refetch } = useQuery({
    queryKey: ["ai-knowledge-with-embeddings"],
    queryFn: async () => {
      // Fetch all knowledge items
      const { data: items, error } = await supabase
        .from("ai_knowledge_base")
        .select("*")
        .is("deleted_at", null);

      if (error) throw error;

      // Fetch embedded IDs
      const { data: embeddings } = await supabase
        .from("knowledge_embeddings")
        .select("knowledge_id");
      
      const embeddedIds = new Set(embeddings?.map(e => e.knowledge_id) || []);
      
      // Add hasEmbedding flag to each item
      return items?.map(item => ({
        ...item,
        hasEmbedding: embeddedIds.has(item.id)
      })) || [];
    },
  });

  // Calculate dynamic category stats
  const categoryStats = useMemo(() => {
    const stats: Record<string, { total: number; embedded: number }> = {};
    knowledge?.forEach(item => {
      if (!stats[item.category]) {
        stats[item.category] = { total: 0, embedded: 0 };
      }
      stats[item.category].total += 1;
      if (item.hasEmbedding) {
        stats[item.category].embedded += 1;
      }
    });
    return stats;
  }, [knowledge]);

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

  const filteredKnowledge = useMemo(() => {
    let result = knowledge?.filter((item) => {
      // Text search filter
      const matchesSearch = 
        item.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        JSON.stringify(item.value).toLowerCase().includes(searchQuery.toLowerCase());
      
      // Source filter
      const matchesSource = !sourceFilter || item.source?.includes(sourceFilter);
      
      // Category filter
      const matchesCategory = !categoryFilter || item.category === categoryFilter;
      
      // Group filter
      const matchesGroup = !groupFilter || 
        CATEGORY_GROUPS.find(g => g.id === groupFilter)?.categories.includes(item.category);
      
      // Shared filter
      const matchesShared = sharedFilter === 'all' || 
        (sharedFilter === 'shared' && item.is_shared) ||
        (sharedFilter === 'own' && !item.is_shared);
      
      // Embedded filter
      const matchesEmbedded = !onlyEmbedded || item.hasEmbedding;
      
      return matchesSearch && matchesSource && matchesCategory && matchesGroup && matchesShared && matchesEmbedded;
    }) || [];

    // Sort
    if (sortBy === 'usage') {
      result = result.sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
    } else if (sortBy === 'confidence') {
      result = result.sort((a, b) => (b.confidence_score || 0) - (a.confidence_score || 0));
    } else {
      result = result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return result;
  }, [knowledge, searchQuery, sourceFilter, categoryFilter, groupFilter, sharedFilter, onlyEmbedded, sortBy]);

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

          {/* Filter Row */}
          <div className="flex flex-wrap gap-3 items-center">
            {/* Group Filter Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant={groupFilter ? "default" : "outline"} size="sm" className="gap-2">
                  {groupFilter 
                    ? CATEGORY_GROUPS.find(g => g.id === groupFilter)?.label 
                    : "Alle Groepen"}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => { setGroupFilter(null); setCategoryFilter(null); }}>
                  Alle Groepen
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {CATEGORY_GROUPS.map(group => (
                  <DropdownMenuItem 
                    key={group.id} 
                    onClick={() => { setGroupFilter(group.id); setCategoryFilter(null); }}
                  >
                    {group.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Category Filter Dropdown (filtered by group if selected) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant={categoryFilter ? "default" : "outline"} size="sm" className="gap-2">
                  {categoryFilter 
                    ? CATEGORY_LABELS[categoryFilter] || categoryFilter 
                    : "Alle Categorieën"}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
                <DropdownMenuItem onClick={() => setCategoryFilter(null)}>
                  Alle Categorieën
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {(groupFilter 
                  ? CATEGORY_GROUPS.find(g => g.id === groupFilter)?.categories || []
                  : Object.keys(categoryStats)
                ).sort((a, b) => (categoryStats[b]?.total || 0) - (categoryStats[a]?.total || 0))
                .map(cat => {
                  const stats = categoryStats[cat];
                  const coverage = stats ? Math.round((stats.embedded / stats.total) * 100) : 0;
                  return (
                    <DropdownMenuItem 
                      key={cat} 
                      onClick={() => setCategoryFilter(cat)}
                      className="flex items-center justify-between gap-4"
                    >
                      <span>{CATEGORY_LABELS[cat] || cat}</span>
                      <span className="text-xs text-muted-foreground">
                        {getCoverageIcon(coverage)} {stats?.total || 0}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Source Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant={sourceFilter ? "default" : "outline"} size="sm" className="gap-2">
                  {sourceFilter === "document" ? "Documenten" : sourceFilter === "chat" ? "Chat" : "Alle Bronnen"}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setSourceFilter(null)}>Alle Bronnen</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSourceFilter("document")}>
                  <FileText className="h-4 w-4 mr-2" /> Documenten
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSourceFilter("chat")}>
                  <MessageSquare className="h-4 w-4 mr-2" /> Chat
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Shared Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant={sharedFilter !== 'all' ? "default" : "outline"} size="sm" className="gap-2">
                  <Users className="h-4 w-4" />
                  {sharedFilter === 'shared' ? "Alleen Gedeeld" : sharedFilter === 'own' ? "Alleen Eigen" : "Gedeeld/Eigen"}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setSharedFilter('all')}>
                  Alle Kennis
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSharedFilter('shared')}>
                  <Users className="h-4 w-4 mr-2 text-blue-600" /> Alleen Gedeeld
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSharedFilter('own')}>
                  <Lock className="h-4 w-4 mr-2" /> Alleen Eigen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Sort Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  Sorteer: {sortBy === 'recent' ? 'Recent' : sortBy === 'usage' ? 'Gebruik' : 'Confidence'}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setSortBy('recent')}>Recent</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy('usage')}>Meest Gebruikt</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy('confidence')}>Hoogste Confidence</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* AI-Usable Toggle */}
            <div className="flex items-center gap-2 ml-auto">
              <Switch
                id="only-embedded"
                checked={onlyEmbedded}
                onCheckedChange={setOnlyEmbedded}
              />
              <Label htmlFor="only-embedded" className="text-sm flex items-center gap-1">
                <Zap className="h-4 w-4 text-primary" />
                Alleen AI-bruikbaar
              </Label>
            </div>
          </div>

          {/* Active Filters Summary */}
          {(groupFilter || categoryFilter || sourceFilter || sharedFilter !== 'all' || onlyEmbedded) && (
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span className="text-muted-foreground">Actieve filters:</span>
              {groupFilter && (
                <Badge variant="secondary" className="gap-1">
                  {CATEGORY_GROUPS.find(g => g.id === groupFilter)?.label}
                  <button onClick={() => setGroupFilter(null)} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              )}
              {categoryFilter && (
                <Badge variant="secondary" className="gap-1">
                  {CATEGORY_LABELS[categoryFilter] || categoryFilter}
                  <button onClick={() => setCategoryFilter(null)} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              )}
              {sourceFilter && (
                <Badge variant="secondary" className="gap-1">
                  {sourceFilter}
                  <button onClick={() => setSourceFilter(null)} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              )}
              {sharedFilter !== 'all' && (
                <Badge variant="secondary" className="gap-1">
                  {sharedFilter === 'shared' ? 'Gedeeld' : 'Eigen'}
                  <button onClick={() => setSharedFilter('all')} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              )}
              {onlyEmbedded && (
                <Badge variant="secondary" className="gap-1">
                  AI-bruikbaar
                  <button onClick={() => setOnlyEmbedded(false)} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  setGroupFilter(null);
                  setCategoryFilter(null);
                  setSourceFilter(null);
                  setSharedFilter('all');
                  setOnlyEmbedded(false);
                }}
              >
                Reset alle
              </Button>
            </div>
          )}

          {/* Results count */}
          <p className="text-sm text-muted-foreground">
            {filteredKnowledge.length} van {knowledge?.length || 0} items
          </p>
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
                    {item.is_shared && (
                      <Badge variant="outline" className="text-blue-600 border-blue-600 bg-blue-50 dark:bg-blue-950">
                        <Users className="h-3 w-3 mr-1" />
                        Gedeeld
                      </Badge>
                    )}
                    {item.hasEmbedding ? (
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        <Zap className="h-3 w-3 mr-1" />
                        AI
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Geen embedding
                      </Badge>
                    )}
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
