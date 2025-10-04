import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface FunctionCost {
  function_name: string;
  total_cost: number;
}

interface CostBreakdownChartProps {
  data?: FunctionCost[];
  isLoading?: boolean;
}

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export function CostBreakdownChart({ data, isLoading }: CostBreakdownChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>💰 Cost Breakdown (24H)</CardTitle>
          <CardDescription>Kosten per functie</CardDescription>
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
          <CardTitle>💰 Cost Breakdown (24H)</CardTitle>
          <CardDescription>Kosten per functie</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            Geen kosten data beschikbaar
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalCost = data.reduce((sum, item) => sum + item.total_cost, 0);

  const chartData = data.map(item => ({
    name: item.function_name.replace(/^.*\//, ''),
    value: item.total_cost,
    percentage: ((item.total_cost / totalCost) * 100).toFixed(1)
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>💰 Cost Breakdown (24H)</CardTitle>
        <CardDescription>
          Totaal: €{totalCost.toFixed(4)} | Kosten per functie
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percentage }) => `${name} (${percentage}%)`}
              outerRadius={80}
              fill="hsl(var(--primary))"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              formatter={(value: number) => `€${value.toFixed(4)}`}
              contentStyle={{ 
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px'
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
