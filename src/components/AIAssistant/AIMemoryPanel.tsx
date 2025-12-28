import { useState } from 'react';
import { Brain, ChevronDown, ChevronUp, BookOpen, Database, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

interface KnowledgeItem {
  id: string;
  key: string;
  category: string;
  value: any;
  confidence_score: number | null;
  source?: string | null;
  source_type?: string | null;
}

interface AIMemoryPanelProps {
  knowledgeIds: string[];
}

const categoryColors: Record<string, string> = {
  'bedrijfsinfo': 'bg-blue-500/20 text-blue-700 border-blue-500/30',
  'procedures': 'bg-green-500/20 text-green-700 border-green-500/30',
  'tarieven': 'bg-amber-500/20 text-amber-700 border-amber-500/30',
  'functieprofielen': 'bg-purple-500/20 text-purple-700 border-purple-500/30',
  'klantinfo': 'bg-pink-500/20 text-pink-700 border-pink-500/30',
  'doelgroepen': 'bg-cyan-500/20 text-cyan-700 border-cyan-500/30',
  'default': 'bg-muted text-muted-foreground border-border',
};

const getCategoryColor = (category: string) => {
  const lowerCategory = category.toLowerCase();
  for (const [key, value] of Object.entries(categoryColors)) {
    if (lowerCategory.includes(key)) return value;
  }
  return categoryColors.default;
};

const formatValue = (value: any): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (value?.text) return value.text;
    if (value?.description) return value.description;
    return JSON.stringify(value, null, 2).substring(0, 200) + '...';
  }
  return String(value);
};

export function AIMemoryPanel({ knowledgeIds }: AIMemoryPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { data: knowledgeItems, isLoading } = useQuery({
    queryKey: ['ai-memory', knowledgeIds],
    queryFn: async () => {
      if (knowledgeIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('ai_knowledge_base')
        .select('id, key, category, value, confidence_score, source, source_type')
        .in('id', knowledgeIds);
      
      if (error) {
        console.error('Failed to fetch knowledge items:', error);
        return [];
      }
      
      return data as KnowledgeItem[];
    },
    enabled: knowledgeIds.length > 0 && isOpen,
    staleTime: 60000, // Cache for 1 minute
  });

  if (knowledgeIds.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-2">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Brain className="h-3.5 w-3.5" />
          <span>Gebruikte kennis ({knowledgeIds.length})</span>
          {isOpen ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </Button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="mt-2">
        <div className="rounded-lg border bg-card/50 p-3 space-y-2 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Database className="h-3.5 w-3.5" />
            <span className="font-medium">AI Geheugen</span>
          </div>
          
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-2">
              <div className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>Laden...</span>
            </div>
          ) : knowledgeItems && knowledgeItems.length > 0 ? (
            <div className="space-y-2">
              {knowledgeItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-md border bg-background/50 p-2 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <BookOpen className="h-3 w-3 text-primary shrink-0" />
                      <span className="font-medium text-foreground">{item.key}</span>
                      <Badge 
                        variant="outline" 
                        className={`text-[10px] px-1.5 py-0 ${getCategoryColor(item.category)}`}
                      >
                        {item.category}
                      </Badge>
                    </div>
                    {item.confidence_score && (
                      <Badge 
                        variant="secondary" 
                        className="text-[10px] px-1.5 py-0 shrink-0"
                      >
                        {Math.round(item.confidence_score * 100)}%
                      </Badge>
                    )}
                  </div>
                  
                  <p className="text-muted-foreground line-clamp-2 leading-relaxed">
                    {formatValue(item.value)}
                  </p>
                  
                  {item.source && (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <ExternalLink className="h-2.5 w-2.5" />
                      <span className="truncate">{item.source_type || 'Bron'}: {item.source}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground py-2">
              Geen kennisitems gevonden.
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
