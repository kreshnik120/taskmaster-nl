import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, TrendingUp, DollarSign, Calendar, Zap } from "lucide-react";
import { formatDistance } from "date-fns";
import { nl } from "date-fns/locale";

export function BudgetDashboard() {
  const { data: budget, isLoading: budgetLoading } = useQuery({
    queryKey: ['org-budget'],
    queryFn: async () => {
      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('org_id')
        .single();

      if (!userOrg) throw new Error('No organization');

      const { data, error } = await supabase
        .from('org_ai_budgets')
        .select('*')
        .eq('org_id', userOrg.org_id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
  });

  const { data: spending, isLoading: spendingLoading } = useQuery({
    queryKey: ['org-spending'],
    queryFn: async () => {
      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('org_id')
        .single();

      if (!userOrg) throw new Error('No organization');

      const { data, error } = await supabase
        .from('org_spending_summary')
        .select('*')
        .eq('org_id', userOrg.org_id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    refetchInterval: 30000, // Refresh elke 30 sec
  });

  const { data: recentAlerts } = useQuery({
    queryKey: ['spending-alerts'],
    queryFn: async () => {
      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('org_id')
        .single();

      if (!userOrg) throw new Error('No organization');

      const { data, error } = await supabase
        .from('spending_alerts')
        .select('*')
        .eq('org_id', userOrg.org_id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    },
  });

  if (budgetLoading || spendingLoading) {
    return <div className="text-muted-foreground">Laden...</div>;
  }

  if (!budget) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Geen budget geconfigureerd</AlertTitle>
        <AlertDescription>
          Er is nog geen AI-budget ingesteld voor jouw organisatie. Neem contact op met een admin.
        </AlertDescription>
      </Alert>
    );
  }

  const monthSpend = spending?.month_spend_eur || 0;
  const monthBudget = budget.monthly_budget_eur;
  const monthPercentage = (monthSpend / monthBudget) * 100;

  const todaySpend = spending?.today_spend_eur || 0;
  const dailyBudget = budget.daily_budget_eur || 0;
  const todayPercentage = dailyBudget > 0 ? (todaySpend / dailyBudget) * 100 : 0;

  const getStatusVariant = (pct: number): "default" | "destructive" | "secondary" | "outline" => {
    if (pct >= 100) return 'destructive';
    if (pct >= 95) return 'destructive';
    if (pct >= 80) return 'secondary';
    return 'default';
  };

  return (
    <div className="space-y-6">
      {monthPercentage >= 80 && (
        <Alert variant={monthPercentage >= 100 ? 'destructive' : 'default'}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {monthPercentage >= 100 ? 'Budget Limiet Bereikt!' : 'Budget Waarschuwing'}
          </AlertTitle>
          <AlertDescription>
            Je hebt {monthPercentage.toFixed(1)}% van het maandbudget gebruikt.
            {monthPercentage >= 100 && ' AI-functies zijn mogelijk geblokkeerd.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Maandbudget</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{monthSpend.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              van €{monthBudget.toFixed(2)}
            </p>
            <Progress value={Math.min(monthPercentage, 100)} className="mt-2" />
            <Badge variant={getStatusVariant(monthPercentage)} className="mt-2">
              {monthPercentage.toFixed(1)}% gebruikt
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vandaag</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{todaySpend.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              {dailyBudget > 0 ? `van €${dailyBudget.toFixed(2)}` : 'geen limiet'}
            </p>
            {dailyBudget > 0 && (
              <>
                <Progress value={Math.min(todayPercentage, 100)} className="mt-2" />
                <Badge variant={getStatusVariant(todayPercentage)} className="mt-2">
                  {todayPercentage.toFixed(1)}% gebruikt
                </Badge>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI Calls</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{spending?.today_calls || 0}</div>
            <p className="text-xs text-muted-foreground">vandaag</p>
            <p className="text-xs text-muted-foreground mt-1">
              {spending?.month_calls || 0} deze maand
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gem. per Call</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              €{(spending?.avg_cost_per_call || 0).toFixed(4)}
            </div>
            <p className="text-xs text-muted-foreground">
              {spending?.last_call_at 
                ? formatDistance(new Date(spending.last_call_at), new Date(), { 
                    addSuffix: true, 
                    locale: nl 
                  })
                : 'Nog geen calls'}
            </p>
          </CardContent>
        </Card>
      </div>

      {recentAlerts && recentAlerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recente Waarschuwingen</CardTitle>
            <CardDescription>Budget alerts van de afgelopen periode</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentAlerts.map((alert) => (
                <div key={alert.id} className="flex items-start gap-3 text-sm">
                  <AlertTriangle className={`h-4 w-4 mt-0.5 ${
                    alert.alert_type.includes('limit_reached') 
                      ? 'text-destructive' 
                      : 'text-yellow-500'
                  }`} />
                  <div className="flex-1">
                    <div className="font-medium">
                      {alert.alert_type === 'warning_80' && 'Budget waarschuwing (80%)'}
                      {alert.alert_type === 'critical_95' && 'Kritieke waarschuwing (95%)'}
                      {alert.alert_type === 'limit_reached_100' && 'Budget limiet bereikt'}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {formatDistance(new Date(alert.created_at), new Date(), { 
                        addSuffix: true, 
                        locale: nl 
                      })} - €{alert.current_spend_eur.toFixed(2)} / €{alert.budget_limit_eur.toFixed(2)}
                    </div>
                  </div>
                  <Badge variant={alert.resolved_at ? 'outline' : 'secondary'}>
                    {alert.resolved_at ? 'Opgelost' : 'Actief'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
