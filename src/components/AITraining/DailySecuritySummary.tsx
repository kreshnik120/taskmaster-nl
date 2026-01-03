import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, CheckCircle, XCircle, Clock, TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { format, subDays, startOfDay, differenceInHours } from "date-fns";
import { nl } from "date-fns/locale";

interface DailyScanResult {
  date: string;
  passed: number;
  failed: number;
  total: number;
  passRate: number;
  timestamp: string;
}

export function DailySecuritySummary() {
  const { data: scanHistory, isLoading } = useQuery({
    queryKey: ["daily-security-summary"],
    queryFn: async () => {
      const sevenDaysAgo = subDays(new Date(), 7);
      
      const { data, error } = await supabase
        .from("system_events")
        .select("event_data, created_at")
        .eq("event_type", "security_penetration_test")
        .gte("created_at", sevenDaysAgo.toISOString())
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch security scan history:", error);
        return [];
      }

      // Group by date and take the latest scan per day
      const byDate = new Map<string, DailyScanResult>();
      
      for (const event of data || []) {
        const eventData = event.event_data as any;
        const dateKey = format(new Date(event.created_at), "yyyy-MM-dd");
        
        if (!byDate.has(dateKey) && eventData?.summary) {
          byDate.set(dateKey, {
            date: dateKey,
            passed: eventData.summary.passed || 0,
            failed: eventData.summary.failed || 0,
            total: eventData.summary.total || 0,
            passRate: eventData.summary.passRate || 0,
            timestamp: event.created_at,
          });
        }
      }

      return Array.from(byDate.values());
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Calculate next scan time (02:00 UTC)
  const getNextScanTime = () => {
    const now = new Date();
    const nextScan = new Date(now);
    nextScan.setUTCHours(2, 0, 0, 0);
    
    if (now >= nextScan) {
      nextScan.setDate(nextScan.getDate() + 1);
    }
    
    const hoursUntil = differenceInHours(nextScan, now);
    return { nextScan, hoursUntil };
  };

  const { nextScan, hoursUntil } = getNextScanTime();

  // Calculate trend
  const getTrend = () => {
    if (!scanHistory || scanHistory.length < 2) return "neutral";
    
    const recentAvg = scanHistory.slice(0, 3).reduce((sum, s) => sum + s.passRate, 0) / Math.min(3, scanHistory.length);
    const olderAvg = scanHistory.slice(3).reduce((sum, s) => sum + s.passRate, 0) / Math.max(1, scanHistory.slice(3).length);
    
    if (scanHistory.slice(3).length === 0) return "neutral";
    if (recentAvg > olderAvg + 5) return "improving";
    if (recentAvg < olderAvg - 5) return "declining";
    return "stable";
  };

  const trend = getTrend();
  const latestScan = scanHistory?.[0];

  // Generate last 7 days for display
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i);
    const dateKey = format(date, "yyyy-MM-dd");
    const scan = scanHistory?.find(s => s.date === dateKey);
    return {
      date,
      dateKey,
      dayName: format(date, "EEE", { locale: nl }),
      scan,
    };
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-12" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-primary" />
            Dagelijkse Security Scan
          </CardTitle>
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            Volgende scan over {hoursUntil}u
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Week overview */}
        <div className="flex justify-between gap-1">
          {last7Days.map(({ dayName, dateKey, scan }) => (
            <div
              key={dateKey}
              className="flex flex-col items-center gap-1 flex-1"
            >
              <span className="text-xs text-muted-foreground capitalize">
                {dayName}
              </span>
              <div
                className={`w-full aspect-square rounded-md flex items-center justify-center ${
                  scan
                    ? scan.passRate === 100
                      ? "bg-green-500/20 text-green-600"
                      : scan.passRate >= 80
                      ? "bg-yellow-500/20 text-yellow-600"
                      : "bg-red-500/20 text-red-600"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {scan ? (
                  scan.passRate === 100 ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )
                ) : (
                  <Minus className="h-4 w-4" />
                )}
              </div>
              {scan && (
                <span className="text-[10px] text-muted-foreground">
                  {scan.passed}/{scan.total}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Trend and latest result */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Trend:</span>
            {trend === "improving" && (
              <Badge variant="default" className="gap-1 bg-green-600">
                <TrendingUp className="h-3 w-3" />
                Verbetering
              </Badge>
            )}
            {trend === "declining" && (
              <Badge variant="destructive" className="gap-1">
                <TrendingDown className="h-3 w-3" />
                Verslechtering
              </Badge>
            )}
            {(trend === "stable" || trend === "neutral") && (
              <Badge variant="secondary" className="gap-1">
                <Minus className="h-3 w-3" />
                Stabiel
              </Badge>
            )}
          </div>

          {latestScan && (
            <div className="text-sm text-muted-foreground">
              Laatste: {format(new Date(latestScan.timestamp), "dd MMM HH:mm", { locale: nl })} —{" "}
              <span className={latestScan.passRate === 100 ? "text-green-600 font-medium" : "text-yellow-600 font-medium"}>
                {latestScan.passed}/{latestScan.total} ({latestScan.passRate}%)
              </span>
            </div>
          )}
        </div>

        {!scanHistory?.length && (
          <div className="text-center py-4 text-sm text-muted-foreground">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
            Nog geen scans uitgevoerd. Eerste scan gepland om 02:00 UTC.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
