import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, TrendingUp, Target, Brain } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";

export const SmartKnowledgeSearch = () => {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const { data: allKnowledge } = useQuery({
    queryKey: ["all-knowledge"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_knowledge_base")
        .select("*")
        .order("confidence_score", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const handleSearch = () => {
    if (!query || !allKnowledge) {
      setSearchResults([]);
      return;
    }

    const keywords = query.toLowerCase().split(' ').filter(w => w.length > 2);
    
    const rankedResults = allKnowledge.map((kb) => {
      let relevanceScore = 0;
      const searchText = `${kb.key} ${kb.category} ${JSON.stringify(kb.value)}`.toLowerCase();
      
      // Keyword matching
      keywords.forEach(keyword => {
        if (searchText.includes(keyword)) {
          relevanceScore += 2;
          // Exact key match gets bonus
          if (kb.key.toLowerCase().includes(keyword)) relevanceScore += 3;
        }
      });
      
      // Boost by confidence and usage
      relevanceScore += (kb.confidence_score || 0) * 10;
      relevanceScore += Math.min((kb.usage_count || 0) * 0.1, 5);
      
      return { ...kb, relevanceScore };
    })
    .filter(item => item.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 10);

    setSearchResults(rankedResults);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'user_preference': return <Target className="h-4 w-4" />;
      case 'business_rule': return <TrendingUp className="h-4 w-4" />;
      default: return <Brain className="h-4 w-4" />;
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
            <Search className="h-5 w-5" />
            Slimme Kennis Zoeken
          </h2>
          <p className="text-sm text-muted-foreground">
            Zoek in de kennisbank met AI-powered relevantie ranking
          </p>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Bijv: tarieven ZZP contracten..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button onClick={handleSearch}>Zoek</Button>
        </div>

        {searchResults.length > 0 && (
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {searchResults.map((result) => (
                <Card key={result.id} className="p-4 bg-muted/50">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {getCategoryIcon(result.category)}
                        <h3 className="font-semibold">{result.key}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          Relevantie: {result.relevanceScore.toFixed(1)}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {result.category}
                        </Badge>
                      </div>
                    </div>

                    <div className="text-sm text-muted-foreground">
                      {typeof result.value === "object" ? (
                        <pre className="bg-background p-2 rounded text-xs overflow-x-auto">
                          {JSON.stringify(result.value, null, 2)}
                        </pre>
                      ) : (
                        <p>{String(result.value)}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Zekerheid: {((result.confidence_score || 0) * 100).toFixed(0)}%</span>
                      <span>Gebruikt: {result.usage_count || 0}x</span>
                      {result.source && <span>Bron: {result.source}</span>}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}

        {query && searchResults.length === 0 && (
          <Card className="p-8 bg-muted/50">
            <p className="text-center text-muted-foreground">
              Geen relevante kennis gevonden voor "{query}"
            </p>
          </Card>
        )}
      </div>
    </Card>
  );
};