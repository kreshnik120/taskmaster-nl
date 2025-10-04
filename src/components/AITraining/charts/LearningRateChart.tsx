import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface LearningRate {
  hour: string;
  events: number;
  applied: number;
}

interface LearningRateChartProps {
  data?: LearningRate[];
  isLoading?: boolean;
}

export function LearningRateChart({ data, isLoading }: LearningRateChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>📊 Learning Rate Trends (24H)</CardTitle>
          <CardDescription>Events vs toegepast op knowledge base</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>📊 Learning Rate Trends (24H)</CardTitle>
          <CardDescription>Events vs toegepast op knowledge base</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            Geen learning events beschikbaar
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map(item => ({
    hour: new Date(item.hour).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
    'Events': item.events,
    'Toegepast': item.applied,
    'Apply Rate': item.events > 0 ? ((item.applied / item.events) * 100).toFixed(1) : 0
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>📊 Learning Rate Trends (24H)</CardTitle>
        <CardDescription>Learning events en toepassing op knowledge base per uur</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorApplied" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="hour" 
              className="text-xs"
              tick={{ fill: 'hsl(var(--foreground))' }}
            />
            <YAxis 
              className="text-xs"
              tick={{ fill: 'hsl(var(--foreground))' }}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px'
              }}
            />
            <Legend />
            <Area 
              type="monotone" 
              dataKey="Events" 
              stroke="hsl(var(--primary))" 
              fillOpacity={1} 
              fill="url(#colorEvents)" 
            />
            <Area 
              type="monotone" 
              dataKey="Toegepast" 
              stroke="hsl(var(--chart-2))" 
              fillOpacity={1} 
              fill="url(#colorApplied)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
