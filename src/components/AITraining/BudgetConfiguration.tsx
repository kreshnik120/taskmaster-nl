import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, AlertTriangle } from "lucide-react";

export function BudgetConfiguration() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    monthly_budget_eur: 100,
    daily_budget_eur: 10,
    warning_threshold_pct: 80,
    critical_threshold_pct: 95,
    enforce_hard_limit: true,
    allow_temporary_overage: false,
  });

  const { data: existingBudget, isLoading } = useQuery({
    queryKey: ['org-budget-config'],
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
      
      if (data) {
        setFormData({
          monthly_budget_eur: data.monthly_budget_eur,
          daily_budget_eur: data.daily_budget_eur || 10,
          warning_threshold_pct: data.warning_threshold_pct,
          critical_threshold_pct: data.critical_threshold_pct,
          enforce_hard_limit: data.enforce_hard_limit,
          allow_temporary_overage: data.allow_temporary_overage,
        });
      }
      
      return data;
    },
  });

  const saveBudgetMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', user.id)
        .single();

      if (!userOrg) throw new Error('No organization');

      const payload = {
        org_id: userOrg.org_id,
        ...formData,
        created_by: user.id,
      };

      if (existingBudget) {
        const { error } = await supabase
          .from('org_ai_budgets')
          .update(payload)
          .eq('org_id', userOrg.org_id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('org_ai_budgets')
          .insert(payload);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Budget instellingen opgeslagen');
      queryClient.invalidateQueries({ queryKey: ['org-budget'] });
      queryClient.invalidateQueries({ queryKey: ['org-budget-config'] });
    },
    onError: (error: any) => {
      toast.error('Fout bij opslaan', {
        description: error.message,
      });
    },
  });

  if (isLoading) return <div className="text-muted-foreground">Laden...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget Configuratie</CardTitle>
        <CardDescription>
          Stel limieten en waarschuwingsdrempels in voor AI-gebruik
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="monthly_budget">Maandelijks Budget (€)</Label>
            <Input
              id="monthly_budget"
              type="number"
              step="0.01"
              value={formData.monthly_budget_eur}
              onChange={(e) => setFormData({
                ...formData,
                monthly_budget_eur: parseFloat(e.target.value) || 0
              })}
            />
            <p className="text-xs text-muted-foreground">
              Maximaal budget per maand voor AI-calls
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="daily_budget">Dagelijks Budget (€)</Label>
            <Input
              id="daily_budget"
              type="number"
              step="0.01"
              value={formData.daily_budget_eur}
              onChange={(e) => setFormData({
                ...formData,
                daily_budget_eur: parseFloat(e.target.value) || 0
              })}
            />
            <p className="text-xs text-muted-foreground">
              Optioneel: dagelijkse limiet
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="warning_threshold">Waarschuwingsdrempel (%)</Label>
            <Input
              id="warning_threshold"
              type="number"
              min="0"
              max="100"
              value={formData.warning_threshold_pct}
              onChange={(e) => setFormData({
                ...formData,
                warning_threshold_pct: parseInt(e.target.value) || 80
              })}
            />
            <p className="text-xs text-muted-foreground">
              Stuur email bij dit percentage (standaard 80%)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="critical_threshold">Kritieke drempel (%)</Label>
            <Input
              id="critical_threshold"
              type="number"
              min="0"
              max="100"
              value={formData.critical_threshold_pct}
              onChange={(e) => setFormData({
                ...formData,
                critical_threshold_pct: parseInt(e.target.value) || 95
              })}
            />
            <p className="text-xs text-muted-foreground">
              Urgente waarschuwing bij dit percentage (standaard 95%)
            </p>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="enforce_hard_limit">Harde Limiet Afdwingen</Label>
              <p className="text-xs text-muted-foreground">
                Blokkeer AI-calls wanneer budget bereikt is
              </p>
            </div>
            <Switch
              id="enforce_hard_limit"
              checked={formData.enforce_hard_limit}
              onCheckedChange={(checked) => setFormData({
                ...formData,
                enforce_hard_limit: checked
              })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="allow_temporary_overage">Tijdelijke Overschrijding</Label>
              <p className="text-xs text-muted-foreground">
                Sta korte overschrijding toe bij harde limiet
              </p>
            </div>
            <Switch
              id="allow_temporary_overage"
              checked={formData.allow_temporary_overage}
              onCheckedChange={(checked) => setFormData({
                ...formData,
                allow_temporary_overage: checked
              })}
            />
          </div>
        </div>

        {formData.enforce_hard_limit && (
          <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md dark:bg-yellow-950/20 dark:border-yellow-800">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 mt-0.5" />
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>Let op:</strong> Met harde limiet ingeschakeld worden alle AI-functies 
              automatisch geblokkeerd wanneer het budget bereikt is.
            </p>
          </div>
        )}

        <Button 
          onClick={() => saveBudgetMutation.mutate()}
          disabled={saveBudgetMutation.isPending}
          className="w-full"
        >
          <Save className="h-4 w-4 mr-2" />
          {saveBudgetMutation.isPending ? 'Opslaan...' : 'Budget Instellingen Opslaan'}
        </Button>
      </CardContent>
    </Card>
  );
}
