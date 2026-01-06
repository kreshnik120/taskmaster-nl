// ============================================================================
// ENTERPRISE REACT AI AGENT: Shared Types & Interfaces
// ============================================================================

/**
 * A single step in the ReAct reasoning loop
 */
export interface ReActStep {
  step_number: number;
  thought: string;           // Agent's reasoning about what to do
  action: string | null;     // Tool name to execute (null if final answer)
  action_input: Record<string, unknown> | null;
  observation: string | null; // Tool result or error message
  timestamp: string;
  execution_ms?: number;
}

/**
 * Result of a complete ReAct session
 */
export interface ReActResult {
  success: boolean;
  final_answer: string | null;
  steps: ReActStep[];
  total_tokens_used: number;
  total_duration_ms: number;
  tools_executed: string[];
  error?: string;
}

/**
 * Configuration for the ReAct agent
 */
export interface ReActConfig {
  max_steps: number;
  max_same_tool_consecutive: number;
  max_emails_per_session: number;
  max_database_mutations: number;
  timeout_seconds: number;
  critical_actions: string[];
  fallback_on_error: boolean;
}

/**
 * Tool definition in the unified registry
 */
export interface ToolDefinition {
  name: string;
  description: string;
  category: 'database' | 'action' | 'knowledge' | 'orchestration' | 'search';
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      required?: boolean;
      enum?: string[];
    }>;
    required: string[];
  };
  requires_approval: boolean;
  stability_score?: number;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  data: unknown;
  error?: string;
  execution_ms: number;
}

/**
 * Working memory for a ReAct session
 */
export interface WorkingMemory {
  session_id: string;
  goal: string;
  context: Record<string, unknown>;
  steps: ReActStep[];
  tool_call_counts: Record<string, number>;
  entities_discovered: Record<string, unknown>[];
  start_time: number;
}

/**
 * Session trace for persistence and debugging
 */
export interface SessionTrace {
  org_id: string;
  session_id: string;
  goal_type?: string;
  goal_description: string;
  natural_language_goal?: string;
  input_data: Record<string, unknown>;
  steps: ReActStep[];
  final_answer?: string;
  outcome: 'success' | 'failure' | 'partial' | 'timeout' | 'human_approval_required';
  total_tokens_used: number;
  total_duration_ms: number;
  tool_usage_stats: Record<string, { count: number; success: number; failure: number; avg_ms: number }>;
  tools_executed: string[];
  learning_applied: boolean;
  error_message?: string;
  metadata: Record<string, unknown>;
}

/**
 * Legacy goal type mapping for backwards compatibility
 */
export interface LegacyGoalMapping {
  natural_language: string;
  suggested_tools: string[];
  success_criteria: string;
  priority_fields?: string[];
}

/**
 * Weighted tool candidate for selection
 */
export interface WeightedToolCandidate {
  name: string;
  weight: number;
  stability_score: number;
  semantic_match: number;
  historical_success: number;
  recency_bonus: number;
}

/**
 * Human approval request
 */
export interface ApprovalRequest {
  session_id: string;
  trace_id?: string;
  action_type: string;
  tool_name: string;
  input_data: Record<string, unknown>;
  reason: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Default configuration values
 */
export const DEFAULT_REACT_CONFIG: ReActConfig = {
  max_steps: 15,
  max_same_tool_consecutive: 3,
  max_emails_per_session: 5,
  max_database_mutations: 10,
  timeout_seconds: 120,
  critical_actions: ['delete_professional', 'reject_application', 'send_contract', 'bulk_email'],
  fallback_on_error: true,
};
