/**
 * Central Recruitment Types
 * 
 * This file defines shared type definitions for the recruitment system,
 * establishing a consistent naming convention across the codebase.
 * 
 * NAMING CONVENTION:
 * - Database source: extracted_data->>'naam' (Dutch field name)
 * - API/View alias: candidate_name (English convention)
 * - Frontend display: candidate_name
 * 
 * This mapping provides clarity in tool parameters while maintaining
 * consistency with the extracted_data structure in the database.
 */

/**
 * Core candidate identification fields.
 * These fields are mapped from extracted_data at database view/API boundaries.
 */
export interface CandidateIdentifier {
  candidate_name: string;
  candidate_email: string;
  application_id: string;
}

/**
 * Interview scheduling details.
 * Used in Kalender.tsx, TaskDetailModal.tsx, and scheduling flows.
 */
export interface InterviewDetails extends Partial<CandidateIdentifier> {
  type?: string;
  interview_type?: 'phone' | 'video' | 'in_person';
  teams_link?: string;
  location?: string;
  duration_minutes?: number;
  interviewer_name?: string;
  interviewer_email?: string;
  organization_name?: string;
  [key: string]: unknown;
}

/**
 * Agent action data structure for pending AI actions.
 * Used in AgentActionCard.tsx and chat interactions.
 */
export interface AgentActionData {
  type: 'agent_action_pending';
  action_type: 'send_email' | 'send_followup' | 'schedule_interview' | 'request_documents';
  candidate_name: string;
  candidate_email: string;
  application_id: string;
  action_description: string;
  action_preview?: string;
  missing_fields?: string[];
  custom_message?: string;
  pending_goal_id?: string;
}

/**
 * Pending review structure for human review queue.
 * Maps database view fields to display-ready format.
 */
export interface PendingReview {
  id: string;
  application_id: string;
  org_id: string;
  review_type: string;
  escalation_reason: string;
  ai_recommendation: string | null;
  ai_confidence: number | null;
  ai_reasoning: unknown;
  status: string;
  priority: number;
  due_date: string | null;
  created_at: string;
  /** Mapped from extracted_data->>'naam' in database view */
  candidate_name: string;
  /** Mapped from extracted_data->>'email' or email_from in database view */
  candidate_email: string;
  functie_niveau: string | null;
  completeness_score: number | null;
  current_stage: string;
  application_created_at: string;
}

/**
 * Field label mappings for display purposes.
 * Used to translate internal field names to Dutch UI labels.
 */
export const FIELD_LABELS: Record<string, string> = {
  functie_niveau: 'Functieniveau',
  werkvorm: 'Werkvorm (ZZP/Uitzend)',
  regio: 'Voorkeursregio',
  beschikbaarheid: 'Beschikbaarheid',
  telefoonnummer: 'Telefoonnummer',
  ervaring_sector: 'Sector ervaring',
  doelgroep_ervaring: 'Doelgroep ervaring',
  diploma: 'Diploma',
};

/**
 * Action type configuration for agent actions.
 * Defines icons, labels, and styling for each action type.
 */
export const ACTION_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  send_email: { label: 'Email versturen', color: 'text-blue-500' },
  send_followup: { label: 'Follow-up email', color: 'text-amber-500' },
  schedule_interview: { label: 'Interview inplannen', color: 'text-green-500' },
  request_documents: { label: 'Documenten opvragen', color: 'text-purple-500' },
};
