import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface KBGrowthData {
  hour: string;
  items_added: number;
  avg_confidence: number;
}

interface KBGrowthChartProps {
  data?: KBGrowthData[];
  isLoading?: boolean;
}

export function KBGrowthChart({ data, isLoading }: KBGrowthChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>📈 Knowledge Base Growth (24H)</CardTitle>
          <CardDescription>Items toegevoegd per uur</CardDescription>
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
          <CardTitle>📈 Knowledge Base Growth (24H)</CardTitle>
          <CardDescription>Items toegevoegd per uur</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            Geen data beschikbaar voor de laatste 24 uur
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map(item => ({
    hour: new Date(item.hour).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
    'Items Toegevoegd': item.items_added,
    'Avg Confidence': (item.avg_confidence * 100).toFixed(1)
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>📈 Knowledge Base Growth (24H)</CardTitle>
        <CardDescription>Items toegevoegd en gemiddelde confidence per uur</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="hour" 
              className="text-xs"
              tick={{ fill: 'hsl(var(--foreground))' }}
            />
            <YAxis 
              yAxisId="left"
              className="text-xs"
              tick={{ fill: 'hsl(var(--foreground))' }}
            />
            <YAxis 
              yAxisId="right" 
              orientation="right"
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
            <Line 
              yAxisId="left"
              type="monotone" 
              dataKey="Items Toegevoegd" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--primary))' }}
            />
            <Line 
              yAxisId="right"
              type="monotone" 
              dataKey="Avg Confidence" 
              stroke="hsl(var(--chart-2))" 
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--chart-2))' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
