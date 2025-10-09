import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CheckCircle, XCircle, AlertCircle, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface KnowledgeItem {
  id: string;
  category: string;
  key: string;
  value: any;
  confidence_score: number;
  validation_status: string;
  needs_review: boolean;
  created_at: string;
  source?: string;
}

export function KnowledgeValidator() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("unverified");
  const [validationStreak, setValidationStreak] = useState<number>(() => {
    const stored = localStorage.getItem("validation_streak");
    return stored ? parseInt(stored, 10) : 0;
  });
  const [showQuickWins, setShowQuickWins] = useState<boolean>(true);

  // Fetch knowledge items needing validation
  const { data: items, isLoading } = useQuery({
    queryKey: ["knowledge-validation", filterCategory, filterStatus, showQuickWins],
    queryFn: async () => {
      let query = supabase
        .from("ai_knowledge_base")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100);

      // Apply Quick Wins filter: high confidence + unverified
      if (showQuickWins) {
        query = query
          .eq("validation_status", "unverified")
          .gte("confidence_score", 0.80);
      } else {
        if (filterStatus !== "all") {
          query = query.eq("validation_status", filterStatus);
        }
        if (filterCategory !== "all") {
          query = query.eq("category", filterCategory);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as KnowledgeItem[];
    },
  });

  // Fetch categories for filter
  const { data: categories } = useQuery({
    queryKey: ["knowledge-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_knowledge_base")
        .select("category")
        .is("deleted_at", null);
      
      if (error) throw error;
      return [...new Set(data.map(d => d.category))].sort();
    },
  });

  // Fetch validation stats
  const { data: stats } = useQuery({
    queryKey: ["validation-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_knowledge_base")
        .select("validation_status")
        .is("deleted_at", null);
      
      if (error) throw error;
      
      const total = data.length;
      const verified = data.filter(d => d.validation_status === "verified").length;
      const rejected = data.filter(d => d.validation_status === "rejected").length;
      const unverified = data.filter(d => d.validation_status === "unverified").length;
      const pending = data.filter(d => d.validation_status === "pending_review").length;
      
      return {
        total,
        verified,
        rejected,
        unverified,
        pending,
        verifiedPercentage: total > 0 ? Math.round((verified / total) * 100) : 0,
      };
    },
  });

  // Validation mutation
  const validateMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const { data, error } = await supabase.functions.invoke("validate-knowledge", {
        body: { knowledgeIds: ids, validationStatus: status },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-validation"] });
      queryClient.invalidateQueries({ queryKey: ["validation-stats"] });
      setSelectedIds(new Set());
      
      // Update validation streak
      const newStreak = validationStreak + data.updatedCount;
      setValidationStreak(newStreak);
      localStorage.setItem("validation_streak", newStreak.toString());
      
      toast({
        title: "Validatie succesvol! 🎉",
        description: `${data.updatedCount} items bijgewerkt • Streak: ${newStreak} validaties`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Validatie mislukt",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleSelectAll = () => {
    if (selectedIds.size === items?.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items?.map(item => item.id) || []));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleValidate = (status: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      toast({
        title: "Geen items geselecteerd",
        description: "Selecteer eerst items om te valideren",
        variant: "destructive",
      });
      return;
    }
    validateMutation.mutate({ ids, status });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Verified</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      case "pending_review":
        return <Badge variant="outline"><AlertCircle className="w-3 h-3 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="secondary">Unverified</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const getStreakBadge = () => {
    if (validationStreak >= 100) return { icon: "🏆", label: "Master Validator", color: "bg-yellow-500" };
    if (validationStreak >= 50) return { icon: "⭐", label: "Expert", color: "bg-blue-500" };
    if (validationStreak >= 20) return { icon: "🎯", label: "Pro", color: "bg-green-500" };
    if (validationStreak >= 10) return { icon: "🔥", label: "On Fire", color: "bg-orange-500" };
    return { icon: "🌱", label: "Getting Started", color: "bg-gray-500" };
  };

  return (
    <div className="space-y-6">
      {/* Validation Streak Banner */}
      {validationStreak > 0 && (
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full ${getStreakBadge().color} flex items-center justify-center text-2xl`}>
                  {getStreakBadge().icon}
                </div>
                <div>
                  <p className="font-bold text-lg">Validation Streak: {validationStreak}</p>
                  <p className="text-sm text-muted-foreground">{getStreakBadge().label}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Volgende milestone</p>
                <p className="font-semibold">
                  {validationStreak < 10 && `${10 - validationStreak} tot 🔥 On Fire`}
                  {validationStreak >= 10 && validationStreak < 20 && `${20 - validationStreak} tot 🎯 Pro`}
                  {validationStreak >= 20 && validationStreak < 50 && `${50 - validationStreak} tot ⭐ Expert`}
                  {validationStreak >= 50 && validationStreak < 100 && `${100 - validationStreak} tot 🏆 Master`}
                  {validationStreak >= 100 && "Max level bereikt!"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Totaal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Verified</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.verified || 0}</div>
            <p className="text-xs text-muted-foreground">{stats?.verifiedPercentage || 0}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Unverified</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats?.unverified || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats?.pending || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Rejected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.rejected || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Knowledge Validation Queue</CardTitle>
          <CardDescription>
            Review en valideer AI knowledge items ({selectedIds.size} geselecteerd)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button
              variant={showQuickWins ? "default" : "outline"}
              size="sm"
              onClick={() => setShowQuickWins(!showQuickWins)}
              className="gap-2"
            >
              <Zap className="h-4 w-4" />
              Quick Wins (80%+ confidence)
            </Button>

            {!showQuickWins && (
              <>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filter op status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle statussen</SelectItem>
                    <SelectItem value="unverified">Unverified</SelectItem>
                    <SelectItem value="pending_review">Pending Review</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filter op categorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle categorieën</SelectItem>
                    {categories?.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            <div className="flex-1" />

            <Button
              variant="outline"
              size="sm"
              onClick={toggleSelectAll}
              disabled={!items || items.length === 0}
            >
              {selectedIds.size === items?.length ? "Deselecteer Alles" : "Selecteer Alles"}
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => handleValidate("verified")}
              disabled={selectedIds.size === 0 || validateMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Approve ({selectedIds.size})
            </Button>
            <Button
              onClick={() => handleValidate("pending_review")}
              disabled={selectedIds.size === 0 || validateMutation.isPending}
              variant="outline"
            >
              <AlertCircle className="w-4 h-4 mr-2" />
              Mark for Review ({selectedIds.size})
            </Button>
            <Button
              onClick={() => handleValidate("rejected")}
              disabled={selectedIds.size === 0 || validateMutation.isPending}
              variant="destructive"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Reject ({selectedIds.size})
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Knowledge Items List */}
      <ScrollArea className="h-[600px]">
        <div className="space-y-3">
          {items?.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Geen items gevonden voor deze filters
              </CardContent>
            </Card>
          ) : (
            items?.map((item) => (
              <Card key={item.id} className="hover:border-primary transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <Checkbox
                      checked={selectedIds.has(item.id)}
                      onCheckedChange={() => toggleSelect(item.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{item.category}</Badge>
                            {getStatusBadge(item.validation_status)}
                            {item.needs_review && (
                              <Badge variant="destructive">Needs Review</Badge>
                            )}
                          </div>
                          <p className="font-medium mt-1">{item.key}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">
                            Confidence: {Math.round(Number(item.confidence_score) * 100)}%
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(item.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <pre className="whitespace-pre-wrap font-sans bg-muted p-2 rounded">
                          {JSON.stringify(item.value, null, 2)}
                        </pre>
                      </div>
                      {item.source && (
                        <p className="text-xs text-muted-foreground">
                          Bron: {item.source}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}