import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface RatingDataPoint {
  date: string;
  rating: number;
}

export function RatingTrendSparkline() {
  const { data: trendData, isLoading } = useQuery({
    queryKey: ["rating-trend-sparkline"],
    queryFn: async (): Promise<RatingDataPoint[]> => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: evaluations, error } = await supabase
        .from("assignment_evaluations")
        .select("rating, created_at")
        .gte("created_at", thirtyDaysAgo.toISOString())
        .order("created_at", { ascending: true });

      if (error) throw error;
      if (!evaluations || evaluations.length === 0) return [];

      // Group by day and calculate average
      const dailyRatings: Record<string, number[]> = {};
      evaluations.forEach(e => {
        const date = e.created_at.split('T')[0];
        if (!dailyRatings[date]) dailyRatings[date] = [];
        dailyRatings[date].push(e.rating);
      });

      return Object.entries(dailyRatings).map(([date, ratings]) => ({
        date,
        rating: ratings.reduce((a, b) => a + b, 0) / ratings.length
      }));
    },
    staleTime: 60000, // 1 minute
  });

  if (isLoading) {
    return <Skeleton className="h-8 w-20" />;
  }

  if (!trendData || trendData.length < 2) {
    return <span className="text-xs text-muted-foreground">Geen trend data</span>;
  }

  const minRating = Math.min(...trendData.map(d => d.rating));
  const maxRating = Math.max(...trendData.map(d => d.rating));
  const isUpward = trendData[trendData.length - 1].rating > trendData[0].rating;

  return (
    <div className="h-8 w-20">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={trendData}>
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="bg-popover border rounded px-2 py-1 text-xs shadow-md">
                    <p>{payload[0].payload.date}</p>
                    <p className="font-medium">Rating: {Number(payload[0].value).toFixed(1)}</p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Line
            type="monotone"
            dataKey="rating"
            stroke={isUpward ? "hsl(var(--chart-2))" : "hsl(var(--destructive))"}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
