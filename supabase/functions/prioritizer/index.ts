import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Types
type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type ScoreBreakdown = {
  money: number;
  urgency: number;
  quality: number;
  business: number;
  growth: number;
};

type TaskInput = {
  id: string;
  title: string;
  priority: Priority;
  due_at: string | null;
  start_at: string | null;
  estimate_min: number | null;
  next_action: string | null;
  org_id: string;
  metadata?: {
    estimated_value_eur?: number;
    complexity_score?: number;
    business_impact_score?: number;
    market_demand_factor?: number;
  };
};

type ScoreOutput = {
  task_id: string;
  priority_score: number;
  rank?: number;
  breakdown: ScoreBreakdown;
  label: "NORMAL" | "CRITICAL" | "LOW_PRIORITY";
};

// Utility functions
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

function getSegmentKey(orgId: string): string {
  return `org_${orgId}`;
}

// Initialize or get state from database
async function getOrCreateState(supabase: any, segmentKey: string) {
  const { data, error } = await supabase
    .from('prioritizer_state')
    .select('*')
    .eq('segment_key', segmentKey)
    .maybeSingle();

  if (error) {
    console.error('Error fetching state:', error);
  }

  if (data) {
    return data;
  }

  // Create new state
  const defaultWeights = {
    w_money: 0.30,
    w_urgency: 0.35,
    w_quality: 0.15,
    w_business: 0.15,
    w_growth: 0.05
  };

  const { data: newState, error: insertError } = await supabase
    .from('prioritizer_state')
    .insert({
      segment_key: segmentKey,
      weights: defaultWeights,
      betas: {},
      percentiles: { scores: [], money: [], urgency: [], quality: [], business: [], growth: [] }
    })
    .select()
    .single();

  if (insertError) {
    console.error('Error creating state:', insertError);
    throw insertError;
  }

  return newState;
}

async function updateState(supabase: any, segmentKey: string, updates: any) {
  const { error } = await supabase
    .from('prioritizer_state')
    .update({ ...updates, last_updated: new Date().toISOString() })
    .eq('segment_key', segmentKey);

  if (error) {
    console.error('Error updating state:', error);
  }
}

function normByP10P90(series: number[], x: number): number {
  if (series.length < 10) {
    const min = Math.min(...(series.length ? series : [x, x - 1]), x);
    const max = Math.max(...(series.length ? series : [x, x + 1]), x, min + 1e-9);
    return clamp((x - min) / (max - min), 0, 1);
  }
  const sorted = [...series].sort((a, b) => a - b);
  const p10 = sorted[Math.floor(0.1 * (sorted.length - 1))];
  const p90 = Math.max(p10 + 1e-9, sorted[Math.floor(0.9 * (sorted.length - 1))]);
  return clamp((x - p10) / (p90 - p10), 0, 1);
}

function pushRolling(arr: number[], val: number, cap = 500): void {
  arr.push(val);
  if (arr.length > cap) arr.shift();
}

// Score calculation
function calculateRawScores(task: TaskInput): ScoreBreakdown {
  const priorityWeights = { LOW: 0.2, MEDIUM: 0.5, HIGH: 0.8, CRITICAL: 1.0 };
  
  // Money component (based on priority and estimated value)
  const priorityBase = priorityWeights[task.priority];
  const valueMultiplier = task.metadata?.estimated_value_eur 
    ? Math.min(task.metadata.estimated_value_eur / 10000, 2.0)
    : 1.0;
  const moneyRaw = priorityBase * valueMultiplier;

  // Urgency component (based on due date)
  let urgencyRaw = 0;
  if (task.due_at) {
    const now = new Date();
    const due = new Date(task.due_at);
    const hoursUntilDue = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    if (hoursUntilDue < 0) {
      // Overdue - critical urgency
      urgencyRaw = 1.0 + Math.min(Math.abs(hoursUntilDue) / 48, 0.5);
    } else if (hoursUntilDue <= 24) {
      urgencyRaw = 0.9;
    } else if (hoursUntilDue <= 48) {
      urgencyRaw = 0.7;
    } else if (hoursUntilDue <= 168) { // 1 week
      urgencyRaw = 0.5;
    } else {
      urgencyRaw = 0.3;
    }
  } else {
    urgencyRaw = 0.2; // No due date
  }

  // Quality component (based on next_action and complexity)
  const hasNextAction = task.next_action ? 0.8 : 0.3;
  const complexityFactor = task.metadata?.complexity_score ?? 0.5;
  const qualityRaw = hasNextAction * (1 - complexityFactor * 0.3);

  // Business impact component
  const businessRaw = task.metadata?.business_impact_score ?? 0.5;

  // Growth component (market demand and strategic value)
  const marketFactor = task.metadata?.market_demand_factor ?? 1.0;
  const growthRaw = Math.min(marketFactor * 0.5, 1.0);

  return {
    money: moneyRaw,
    urgency: urgencyRaw,
    quality: qualityRaw,
    business: businessRaw,
    growth: growthRaw
  };
}

function computeWSJF(breakdown: ScoreBreakdown, weights: any, estimateMin: number | null): number {
  const { money, urgency, quality, business, growth } = breakdown;
  
  // Cost of delay
  const CoD = (
    weights.w_money * money +
    weights.w_urgency * urgency +
    weights.w_quality * quality +
    weights.w_business * business +
    weights.w_growth * growth
  );

  // Job size (duration in hours)
  const jobSize = Math.max(0.5, (estimateMin ?? 60) / 60);

  // WSJF = Cost of Delay / Job Size
  return CoD / jobSize;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { tasks } = await req.json() as { tasks: TaskInput[] };

    if (!tasks || tasks.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No tasks provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get or create state for the first task's org
    const segmentKey = getSegmentKey(tasks[0].org_id);
    const state = await getOrCreateState(supabaseClient, segmentKey);
    const weights = state.weights;
    const percentiles = state.percentiles;

    // Calculate raw scores and update percentiles
    const results: ScoreOutput[] = [];
    
    for (const task of tasks) {
      const rawBreakdown = calculateRawScores(task);
      
      // Store raw values for percentile calculation
      pushRolling(percentiles.money, rawBreakdown.money);
      pushRolling(percentiles.urgency, rawBreakdown.urgency);
      pushRolling(percentiles.quality, rawBreakdown.quality);
      pushRolling(percentiles.business, rawBreakdown.business);
      pushRolling(percentiles.growth, rawBreakdown.growth);

      // Normalize components
      const normalized = {
        money: normByP10P90(percentiles.money, rawBreakdown.money),
        urgency: normByP10P90(percentiles.urgency, rawBreakdown.urgency),
        quality: normByP10P90(percentiles.quality, rawBreakdown.quality),
        business: normByP10P90(percentiles.business, rawBreakdown.business),
        growth: normByP10P90(percentiles.growth, rawBreakdown.growth)
      };

      // Calculate WSJF
      const wsjf = computeWSJF(normalized, weights, task.estimate_min);
      pushRolling(percentiles.scores, wsjf);

      // Normalize final score to 0-100
      const priorityScore = Math.round(100 * normByP10P90(percentiles.scores, wsjf));

      // Determine label
      let label: "NORMAL" | "CRITICAL" | "LOW_PRIORITY" = "NORMAL";
      if (priorityScore >= 90 || (rawBreakdown.urgency >= 1.0 && task.priority === "CRITICAL")) {
        label = "CRITICAL";
      } else if (priorityScore < 20) {
        label = "LOW_PRIORITY";
      }

      results.push({
        task_id: task.id,
        priority_score: clamp(priorityScore, 0, 100),
        breakdown: normalized,
        label
      });
    }

    // Sort by priority score
    results.sort((a, b) => b.priority_score - a.priority_score);
    results.forEach((r, i) => r.rank = i + 1);

    // Update state
    await updateState(supabaseClient, segmentKey, { percentiles });

    return new Response(
      JSON.stringify({
        generated_at: new Date().toISOString(),
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in prioritizer function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
