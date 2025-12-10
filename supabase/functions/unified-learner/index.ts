/**
 * UNIFIED LEARNER - Central AI Learning Endpoint
 * 
 * Consolidates all learning functions into a single, type-safe endpoint.
 * All legacy learning functions now route here as shims.
 * 
 * Supported actions:
 * - analyze_chat: Deep analysis of chat interactions
 * - learn_pipeline: Learn from recruitment pipeline transitions
 * - process_feedback: Process user feedback (single or batch)
 * - retroactive_scan: Re-evaluate previously rejected learning events
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  corsHeaders,
  handleCors,
  jsonResponse,
  errorResponse,
} from "../_shared/core.ts";
import {
  analyzeChatLearning,
  processFeedbackLearning,
  pipelineLearning,
  retroactiveScanLearning,
} from "../_shared/learning-engine.ts";

// ============================================================================
// TYPE DEFINITIONS - Discriminated Union for Type Safety
// ============================================================================

interface AnalyzeChatRequest {
  action: 'analyze_chat';
  user_question: string;
  ai_response: string;
  knowledge_used?: string[];
  user_feedback?: 'helpful' | 'harmful' | null;
  auto_apply?: boolean;
  org_id: string;
  user_id?: string;
}

interface LearnPipelineRequest {
  action: 'learn_pipeline';
  days_back?: number;
  org_id: string;
  user_id?: string;
}

interface ProcessFeedbackRequest {
  action: 'process_feedback';
  batch_mode?: boolean;
  // Single feedback mode
  knowledge_ids?: string[];
  feedback_type?: 'helpful' | 'harmful';
  message_context?: string;
  // Batch mode uses internal query
  org_id: string;
  user_id?: string;
}

interface RetroactiveScanRequest {
  action: 'retroactive_scan';
  min_confidence?: number;
  max_confidence?: number;
  limit?: number;
  org_id: string;
  user_id?: string;
}

type UnifiedLearnerRequest =
  | AnalyzeChatRequest
  | LearnPipelineRequest
  | ProcessFeedbackRequest
  | RetroactiveScanRequest;

// ============================================================================
// REQUEST VALIDATION
// ============================================================================

function validateRequest(body: unknown): { valid: true; request: UnifiedLearnerRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const req = body as Record<string, unknown>;

  if (!req.action || typeof req.action !== 'string') {
    return { valid: false, error: 'action is required (analyze_chat, learn_pipeline, process_feedback, retroactive_scan)' };
  }

  if (!req.org_id || typeof req.org_id !== 'string') {
    return { valid: false, error: 'org_id is required' };
  }

  switch (req.action) {
    case 'analyze_chat':
      if (!req.user_question || typeof req.user_question !== 'string') {
        return { valid: false, error: 'user_question is required for analyze_chat' };
      }
      if (!req.ai_response || typeof req.ai_response !== 'string') {
        return { valid: false, error: 'ai_response is required for analyze_chat' };
      }
      return { 
        valid: true, 
        request: {
          action: 'analyze_chat',
          user_question: req.user_question as string,
          ai_response: req.ai_response as string,
          knowledge_used: req.knowledge_used as string[] | undefined,
          user_feedback: req.user_feedback as 'helpful' | 'harmful' | null | undefined,
          auto_apply: req.auto_apply as boolean | undefined,
          org_id: req.org_id as string,
          user_id: req.user_id as string | undefined,
        }
      };

    case 'learn_pipeline':
      return { 
        valid: true, 
        request: {
          action: 'learn_pipeline',
          days_back: req.days_back as number | undefined,
          org_id: req.org_id as string,
          user_id: req.user_id as string | undefined,
        }
      };

    case 'process_feedback':
      // Single mode requires knowledge_ids and feedback_type
      if (!req.batch_mode) {
        if (!req.knowledge_ids || !Array.isArray(req.knowledge_ids)) {
          return { valid: false, error: 'knowledge_ids array is required for single feedback mode' };
        }
        if (!req.feedback_type || !['helpful', 'harmful'].includes(req.feedback_type as string)) {
          return { valid: false, error: 'feedback_type (helpful/harmful) is required for single feedback mode' };
        }
      }
      return { 
        valid: true, 
        request: {
          action: 'process_feedback',
          batch_mode: req.batch_mode as boolean | undefined,
          knowledge_ids: req.knowledge_ids as string[] | undefined,
          feedback_type: req.feedback_type as 'helpful' | 'harmful' | undefined,
          message_context: req.message_context as string | undefined,
          org_id: req.org_id as string,
          user_id: req.user_id as string | undefined,
        }
      };

    case 'retroactive_scan':
      return { 
        valid: true, 
        request: {
          action: 'retroactive_scan',
          min_confidence: req.min_confidence as number | undefined,
          max_confidence: req.max_confidence as number | undefined,
          limit: req.limit as number | undefined,
          org_id: req.org_id as string,
          user_id: req.user_id as string | undefined,
        }
      };

    default:
      return { valid: false, error: `Unknown action: ${req.action}` };
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();
  let action = 'unknown';

  try {
    // Parse request body
    const body = await req.json();
    
    // Validate request
    const validation = validateRequest(body);
    if (!validation.valid) {
      return errorResponse(validation.error, 400);
    }

    const request = validation.request;
    action = request.action;

    console.log(`🎓 Unified Learner - Action: ${action}, Org: ${request.org_id}`);

    // Create supabase client with admin access (same version as learning-engine)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const orgId = request.org_id;
    const userId = request.user_id || null;

    // Route to appropriate handler
    let result;

    switch (request.action) {
      case 'analyze_chat':
        result = await analyzeChatLearning(supabase, {
          user_question: request.user_question,
          ai_response: request.ai_response,
          knowledge_used: request.knowledge_used,
          user_feedback: request.user_feedback ?? undefined,
          org_id: orgId,
          user_id: userId ?? undefined,
        }, {
          auto_apply: request.auto_apply ?? true,
        });
        break;

      case 'learn_pipeline':
        result = await pipelineLearning(supabase, {
          days_back: request.days_back ?? 7,
          org_id: orgId,
        });
        break;

      case 'process_feedback':
        if (request.batch_mode) {
          // Batch mode - process all pending feedback events
          result = await processFeedbackLearning(supabase, {
            batch_mode: true,
            feedback: 'helpful', // Placeholder, batch mode queries events
            org_id: orgId,
            user_id: userId ?? undefined,
          });
        } else {
          // Single feedback mode
          result = await processFeedbackLearning(supabase, {
            knowledge_ids: request.knowledge_ids!,
            feedback: request.feedback_type!,
            context: request.message_context ? { message: request.message_context } : undefined,
            org_id: orgId,
            user_id: userId ?? undefined,
          });
        }
        break;

      case 'retroactive_scan':
        result = await retroactiveScanLearning(supabase, {
          min_confidence: request.min_confidence ?? 0.80,
          max_confidence: request.max_confidence ?? 0.85,
          limit: request.limit ?? 100,
        });
        break;

      default:
        return errorResponse(`Unhandled action: ${action}`, 400);
    }

    const executionTime = Date.now() - startTime;

    // Log function call
    try {
      await supabase.from('function_call_logs').insert({
        function_name: 'unified-learner',
        org_id: orgId,
        user_id: userId,
        success: result.success,
        execution_time_ms: executionTime,
        metadata: {
          action,
          processed: result.processed || 0,
          created: result.created || 0,
          updated: result.updated || 0,
        },
      });
    } catch (logError) {
      console.warn('Failed to log function call:', logError);
    }

    console.log(`✅ Unified Learner completed: action=${action}, processed=${result.processed || 0}, time=${executionTime}ms`);

    return jsonResponse({
      ...result,
      action,
      execution_time_ms: executionTime,
    });

  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error(`❌ Unified Learner error (action=${action}):`, error);

    // Try to log error
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      await supabase.from('function_call_logs').insert({
        function_name: 'unified-learner',
        org_id: null,
        user_id: null,
        success: false,
        execution_time_ms: executionTime,
        metadata: { action, error: error instanceof Error ? error.message : String(error) },
      });
    } catch {
      // Ignore logging errors
    }

    return errorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
});
