/**
 * Circuit Breaker Pattern for External Service Protection
 * Version 1.0.0
 * 
 * Prevents cascading failures by temporarily blocking calls to failing external services.
 * 
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Service is failing, requests are blocked
 * - HALF_OPEN: Testing if service recovered, limited requests allowed
 */

// Generic Supabase client type to avoid version mismatches
// deno-lint-ignore no-explicit-any
type SupabaseClientType = any;
export const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,         // Open circuit after 5 consecutive failures
  cooldownMs: 30 * 60 * 1000,  // 30 minutes cooldown before half-open probe
  successThreshold: 2,         // 2 successes to close from half-open
  halfOpenMaxAttempts: 1,      // Only 1 probe attempt in half-open state
};

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerState {
  id: string;
  service_name: string;
  state: CircuitState;
  failure_count: number;
  success_count: number;
  last_failure_at: string | null;
  last_success_at: string | null;
  opened_at: string | null;
  half_open_at: string | null;
  last_error_message: string | null;
  metadata: Record<string, unknown>;
  updated_at: string;
}

export interface CanExecuteResult {
  allowed: boolean;
  state: CircuitBreakerState | null;
  reason: string;
  retryAfterMs?: number;
}

const DEFAULT_ORG = '550e8400-e29b-41d4-a716-446655440000'; // ABCzorg

/**
 * Get current circuit breaker state for a service
 */
export async function getCircuitState(
  supabase: SupabaseClientType,
  serviceName: string
): Promise<CircuitBreakerState | null> {
  const { data, error } = await supabase
    .from('circuit_breaker_state')
    .select('*')
    .eq('service_name', serviceName)
    .maybeSingle();

  if (error) {
    console.error(`[CircuitBreaker] Error fetching state for ${serviceName}:`, error);
    return null;
  }

  return data as CircuitBreakerState | null;
}

/**
 * Check if a request is allowed to proceed through the circuit breaker
 */
export async function canExecute(
  supabase: SupabaseClientType,
  serviceName: string
): Promise<CanExecuteResult> {
  const state = await getCircuitState(supabase, serviceName);

  // No record = service not tracked, allow by default
  if (!state) {
    console.log(`[CircuitBreaker] No state for ${serviceName}, creating default closed state`);
    
    // Create default closed state
    const { data: newState } = await supabase
      .from('circuit_breaker_state')
      .insert({
        service_name: serviceName,
        state: 'closed',
        metadata: { created_by: 'circuit-breaker-auto' },
      })
      .select()
      .maybeSingle();

    return {
      allowed: true,
      state: newState as CircuitBreakerState,
      reason: 'circuit_created_closed',
    };
  }

  const now = Date.now();

  // CLOSED: Normal operation - allow all requests
  if (state.state === 'closed') {
    return {
      allowed: true,
      state,
      reason: 'circuit_closed',
    };
  }

  // OPEN: Check if cooldown has passed
  if (state.state === 'open') {
    const openedAt = state.opened_at ? new Date(state.opened_at).getTime() : 0;
    const cooldownElapsed = now - openedAt >= CIRCUIT_BREAKER_CONFIG.cooldownMs;

    if (cooldownElapsed) {
      // Transition to half-open for probe
      console.log(`[CircuitBreaker] ${serviceName} cooldown elapsed, transitioning to half_open`);
      
      const { data: updatedState } = await supabase
        .from('circuit_breaker_state')
        .update({
          state: 'half_open',
          half_open_at: new Date().toISOString(),
          success_count: 0, // Reset for half-open tracking
          metadata: {
            ...state.metadata,
            last_state_change: new Date().toISOString(),
            transition: 'open_to_half_open',
          },
        })
        .eq('id', state.id)
        .select()
        .maybeSingle();

      // Log state change event
      await logCircuitEvent(supabase, serviceName, 'open', 'half_open', 'cooldown_elapsed');

      return {
        allowed: true,
        state: updatedState as CircuitBreakerState,
        reason: 'circuit_half_open_probe',
      };
    }

    // Still in cooldown - deny request
    const remainingMs = CIRCUIT_BREAKER_CONFIG.cooldownMs - (now - openedAt);
    
    return {
      allowed: false,
      state,
      reason: 'circuit_open_cooling_down',
      retryAfterMs: remainingMs,
    };
  }

  // HALF_OPEN: Allow limited probe requests
  if (state.state === 'half_open') {
    return {
      allowed: true,
      state,
      reason: 'circuit_half_open_probe',
    };
  }

  // Unknown state - allow by default
  return {
    allowed: true,
    state,
    reason: 'unknown_state_allowing',
  };
}

/**
 * Record a successful call - may close the circuit from half-open
 */
export async function recordSuccess(
  supabase: SupabaseClientType,
  serviceName: string
): Promise<CircuitBreakerState | null> {
  const state = await getCircuitState(supabase, serviceName);
  if (!state) return null;

  const now = new Date().toISOString();

  if (state.state === 'closed') {
    // Reset failure count on success
    const { data: updatedState } = await supabase
      .from('circuit_breaker_state')
      .update({
        failure_count: 0,
        last_success_at: now,
        last_error_message: null,
      })
      .eq('id', state.id)
      .select()
      .maybeSingle();

    console.log(`[CircuitBreaker] ${serviceName} success recorded (closed state)`);
    return updatedState as CircuitBreakerState;
  }

  if (state.state === 'half_open') {
    const newSuccessCount = (state.success_count || 0) + 1;

    if (newSuccessCount >= CIRCUIT_BREAKER_CONFIG.successThreshold) {
      // Enough successes - close the circuit
      console.log(`[CircuitBreaker] ${serviceName} recovered! Closing circuit after ${newSuccessCount} successes`);

      const { data: updatedState } = await supabase
        .from('circuit_breaker_state')
        .update({
          state: 'closed',
          failure_count: 0,
          success_count: 0,
          last_success_at: now,
          opened_at: null,
          half_open_at: null,
          last_error_message: null,
          metadata: {
            ...state.metadata,
            last_state_change: now,
            transition: 'half_open_to_closed',
            recovery_successes: newSuccessCount,
          },
        })
        .eq('id', state.id)
        .select()
        .maybeSingle();

      await logCircuitEvent(supabase, serviceName, 'half_open', 'closed', 'recovery_success');

      return updatedState as CircuitBreakerState;
    }

    // Increment success count
    const { data: updatedState } = await supabase
      .from('circuit_breaker_state')
      .update({
        success_count: newSuccessCount,
        last_success_at: now,
      })
      .eq('id', state.id)
      .select()
      .maybeSingle();

    console.log(`[CircuitBreaker] ${serviceName} half-open success ${newSuccessCount}/${CIRCUIT_BREAKER_CONFIG.successThreshold}`);
    return updatedState as CircuitBreakerState;
  }

  return state;
}

/**
 * Record a failed call - may open the circuit
 */
export async function recordFailure(
  supabase: SupabaseClientType,
  serviceName: string,
  errorMessage?: string
): Promise<CircuitBreakerState | null> {
  const state = await getCircuitState(supabase, serviceName);
  if (!state) return null;

  const now = new Date().toISOString();
  const truncatedError = errorMessage?.substring(0, 500) || 'Unknown error';

  if (state.state === 'closed') {
    const newFailureCount = (state.failure_count || 0) + 1;

    if (newFailureCount >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
      // Threshold reached - open the circuit
      console.log(`[CircuitBreaker] ⚠️ ${serviceName} OPENING circuit after ${newFailureCount} failures`);

      const { data: updatedState } = await supabase
        .from('circuit_breaker_state')
        .update({
          state: 'open',
          failure_count: newFailureCount,
          success_count: 0,
          last_failure_at: now,
          opened_at: now,
          last_error_message: truncatedError,
          metadata: {
            ...state.metadata,
            last_state_change: now,
            transition: 'closed_to_open',
            trigger_error: truncatedError,
          },
        })
        .eq('id', state.id)
        .select()
        .maybeSingle();

      await logCircuitEvent(supabase, serviceName, 'closed', 'open', 'failure_threshold_reached', {
        failure_count: newFailureCount,
        trigger_error: truncatedError,
      });

      return updatedState as CircuitBreakerState;
    }

    // Increment failure count
    const { data: updatedState } = await supabase
      .from('circuit_breaker_state')
      .update({
        failure_count: newFailureCount,
        last_failure_at: now,
        last_error_message: truncatedError,
      })
      .eq('id', state.id)
      .select()
      .maybeSingle();

    console.log(`[CircuitBreaker] ${serviceName} failure ${newFailureCount}/${CIRCUIT_BREAKER_CONFIG.failureThreshold}`);
    return updatedState as CircuitBreakerState;
  }

  if (state.state === 'half_open') {
    // Probe failed - reopen the circuit
    console.log(`[CircuitBreaker] ⚠️ ${serviceName} probe FAILED, reopening circuit`);

    const { data: updatedState } = await supabase
      .from('circuit_breaker_state')
      .update({
        state: 'open',
        failure_count: (state.failure_count || 0) + 1,
        success_count: 0,
        last_failure_at: now,
        opened_at: now, // Reset cooldown timer
        half_open_at: null,
        last_error_message: truncatedError,
        metadata: {
          ...state.metadata,
          last_state_change: now,
          transition: 'half_open_to_open',
          probe_failure: truncatedError,
        },
      })
      .eq('id', state.id)
      .select()
      .maybeSingle();

    await logCircuitEvent(supabase, serviceName, 'half_open', 'open', 'probe_failed', {
      trigger_error: truncatedError,
    });

    return updatedState as CircuitBreakerState;
  }

  // Already open - just update last failure
  const { data: updatedState } = await supabase
    .from('circuit_breaker_state')
    .update({
      failure_count: (state.failure_count || 0) + 1,
      last_failure_at: now,
      last_error_message: truncatedError,
    })
    .eq('id', state.id)
    .select()
    .maybeSingle();

  return updatedState as CircuitBreakerState;
}

/**
 * Force reset the circuit to closed state (admin action)
 */
export async function resetCircuit(
  supabase: SupabaseClientType,
  serviceName: string,
  reason: string = 'manual_reset'
): Promise<CircuitBreakerState | null> {
  const now = new Date().toISOString();

  const state = await getCircuitState(supabase, serviceName);
  const previousState = state?.state || 'unknown';

  const { data: updatedState } = await supabase
    .from('circuit_breaker_state')
    .update({
      state: 'closed',
      failure_count: 0,
      success_count: 0,
      opened_at: null,
      half_open_at: null,
      last_error_message: null,
      metadata: {
        last_state_change: now,
        transition: `${previousState}_to_closed`,
        reset_reason: reason,
      },
    })
    .eq('service_name', serviceName)
    .select()
    .maybeSingle();

  if (updatedState) {
    await logCircuitEvent(supabase, serviceName, previousState as CircuitState, 'closed', reason);
    console.log(`[CircuitBreaker] ${serviceName} manually reset to closed`);
  }

  return updatedState as CircuitBreakerState | null;
}

/**
 * Log circuit breaker events to ai_learning_events for observability
 */
async function logCircuitEvent(
  supabase: SupabaseClientType,
  serviceName: string,
  previousState: CircuitState | string,
  newState: CircuitState,
  trigger: string,
  additionalContext: Record<string, unknown> = {}
): Promise<void> {
  try {
    await supabase.from('ai_learning_events').insert({
      org_id: DEFAULT_ORG,
      event_type: 'circuit_breaker_state_change',
      context: {
        service: serviceName,
        previous_state: previousState,
        new_state: newState,
        trigger,
        config: CIRCUIT_BREAKER_CONFIG,
        ...additionalContext,
      },
      outcome: `${previousState}_to_${newState}`,
      confidence_score: 1.0,
    });
  } catch (error) {
    // Non-critical - log but don't fail
    console.log(`[CircuitBreaker] Failed to log event (non-critical):`, error);
  }
}

/**
 * Format circuit state for API responses
 */
export function formatCircuitStateForResponse(state: CircuitBreakerState | null): Record<string, unknown> {
  if (!state) {
    return { circuit_breaker: 'not_configured' };
  }

  const now = Date.now();
  const openedAt = state.opened_at ? new Date(state.opened_at).getTime() : 0;
  const remainingCooldownMs = state.state === 'open' 
    ? Math.max(0, CIRCUIT_BREAKER_CONFIG.cooldownMs - (now - openedAt))
    : 0;

  return {
    circuit_state: state.state,
    failure_count: state.failure_count,
    success_count: state.success_count,
    last_failure_at: state.last_failure_at,
    last_success_at: state.last_success_at,
    opened_at: state.opened_at,
    remaining_cooldown_ms: remainingCooldownMs,
    remaining_cooldown_seconds: Math.ceil(remainingCooldownMs / 1000),
    config: {
      failure_threshold: CIRCUIT_BREAKER_CONFIG.failureThreshold,
      cooldown_minutes: CIRCUIT_BREAKER_CONFIG.cooldownMs / 60000,
      success_threshold: CIRCUIT_BREAKER_CONFIG.successThreshold,
    },
  };
}
