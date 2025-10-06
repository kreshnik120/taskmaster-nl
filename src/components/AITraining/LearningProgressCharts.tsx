import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useLearningProgress } from "@/hooks/useLearningProgress";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Target, Brain, Activity } from "lucide-react";

export const LearningProgressCharts = () => {
  const { data: metrics, isLoading } = useLearningProgress();

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Card key={`skeleton-${i}`}>
            <CardHeader>
              <Skeleton className="h-4 w-[200px]" />
              <Skeleton className="h-3 w-[150px]" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[200px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const chartData = metrics?.map(m => ({
    ...m,
    displayDate: format(new Date(m.date), 'dd MMM', { locale: nl })
  })) || [];

  const chartConfig = {
    accuracy: {
      label: "AI Accuracy",
      color: "hsl(var(--chart-1))",
    },
    autoResolveRate: {
      label: "Auto-Resolve Rate",
      color: "hsl(var(--chart-2))",
    },
    avgConfidence: {
      label: "Confidence Score",
      color: "hsl(var(--chart-3))",
    },
    totalEvents: {
      label: "Total Events",
      color: "hsl(var(--chart-4))",
    },
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* AI Accuracy Trend */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-chart-1" />
            <CardTitle>AI Accuracy</CardTitle>
          </div>
          <CardDescription>Percentage succesvolle AI acties (laatste 30 dagen)</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="displayDate" 
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis 
                  domain={[0, 100]}
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line 
                  type="monotone" 
                  dataKey="accuracy" 
                  stroke="var(--color-accuracy)" 
                  strokeWidth={2}
                  dot={{ fill: "var(--color-accuracy)", r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Auto-Resolve Rate */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-chart-2" />
            <CardTitle>Auto-Resolve Rate</CardTitle>
          </div>
          <CardDescription>Percentage automatisch opgeloste conflicten</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="displayDate" 
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis 
                  domain={[0, 100]}
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area 
                  type="monotone" 
                  dataKey="autoResolveRate" 
                  stroke="var(--color-autoResolveRate)" 
                  fill="var(--color-autoResolveRate)"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Confidence Score Progression */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-chart-3" />
            <CardTitle>Confidence Score</CardTitle>
          </div>
          <CardDescription>Gemiddelde betrouwbaarheidsscore kennisbank</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <defs>
                  <linearGradient id="confidenceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-avgConfidence)" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="var(--color-avgConfidence)" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="displayDate" 
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis 
                  domain={[0, 1]}
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line 
                  type="monotone" 
                  dataKey="avgConfidence" 
                  stroke="var(--color-avgConfidence)" 
                  strokeWidth={2}
                  dot={{ fill: "var(--color-avgConfidence)", r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Learning Events Volume */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-chart-4" />
            <CardTitle>Learning Events Volume</CardTitle>
          </div>
          <CardDescription>Aantal learning events per dag</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="displayDate" 
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar 
                  dataKey="totalEvents" 
                  fill="var(--color-totalEvents)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
};
