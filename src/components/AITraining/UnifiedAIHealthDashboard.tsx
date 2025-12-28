import { useState } from "react";
import { useUnifiedAIHealth, EdgeFunctionStatus } from "@/hooks/useUnifiedAIHealth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { 
  Brain, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Activity,
  Zap,
  Database,
  GitBranch,
  MessageSquare,
  AlertTriangle,
  Sparkles,
  TrendingUp,
  Eye,
  ThumbsUp,
  Recycle,
  ExternalLink
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { Link } from "react-router-dom";
import { LEARNING_FUNCTIONS, getLearningFunctionByName } from "@/lib/constants/learningFunctions";
import { ErrorBoundary } from "@/components/ErrorBoundary";

/**
 * UnifiedAIHealthDashboard - Geconsolideerde AI system health monitoring
 * 
 * @param compact - Toont alleen summary (voor hoofddashboard)
 * 
 * Combineert:
 * - Edge Function status monitoring (8 learning loops)
 * - Knowledge Base quality metrics
 * - Real-time updates via Supabase subscriptions
 */
interface UnifiedAIHealthDashboardProps {
  compact?: boolean;
}

/**
 * Helper om icon te krijgen voor een learning function
 */
function getFunctionIcon(name: string): React.ReactNode {
  const fn = getLearningFunctionByName(name);
  if (!fn) return <Activity className="h-4 w-4" />;
  const IconComponent = fn.icon;
  return <IconComponent className="h-4 w-4" />;
}

function getStatusColor(status: string) {
  switch (status) {
    case 'healthy': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    case 'warning': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    case 'error': return 'bg-red-500/10 text-red-600 border-red-500/20';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'healthy': return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case 'warning': return <Activity className="h-3.5 w-3.5 text-amber-500" />;
    case 'error': return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function getHealthBadge(health: string) {
  switch (health) {
    case 'excellent': return <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30"><CheckCircle2 className="h-3 w-3 mr-1" />Uitstekend</Badge>;
    case 'good': return <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/30"><CheckCircle2 className="h-3 w-3 mr-1" />Goed</Badge>;
    case 'warning': return <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30"><AlertTriangle className="h-3 w-3 mr-1" />Waarschuwing</Badge>;
    case 'critical': return <Badge className="bg-red-500/20 text-red-600 border-red-500/30"><XCircle className="h-3 w-3 mr-1" />Kritiek</Badge>;
    default: return <Badge variant="outline">Onbekend</Badge>;
  }
}

function EdgeFunctionCard({ fn }: { fn: EdgeFunctionStatus }) {
  const successRate = fn.successCount + fn.failureCount > 0
    ? Math.round((fn.successCount / (fn.successCount + fn.failureCount)) * 100)
    : null;
  
  const fnDef = getLearningFunctionByName(fn.name);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`p-3 rounded-lg border ${getStatusColor(fn.status)} transition-all hover:shadow-sm cursor-help`}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-background/50">
                  {getFunctionIcon(fn.name)}
                </div>
                <span className="text-sm font-medium">{fn.displayName}</span>
              </div>
              {getStatusIcon(fn.status)}
            </div>
            
            <div className="space-y-1.5">
              {fn.lastRun ? (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Laatste run:</span>
                  <span className="font-medium">
                    {formatDistanceToNow(new Date(fn.lastRun), { addSuffix: true, locale: nl })}
                  </span>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Nog niet gedraaid</div>
              )}
              
              {successRate !== null && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Succes rate:</span>
                  <span className="font-medium">{successRate}%</span>
                </div>
              )}
              
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Runs (24h):</span>
                <span className="font-medium">
                  {fn.successCount + fn.failureCount}
                  {fn.failureCount > 0 && (
                    <span className="text-red-500 ml-1">({fn.failureCount} ✗)</span>
                  )}
                </span>
              </div>
              
              {fn.avgDurationMs > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Gem. duur:</span>
                  <span className="font-medium">
                    {fn.avgDurationMs > 1000 
                      ? `${(fn.avgDurationMs / 1000).toFixed(1)}s`
                      : `${fn.avgDurationMs}ms`
                    }
                  </span>
                </div>
              )}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-sm font-medium">{fn.displayName}</p>
          <p className="text-xs text-muted-foreground">
            {fnDef?.description || 'AI learning edge function'}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function UnifiedAIHealthDashboardContent({ compact = false }: UnifiedAIHealthDashboardProps) {
  const { data, isLoading, error, refetch } = useUnifiedAIHealth();
  const [isRefetching, setIsRefetching] = useState(false);

  const handleRefetch = async () => {
    setIsRefetching(true);
    try {
      await refetch();
    } finally {
      setIsRefetching(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="col-span-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-5 w-5 text-primary" />
            AI System Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="col-span-full border-destructive/50">
        <CardContent className="p-6 text-center">
          <XCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
          <p className="text-destructive font-medium mb-2">Fout bij laden van AI health data</p>
          <Button variant="outline" size="sm" onClick={handleRefetch} disabled={isRefetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
            Opnieuw proberen
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { edgeFunctions, knowledgeBase, summary, lastUpdated } = data;

  // Compact mode: Summary only with link to expanded view
  if (compact) {
    return (
      <Card className="col-span-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-5 w-5 text-primary" />
              AI System Health
            </CardTitle>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </div>
              {getHealthBadge(summary.overallHealth)}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0">
          {/* Quick Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <div className="flex items-center justify-center gap-1.5 text-emerald-500 mb-1">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-lg font-bold">{summary.healthyLoops}/{edgeFunctions.length}</span>
              </div>
              <span className="text-xs text-muted-foreground">Edge Functions</span>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <div className="flex items-center justify-center gap-1.5 text-primary mb-1">
                <Database className="h-4 w-4" />
                <span className="text-lg font-bold">{knowledgeBase.totalActive.toLocaleString()}</span>
              </div>
              <span className="text-xs text-muted-foreground">KB Items</span>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <div className="flex items-center justify-center gap-1.5 text-primary mb-1">
                <TrendingUp className="h-4 w-4" />
                <span className="text-lg font-bold">{knowledgeBase.utilizationRate}%</span>
              </div>
              <span className="text-xs text-muted-foreground">Utilization</span>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Activity className="h-4 w-4" />
                <span className={`text-lg font-bold ${summary.overallSuccessRate >= 95 ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {summary.overallSuccessRate}%
                </span>
              </div>
              <span className="text-xs text-muted-foreground">24h Success</span>
            </div>
          </div>

          {/* Alerts */}
          {(summary.errorLoops > 0 || summary.warningLoops > 0 || knowledgeBase.recoveryNeeded > 0) && (
            <div className="space-y-2 mb-4">
              {summary.errorLoops > 0 && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-500/10 p-2 rounded-lg">
                  <XCircle className="h-4 w-4" />
                  {summary.errorLoops} edge function(s) hebben fouten
                </div>
              )}
              {knowledgeBase.recoveryNeeded > 0 && (
                <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-500/10 p-2 rounded-lg">
                  <Recycle className="h-4 w-4" />
                  {knowledgeBase.recoveryNeeded} items wachten op recovery
                </div>
              )}
            </div>
          )}

          {/* Link to full view */}
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-xs text-muted-foreground">
              Bijgewerkt {formatDistanceToNow(lastUpdated, { addSuffix: true, locale: nl })}
            </span>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/ai-training?tab=health" className="flex items-center gap-1">
                Meer details <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Expanded mode: Full tabbed view
  return (
    <Card className="col-span-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              AI System Health
            </CardTitle>
            <CardDescription className="mt-1">
              Geconsolideerde status van edge functions en knowledge base
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </div>
            {getHealthBadge(summary.overallHealth)}
            <Button variant="ghost" size="sm" onClick={handleRefetch} disabled={isRefetching}>
              <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overzicht</TabsTrigger>
            <TabsTrigger value="edge-functions">Edge Functions</TabsTrigger>
            <TabsTrigger value="knowledge-base">Knowledge Base</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-xs">Edge Functions</span>
                </div>
                <div className="text-2xl font-bold text-emerald-600">
                  {summary.healthyLoops}/{edgeFunctions.length}
                </div>
                <span className="text-xs text-muted-foreground">gezond</span>
              </div>
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Database className="h-4 w-4" />
                  <span className="text-xs">Knowledge Base</span>
                </div>
                <div className="text-2xl font-bold">{knowledgeBase.totalActive.toLocaleString()}</div>
                <span className="text-xs text-muted-foreground">items actief</span>
              </div>
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs">Utilization</span>
                </div>
                <div className="text-2xl font-bold">{knowledgeBase.utilizationRate}%</div>
                <span className="text-xs text-muted-foreground">met usage</span>
              </div>
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Activity className="h-4 w-4" />
                  <span className="text-xs">24h Success Rate</span>
                </div>
                <div className={`text-2xl font-bold ${summary.overallSuccessRate >= 95 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {summary.overallSuccessRate}%
                </div>
                <span className="text-xs text-muted-foreground">edge functions</span>
              </div>
            </div>

            {/* Alerts */}
            <div className="space-y-2">
              {knowledgeBase.geminiResearchCount > 0 && (
                <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-purple-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-purple-600 dark:text-purple-400">
                      🔬 Gemini Deep Research Actief
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {knowledgeBase.geminiResearchCount.toLocaleString()} high-quality kennisitems beschikbaar
                    </p>
                  </div>
                </div>
              )}

              {knowledgeBase.recoveryNeeded > 0 && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
                  <Recycle className="h-5 w-5 text-red-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-600 dark:text-red-400">Data Recovery Nodig</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {knowledgeBase.recoveryNeeded} soft-deleted items met {knowledgeBase.recoveryUsage} totale usage
                    </p>
                  </div>
                </div>
              )}

              {knowledgeBase.unknownSource > 0 && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Data Quality Issues</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {knowledgeBase.unknownSource} items hebben source_type = 'unknown'
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Secondary Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="p-2 rounded-lg bg-muted/50 flex items-center gap-2">
                <div className="p-1.5 rounded bg-primary/20 text-primary"><Eye className="h-4 w-4" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Audit (7d)</p>
                  <p className="text-sm font-semibold">{knowledgeBase.auditRecords}</p>
                </div>
              </div>
              <div className="p-2 rounded-lg bg-muted/50 flex items-center gap-2">
                <div className="p-1.5 rounded bg-primary/20 text-primary"><ThumbsUp className="h-4 w-4" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Feedback</p>
                  <p className="text-sm font-semibold">{knowledgeBase.totalFeedback}</p>
                </div>
              </div>
              <div className="p-2 rounded-lg bg-muted/50 flex items-center gap-2">
                <div className="p-1.5 rounded bg-primary/20 text-primary"><Sparkles className="h-4 w-4" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Patterns</p>
                  <p className="text-sm font-semibold">{knowledgeBase.patternsWithBoost}/{knowledgeBase.totalPatterns}</p>
                </div>
              </div>
              <div className="p-2 rounded-lg bg-muted/50 flex items-center gap-2">
                <div className="p-1.5 rounded bg-primary/20 text-primary"><CheckCircle2 className="h-4 w-4" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Met Usage</p>
                  <p className="text-sm font-semibold">{knowledgeBase.withUsage.toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Last Updated */}
            <div className="text-xs text-muted-foreground text-center pt-2 border-t">
              Bijgewerkt {formatDistanceToNow(lastUpdated, { addSuffix: true, locale: nl })}
            </div>
          </TabsContent>

          {/* EDGE FUNCTIONS TAB */}
          <TabsContent value="edge-functions" className="mt-4 space-y-4">
            {/* Summary stats */}
            <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-medium">{summary.healthyLoops} gezond</span>
              </div>
              {summary.warningLoops > 0 && (
                <div className="flex items-center gap-1.5">
                  <Activity className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium">{summary.warningLoops} waarschuwing</span>
                </div>
              )}
              {summary.errorLoops > 0 && (
                <div className="flex items-center gap-1.5">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm font-medium">{summary.errorLoops} fout</span>
                </div>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground">24h succes:</span>
                <Badge variant="outline" className={summary.overallSuccessRate >= 95 ? 'border-emerald-500/50 text-emerald-600' : 'border-amber-500/50 text-amber-600'}>
                  {summary.overallSuccessRate}%
                </Badge>
              </div>
            </div>

            {/* Function Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {edgeFunctions.map((fn) => (
                <EdgeFunctionCard key={fn.name} fn={fn} />
              ))}
            </div>
          </TabsContent>

          {/* KNOWLEDGE BASE TAB */}
          <TabsContent value="knowledge-base" className="mt-4 space-y-4">
            {/* Main Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Database className="h-4 w-4" />
                  <span className="text-xs">Totaal Actief</span>
                </div>
                <div className="text-xl font-bold">{knowledgeBase.totalActive.toLocaleString()}</div>
              </div>
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs">Utilization</span>
                </div>
                <div className="text-xl font-bold text-emerald-600">{knowledgeBase.utilizationRate}%</div>
              </div>
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Activity className="h-4 w-4" />
                  <span className="text-xs">Total Usage</span>
                </div>
                <div className="text-xl font-bold">{knowledgeBase.totalUsage.toLocaleString()}</div>
              </div>
              <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-xs">Gemini Research</span>
                </div>
                <div className="text-xl font-bold text-purple-600">{knowledgeBase.geminiResearchCount.toLocaleString()}</div>
              </div>
            </div>

            {/* Utilization Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Knowledge Utilization Rate</span>
                <span className="font-medium">{knowledgeBase.utilizationRate}%</span>
              </div>
              <Progress 
                value={knowledgeBase.utilizationRate} 
                className={`h-2 ${
                  knowledgeBase.utilizationRate > 70 ? '[&>div]:bg-emerald-500' :
                  knowledgeBase.utilizationRate > 50 ? '[&>div]:bg-amber-500' :
                  '[&>div]:bg-red-500'
                }`}
              />
            </div>

            {/* Top Categories */}
            {knowledgeBase.topCategories.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Top Categorieën (by usage)</p>
                <div className="flex flex-wrap gap-2">
                  {knowledgeBase.topCategories.map((cat, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {cat.name}: {cat.count} items ({cat.usage} usage)
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

/**
 * UnifiedAIHealthDashboard met ErrorBoundary wrapper
 */
export function UnifiedAIHealthDashboard(props: UnifiedAIHealthDashboardProps) {
  return (
    <ErrorBoundary fallbackTitle="AI Health Dashboard kon niet laden">
      <UnifiedAIHealthDashboardContent {...props} />
    </ErrorBoundary>
  );
}
