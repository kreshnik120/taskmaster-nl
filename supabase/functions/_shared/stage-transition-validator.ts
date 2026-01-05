/**
 * Stage Transition Validator
 * 
 * Uniforme helper voor validatie van pipeline stage transities
 * tegen de STAGE_COMPLIANCE_GATES gedefinieerd in healthcare-mappings.ts
 * 
 * Dit bestand is de single source of truth voor stage transitie validatie
 * en wordt gebruikt door:
 * - auto-send-interview-slots
 * - handle-application-reply
 * - ai-agent-orchestrator
 * - process-system-events
 */

import {
  STAGE_COMPLIANCE_GATES,
  validateStageTransition,
  hasField,
  type StageComplianceGate,
} from './healthcare-mappings.ts';

/**
 * Application data needed for compliance validation
 */
export interface ApplicationComplianceData {
  completenessScore: number;
  cvFilePath: string | null;
  diplomaFilePath: string | null;
  diplomaValidationStatus: string | null;
  vogFilePath: string | null;
  vogValidationStatus: string | null;
  extractedData: Record<string, unknown>;
  pipelineStage: string;
}

/**
 * Result of compliance validation
 */
export interface ComplianceValidationResult {
  allowed: boolean;
  blockers: string[];
  presentDocs: string[];
  presentFields: string[];
  targetGate: StageComplianceGate | null;
}

/**
 * Determines which documents are present for an application
 */
export function getPresentDocuments(data: ApplicationComplianceData): string[] {
  const presentDocs: string[] = [];
  
  // CV check
  if (data.cvFilePath || data.extractedData?.cv_file_path) {
    presentDocs.push('cv');
  }
  
  // Diploma check - either file uploaded or verified via DUO/EMREX
  if (
    data.diplomaFilePath || 
    data.extractedData?.diploma_file_path ||
    data.diplomaValidationStatus === 'verified_duo' ||
    data.diplomaValidationStatus === 'verified_emrex'
  ) {
    presentDocs.push('diploma');
  }
  
  // VOG check - either file uploaded or verified via GAAV
  if (
    data.vogFilePath ||
    data.extractedData?.vog_file_path ||
    data.vogValidationStatus === 'verified_gaav' ||
    data.vogValidationStatus === 'valid'
  ) {
    presentDocs.push('vog');
  }
  
  return presentDocs;
}

/**
 * Determines which required fields are present for a target stage
 */
export function getPresentFields(
  extractedData: Record<string, unknown>,
  targetStage: string
): string[] {
  const gate = STAGE_COMPLIANCE_GATES[targetStage];
  if (!gate) return [];
  
  const presentFields: string[] = [];
  
  for (const field of gate.requiredFields) {
    if (hasField(extractedData, field)) {
      presentFields.push(field);
    }
  }
  
  return presentFields;
}

/**
 * Validates if a stage transition is allowed based on compliance gates
 * 
 * @param currentStage - Current pipeline stage
 * @param targetStage - Target pipeline stage to transition to
 * @param data - Application data for compliance check
 * @returns ComplianceValidationResult with allowed status and blockers
 */
export function canTransitionToStage(
  currentStage: string,
  targetStage: string,
  data: ApplicationComplianceData
): ComplianceValidationResult {
  const targetGate = STAGE_COMPLIANCE_GATES[targetStage] || null;
  
  if (!targetGate) {
    return {
      allowed: true,
      blockers: [],
      presentDocs: [],
      presentFields: [],
      targetGate: null
    };
  }
  
  const presentDocs = getPresentDocuments(data);
  const presentFields = getPresentFields(data.extractedData, targetStage);
  
  const result = validateStageTransition(
    currentStage,
    targetStage,
    data.completenessScore,
    presentDocs,
    presentFields
  );
  
  return {
    allowed: result.allowed,
    blockers: result.blockers,
    presentDocs,
    presentFields,
    targetGate
  };
}

/**
 * Checks if interview scheduling is allowed for an application
 * 
 * Interview stage requires:
 * - minCompleteness: 70%
 * - requiredDocs: ['cv']
 * - requiredFields: ['naam', 'email', 'functie_niveau', 'werkvorm', 'regio', 'telefoonnummer']
 */
export function canScheduleInterview(data: ApplicationComplianceData): ComplianceValidationResult {
  return canTransitionToStage(data.pipelineStage, 'interview', data);
}

/**
 * Checks if professional creation is allowed for an application
 * 
 * Goedgekeurd stage requires:
 * - minCompleteness: 85%
 * - requiredDocs: ['cv', 'diploma']
 * - requiredFields: ['naam', 'email', 'functie_niveau', 'werkvorm', 'regio', 'telefoonnummer', 'beschikbaarheid']
 */
export function canCreateProfessional(data: ApplicationComplianceData): ComplianceValidationResult {
  return canTransitionToStage(data.pipelineStage, 'goedgekeurd', data);
}

/**
 * Checks if placement is allowed for an application
 * 
 * Geplaatst stage requires:
 * - minCompleteness: 95%
 * - requiredDocs: ['cv', 'diploma', 'vog']
 * - requiredFields: all critical fields
 */
export function canPlaceProfessional(data: ApplicationComplianceData): ComplianceValidationResult {
  return canTransitionToStage(data.pipelineStage, 'geplaatst', data);
}

/**
 * Formats compliance blockers for user-friendly display
 */
export function formatBlockersForDisplay(blockers: string[]): string {
  if (blockers.length === 0) return '';
  
  return blockers.map(blocker => `• ${blocker}`).join('\n');
}

/**
 * Gets the next required action based on current compliance status
 */
export function getNextRequiredAction(
  data: ApplicationComplianceData,
  targetStage: string
): string | null {
  const result = canTransitionToStage(data.pipelineStage, targetStage, data);
  
  if (result.allowed) return null;
  
  // Prioritize document collection over field collection
  const docBlocker = result.blockers.find(b => b.includes('Ontbrekende documenten'));
  if (docBlocker) {
    if (!result.presentDocs.includes('cv')) {
      return 'request_cv_upload';
    }
    if (!result.presentDocs.includes('diploma')) {
      return 'request_diploma_upload';
    }
    if (!result.presentDocs.includes('vog')) {
      return 'request_vog_upload';
    }
  }
  
  // Then field collection
  const fieldBlocker = result.blockers.find(b => b.includes('Ontbrekende velden'));
  if (fieldBlocker) {
    return 'request_missing_info';
  }
  
  // Finally completeness
  const completenessBlocker = result.blockers.find(b => b.includes('Completeness'));
  if (completenessBlocker) {
    return 'request_missing_info';
  }
  
  return null;
}
