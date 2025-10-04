import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface FunctionPerformance {
  function_name: string;
  calls: number;
  avg_duration: number;
  success_count: number;
}

interface FunctionPerfChartProps {
  data?: FunctionPerformance[];
  isLoading?: boolean;
}

export function FunctionPerfChart({ data, isLoading }: FunctionPerfChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>⚡ Function Performance (24H)</CardTitle>
          <CardDescription>Gemiddelde uitvoertijd per functie</CardDescription>
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
          <CardTitle>⚡ Function Performance (24H)</CardTitle>
          <CardDescription>Gemiddelde uitvoertijd per functie</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            Geen performance data beschikbaar
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data
    .sort((a, b) => b.avg_duration - a.avg_duration)
    .slice(0, 10)
    .map(item => ({
      name: item.function_name.replace(/^.*\//, ''),
      'Avg Duur (ms)': Math.round(item.avg_duration),
      'Calls': item.calls,
      'Success Rate': ((item.success_count / item.calls) * 100).toFixed(1)
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>⚡ Function Performance (24H)</CardTitle>
        <CardDescription>Top 10 functies op gemiddelde uitvoertijd</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              type="number"
              className="text-xs"
              tick={{ fill: 'hsl(var(--foreground))' }}
            />
            <YAxis 
              dataKey="name" 
              type="category"
              width={150}
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
            <Bar 
              dataKey="Avg Duur (ms)" 
              fill="hsl(var(--primary))"
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
