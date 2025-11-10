import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ValidatorStats {
  user_id: string;
  user_name: string;
  user_email: string;
  user_image: string | null;
  total_validations: number;
  validations_this_week: number;
  validations_today: number;
  validations_last_week: number;
  last_validation: string;
}

export function TopValidatorsLeaderboard() {
  const { data: validators, isLoading } = useQuery({
    queryKey: ['top-validators'],
    queryFn: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      // Fetch validation events with user profiles
      const { data, error } = await supabase
        .from('ai_learning_events')
        .select(`
          user_id,
          created_at,
          event_type,
          profiles!ai_learning_events_user_id_fkey (
            id,
            name,
            email,
            image
          )
        `)
        .in('event_type', ['manual_validation', 'auto_validation'])
        .not('user_id', 'is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by user and calculate stats
      const userStats = new Map<string, ValidatorStats>();

      data?.forEach((event: any) => {
        const userId = event.user_id;
        if (!userId || !event.profiles) return;

        const eventDate = new Date(event.created_at);
        const stats = userStats.get(userId) || {
          user_id: userId,
          user_name: event.profiles.name || event.profiles.email || 'Unknown',
          user_email: event.profiles.email || '',
          user_image: event.profiles.image,
          total_validations: 0,
          validations_this_week: 0,
          validations_today: 0,
          validations_last_week: 0,
          last_validation: event.created_at,
        };

        stats.total_validations++;
        
        if (eventDate >= oneDayAgo) {
          stats.validations_today++;
        }
        
        if (eventDate >= sevenDaysAgo) {
          stats.validations_this_week++;
        }
        
        if (eventDate >= fourteenDaysAgo && eventDate < sevenDaysAgo) {
          stats.validations_last_week++;
        }

        userStats.set(userId, stats);
      });

      // Convert to array and sort by validations this week
      const sortedValidators = Array.from(userStats.values())
        .sort((a, b) => b.validations_this_week - a.validations_this_week)
        .slice(0, 10);

      return sortedValidators;
    },
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  const getRankEmoji = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
  };

  const getTrendIcon = (thisWeek: number, lastWeek: number) => {
    if (thisWeek > lastWeek) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (thisWeek < lastWeek) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getTrendBadge = (thisWeek: number, lastWeek: number) => {
    if (lastWeek === 0 && thisWeek > 0) return "+100%";
    if (lastWeek === 0) return "New";
    const change = ((thisWeek - lastWeek) / lastWeek * 100);
    const changeStr = change.toFixed(0);
    return change > 0 ? `+${changeStr}%` : `${changeStr}%`;
  };

  if (isLoading) {
    return (
      <div className="mt-6">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Top Validators (deze week)
        </h3>
        <Card className="p-6">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (!validators || validators.length === 0) {
    return (
      <div className="mt-6">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Top Validators (deze week)
        </h3>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground text-center">
            Nog geen validaties deze week. Begin met valideren om op het leaderboard te komen! 🚀
          </p>
        </Card>
      </div>
    );
  }

  const maxValidations = Math.max(...validators.map(v => v.validations_this_week));

  return (
    <div className="mt-6">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <TrendingUp className="h-4 w-4" />
        Top Validators (deze week)
      </h3>
      <Card className="p-4">
        <div className="space-y-3">
          {validators.map((validator, index) => (
            <div
              key={validator.user_id}
              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="text-lg font-bold min-w-[2.5rem] text-center">
                  {getRankEmoji(index + 1)}
                </div>
                
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={validator.user_image || undefined} />
                  <AvatarFallback>
                    {validator.user_name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{validator.user_name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Progress 
                      value={(validator.validations_this_week / maxValidations) * 100} 
                      className="h-1.5 flex-1"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 ml-4">
                <div className="text-right">
                  <div className="font-bold text-lg">{validator.validations_this_week}</div>
                  <div className="text-xs text-muted-foreground">
                    {Number(validator.validations_today) > 0 && `${validator.validations_today} vandaag`}
                  </div>
                </div>
                
                <div className="flex items-center gap-1">
                  {getTrendIcon(validator.validations_this_week, validator.validations_last_week)}
                  <Badge 
                    variant="outline" 
                    className={
                      validator.validations_this_week > validator.validations_last_week
                        ? "text-green-600 border-green-600"
                        : validator.validations_this_week < validator.validations_last_week
                        ? "text-red-600 border-red-600"
                        : ""
                    }
                  >
                    {getTrendBadge(validator.validations_this_week, validator.validations_last_week)}
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
