import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, DollarSign, TrendingUp, Zap } from "lucide-react";
import { KBGrowthChart } from "./charts/KBGrowthChart";
import { CostBreakdownChart } from "./charts/CostBreakdownChart";
import { FunctionPerfChart } from "./charts/FunctionPerfChart";
import { LearningRateChart } from "./charts/LearningRateChart";

export function AIPerformanceDashboard() {
  // Knowledge Base Growth (hourly)
  const { data: kbGrowth, isLoading: kbLoading } = useQuery({
    queryKey: ['kb-growth-24h'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_knowledge_base')
        .select('created_at, confidence_score')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      
      if (error) throw error;

      // Group by hour
      const hourlyData = data.reduce((acc: any, item) => {
        const hour = new Date(item.created_at).toISOString().slice(0, 13) + ':00:00Z';
        if (!acc[hour]) {
          acc[hour] = { hour, items_added: 0, total_confidence: 0, count: 0 };
        }
        acc[hour].items_added++;
        acc[hour].total_confidence += item.confidence_score;
        acc[hour].count++;
        return acc;
      }, {});

      return Object.values(hourlyData).map((item: any) => ({
        hour: item.hour,
        items_added: item.items_added,
        avg_confidence: item.total_confidence / item.count
      })).sort((a: any, b: any) => new Date(a.hour).getTime() - new Date(b.hour).getTime());
    },
    refetchInterval: 30000, // Poll every 30 seconds
  });

  // Function Performance
  const { data: functionPerf, isLoading: perfLoading } = useQuery({
    queryKey: ['function-performance-24h'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('function_call_logs')
        .select('*')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      
      if (error) throw error;

      // Group by function name
      const functionData = data.reduce((acc: any, item) => {
        const fn = item.function_name;
        if (!acc[fn]) {
          acc[fn] = { 
            function_name: fn, 
            calls: 0, 
            total_duration: 0, 
            total_cost: 0,
            success_count: 0 
          };
        }
        acc[fn].calls++;
        acc[fn].total_duration += item.execution_time_ms || 0;
        acc[fn].total_cost += item.estimated_cost_eur || 0;
        if (item.success) acc[fn].success_count++;
        return acc;
      }, {});

      return Object.values(functionData).map((item: any) => ({
        function_name: item.function_name,
        calls: item.calls,
        avg_duration: item.total_duration / item.calls,
        total_cost: item.total_cost,
        success_count: item.success_count
      }));
    },
    refetchInterval: 30000,
  });

  // Learning Events
  const { data: learningRate, isLoading: learningLoading } = useQuery({
    queryKey: ['learning-rate-24h'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_learning_events')
        .select('created_at, applied_to_knowledge_base')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      
      if (error) throw error;

      // Group by hour
      const hourlyData = data.reduce((acc: any, item) => {
        const hour = new Date(item.created_at).toISOString().slice(0, 13) + ':00:00Z';
        if (!acc[hour]) {
          acc[hour] = { hour, events: 0, applied: 0 };
        }
        acc[hour].events++;
        if (item.applied_to_knowledge_base) acc[hour].applied++;
        return acc;
      }, {});

      return Object.values(hourlyData)
        .sort((a: any, b: any) => new Date(a.hour).getTime() - new Date(b.hour).getTime()) as Array<{
          hour: string;
          events: number;
          applied: number;
        }>;
    },
    refetchInterval: 30000,
  });

  // Calculate summary metrics
  const totalKBItems = kbGrowth?.reduce((sum, item) => sum + item.items_added, 0) || 0;
  const totalCost = functionPerf?.reduce((sum, item) => sum + item.total_cost, 0) || 0;
  const avgDuration = functionPerf?.length 
    ? functionPerf.reduce((sum, item) => sum + item.avg_duration, 0) / functionPerf.length 
    : 0;
  const totalCalls = functionPerf?.reduce((sum, item) => sum + item.calls, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">KB Items (24H)</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+{totalKBItems}</div>
            <p className="text-xs text-muted-foreground">
              Nieuwe kennis items
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Kosten (24H)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{totalCost.toFixed(4)}</div>
            <p className="text-xs text-muted-foreground">
              Geschat: €{(totalCost * 30).toFixed(2)}/maand
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(avgDuration)}ms</div>
            <p className="text-xs text-muted-foreground">
              Gemiddelde uitvoertijd
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Function Calls</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCalls}</div>
            <p className="text-xs text-muted-foreground">
              Totaal aantal calls
            </p>
          </CardContent>
        </Card>
      </div>

      {/* KB Growth Chart */}
      <KBGrowthChart data={kbGrowth} isLoading={kbLoading} />

      {/* Cost & Performance Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <CostBreakdownChart 
          data={functionPerf?.map(f => ({ 
            function_name: f.function_name, 
            total_cost: f.total_cost 
          }))} 
          isLoading={perfLoading} 
        />
        <FunctionPerfChart data={functionPerf} isLoading={perfLoading} />
      </div>

      {/* Learning Rate Chart */}
      <LearningRateChart data={learningRate} isLoading={learningLoading} />

      {/* Auto-refresh indicator */}
      <div className="text-xs text-muted-foreground text-center">
        🔄 Dashboard wordt automatisch elke 30 seconden ververst
      </div>
    </div>
  );
}
