import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Types
type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type ScoreBreakdown = {
  klant_impact?: number;
  omzet_bescherming?: number;
  overgang_voorbereiding?: number;
  compliance?: number;
  operationeel?: number;
  // Legacy fields for backwards compatibility
  money?: number;
  urgency?: number;
  quality?: number;
  business?: number;
  growth?: number;
};

type TaskInput = {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  due_at: string | null;
  start_at: string | null;
  estimate_min: number | null;
  next_action: string | null;
  org_id: string;
  client_id?: string | null;
  revenue_impact_eur?: number | null;
  transition_related?: boolean | null;
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

// Default state with ABCzorg/CitoZorg specific weights
const DEFAULT_STATE_CITOZORG = {
  weights: {
    w_klant_impact: 0.50,           // Prisma/SIZA/SWZ/Lunet impact
    w_omzet_bescherming: 0.25,      // €19.600/week risk protection
    w_overgang_voorbereiding: 0.15, // ABCito construction / transition
    w_compliance: 0.07,             // Care standards
    w_operationeel: 0.03,           // Daily operations
  },
  percentiles: {},
  betas: {},
};

const DEFAULT_STATE_ABCZORG = {
  weights: {
    w_klant_diversiteit: 0.35,      // Broad customer portfolio (renamed from klant_impact)
    w_omzet_bescherming: 0.30,      // €28.000/week scale advantage
    w_overgang_voorbereiding: 0.20, // Mass transition to temporary workers
    w_compliance: 0.10,             // Complex compliance
    w_operationeel: 0.05,           // Daily operations
  },
  percentiles: {},
  betas: {},
};

// Utility functions
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

function getSegmentKey(orgId: string): string {
  return `org_${orgId}`;
}

// Helper to determine which default state to use
function getDefaultState(segmentKey: string, taskTitle: string = '') {
  // Check if ABCzorg or CitoZorg based on segment key or task context
  const isABCzorg = segmentKey.toLowerCase().includes('abczorg') || 
                    taskTitle.toLowerCase().includes('abczorg');
  
  if (isABCzorg) {
    return DEFAULT_STATE_ABCZORG;
  }
  return DEFAULT_STATE_CITOZORG;
}

// Initialize or get state from database
async function getOrCreateState(supabase: any, segmentKey: string, taskTitle: string = '') {
  const { data, error } = await supabase
    .from('prioritizer_state')
    .select('*')
    .eq('segment_key', segmentKey)
    .maybeSingle();

  if (error) {
    console.error('Error fetching state:', error);
  }

  const defaultState = getDefaultState(segmentKey, taskTitle);

  if (data) {
    return {
      ...data,
      weights: data.weights || defaultState.weights,
      percentiles: data.percentiles || {},
      betas: data.betas || {}
    };
  }

  // Create new state
  const { data: newState, error: insertError } = await supabase
    .from('prioritizer_state')
    .insert({
      segment_key: segmentKey,
      weights: defaultState.weights,
      betas: {},
      percentiles: { 
        scores: [], 
        klant_impact: [], 
        omzet_bescherming: [], 
        overgang_voorbereiding: [], 
        compliance: [], 
        operationeel: [] 
      }
    })
    .select()
    .single();

  if (insertError) {
    console.error('Error creating state:', insertError);
    return defaultState;
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

// Score calculation with care brokerage context
function calculateRawScores(task: TaskInput): ScoreBreakdown {
  const now = Date.now();
  const dueDate = task.due_at ? new Date(task.due_at).getTime() : null;
  const daysToDue = dueDate ? (dueDate - now) / (1000 * 60 * 60 * 24) : 999;

  // Determine company from task context
  const isABCzorg = task.title?.toLowerCase().includes('abczorg') || 
                    task.description?.toLowerCase().includes('abczorg');

  // Check for transition-related keywords
  const transitionKeywords = ['abcito', 'uitzendkracht', 'uitzend', 'transitie', 'zzp', 'overgang', '1/1/2026', '2026'];
  const isTransitionRelated = task.transition_related || transitionKeywords.some(keyword => 
    task.title?.toLowerCase().includes(keyword) || 
    task.description?.toLowerCase().includes(keyword)
  );

  // Client impact score (will be enhanced when client data is fetched)
  let klantImpact = 0.5; // Default
  if (task.client_id) {
    // For now, use priority as proxy for client importance
    const priorityWeights = { LOW: 0.3, MEDIUM: 0.5, HIGH: 0.8, CRITICAL: 1.0 };
    klantImpact = priorityWeights[task.priority];
  }

  // Revenue protection score
  const revenueImpact = Math.max(0, task.revenue_impact_eur || 0);
  const omzetBescherming = revenueImpact > 0 ? Math.min(1.0, revenueImpact / 5000) : 0.5;

  // Transition preparation score
  let overgangVoorbereiding = isTransitionRelated ? 0.8 : 0.3;
  
  // Add urgency boost based on 1/1/2026 deadline
  const transitionDeadline = new Date('2026-01-01').getTime();
  const daysToTransition = (transitionDeadline - now) / (1000 * 60 * 60 * 24);
  if (daysToTransition < 365 && daysToTransition > 0 && isTransitionRelated) {
    // Increase urgency as deadline approaches (up to +0.2)
    overgangVoorbereiding = Math.min(1.0, overgangVoorbereiding + (365 - daysToTransition) / 365 * 0.2);
  }

  // Compliance score (from business impact)
  const compliance = task.metadata?.business_impact_score || 0.5;

  // Operational score (inverse of complexity)
  const complexity = task.metadata?.complexity_score || 0.5;
  const operationeel = Math.max(0.1, 1 - complexity);

  // Calculate urgency from deadline
  let urgency = 0.3;
  if (daysToDue < 999) {
    if (daysToDue <= 0) urgency = 1.0;
    else if (daysToDue <= 1) urgency = 0.9;
    else if (daysToDue <= 3) urgency = 0.7;
    else if (daysToDue <= 7) urgency = 0.5;
    else if (daysToDue <= 14) urgency = 0.4;
    else urgency = 0.3;
  }

  // Boost urgency for transition tasks
  if (isTransitionRelated) {
    urgency = Math.max(urgency, 0.7);
  }

  return { 
    klant_impact: klantImpact, 
    omzet_bescherming: omzetBescherming, 
    overgang_voorbereiding: overgangVoorbereiding, 
    compliance, 
    operationeel,
    // Include urgency separately for label determination
    urgency
  };
}

function computeWSJF(breakdown: ScoreBreakdown, weights: any, estimateMin: number | null): number {
  // Calculate weighted components
  let totalValue = 0;
  
  console.log('[WSJF] Input weights:', weights);
  console.log('[WSJF] Input breakdown:', breakdown);
  
  // Map weight keys to breakdown keys
  const weightMapping: Record<string, string> = {
    w_klant_impact: 'klant_impact',
    w_klant_diversiteit: 'klant_impact', // ABCzorg uses this name but same metric
    w_omzet_bescherming: 'omzet_bescherming',
    w_overgang_voorbereiding: 'overgang_voorbereiding',
    w_compliance: 'compliance',
    w_operationeel: 'operationeel'
  };

  for (const [weightKey, weight] of Object.entries(weights)) {
    const breakdownKey = weightMapping[weightKey as string];
    if (breakdownKey && breakdown[breakdownKey as keyof ScoreBreakdown] !== undefined) {
      const rawScore = breakdown[breakdownKey as keyof ScoreBreakdown] as number;
      const contribution = rawScore * (weight as number);
      console.log(`[WSJF] ${weightKey} (${breakdownKey}): ${rawScore.toFixed(3)} * ${weight} = ${contribution.toFixed(3)}`);
      totalValue += contribution;
    } else {
      console.log(`[WSJF] Skipping ${weightKey}: no matching breakdown key`);
    }
  }

  console.log('[WSJF] Total value:', totalValue);

  // Job size (duration in hours)
  const jobSize = Math.max(0.5, (estimateMin ?? 60) / 60);
  const wsjf = totalValue / jobSize;
  
  console.log('[WSJF] Job size:', jobSize, 'hours, Final WSJF:', wsjf);

  // WSJF = Cost of Delay / Job Size
  return wsjf;
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
    const state = await getOrCreateState(supabaseClient, segmentKey, tasks[0].title);
    const weights = state.weights;
    const percentiles = state.percentiles || {
      scores: [],
      klant_impact: [],
      omzet_bescherming: [],
      overgang_voorbereiding: [],
      compliance: [],
      operationeel: []
    };

    // Calculate raw scores and update percentiles
    const results: ScoreOutput[] = [];
    
    for (const task of tasks) {
      console.log(`\n[TASK ${task.id}] Processing: "${task.title}"`);
      
      const rawBreakdown = calculateRawScores(task);
      console.log(`[TASK ${task.id}] Raw scores:`, rawBreakdown);
      
      // Store raw values for percentile calculation
      if (rawBreakdown.klant_impact !== undefined) {
        pushRolling(percentiles.klant_impact || [], rawBreakdown.klant_impact);
      }
      if (rawBreakdown.omzet_bescherming !== undefined) {
        pushRolling(percentiles.omzet_bescherming || [], rawBreakdown.omzet_bescherming);
      }
      if (rawBreakdown.overgang_voorbereiding !== undefined) {
        pushRolling(percentiles.overgang_voorbereiding || [], rawBreakdown.overgang_voorbereiding);
      }
      if (rawBreakdown.compliance !== undefined) {
        pushRolling(percentiles.compliance || [], rawBreakdown.compliance);
      }
      if (rawBreakdown.operationeel !== undefined) {
        pushRolling(percentiles.operationeel || [], rawBreakdown.operationeel);
      }

      // Normalize components
      const normalized: ScoreBreakdown = {
        klant_impact: normByP10P90(percentiles.klant_impact || [], rawBreakdown.klant_impact || 0.5),
        omzet_bescherming: normByP10P90(percentiles.omzet_bescherming || [], rawBreakdown.omzet_bescherming || 0.5),
        overgang_voorbereiding: normByP10P90(percentiles.overgang_voorbereiding || [], rawBreakdown.overgang_voorbereiding || 0.5),
        compliance: normByP10P90(percentiles.compliance || [], rawBreakdown.compliance || 0.5),
        operationeel: normByP10P90(percentiles.operationeel || [], rawBreakdown.operationeel || 0.5)
      };
      console.log(`[TASK ${task.id}] Normalized scores:`, normalized);

      // Calculate WSJF
      const wsjf = computeWSJF(normalized, weights, task.estimate_min);
      pushRolling(percentiles.scores || [], wsjf);
      console.log(`[TASK ${task.id}] Raw WSJF:`, wsjf);

      // Normalize final score to 0-100
      const priorityScore = Math.round(100 * normByP10P90(percentiles.scores || [], wsjf));
      console.log(`[TASK ${task.id}] Final priority score:`, priorityScore);

      // Determine label
      let label: "NORMAL" | "CRITICAL" | "LOW_PRIORITY" = "NORMAL";
      
      // Check for transition-related critical tasks
      const transitionKeywords = ['abcito', 'uitzendkracht', 'uitzend', 'transitie', 'zzp', 'overgang', '1/1/2026', '2026'];
      const isTransitionRelated = task.transition_related || transitionKeywords.some(keyword => 
        task.title?.toLowerCase().includes(keyword) || 
        task.description?.toLowerCase().includes(keyword)
      );
      
      if (priorityScore >= 85 || isTransitionRelated || (rawBreakdown.urgency && rawBreakdown.urgency >= 0.9 && task.priority === "CRITICAL")) {
        label = "CRITICAL";
      } else if (priorityScore < 25) {
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