import { 
  Brain, 
  MessageSquare, 
  GitBranch, 
  Zap, 
  Clock, 
  Database, 
  Activity, 
  RefreshCw 
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Geconsolideerde definitie van alle AI Learning Edge Functions
 * 
 * Gebruik deze constanten in:
 * - useUnifiedAIHealth.ts (voor status queries)
 * - UnifiedAIHealthDashboard.tsx (voor display)
 */
export interface LearningFunction {
  /** Technische naam (moet matchen met edge function naam) */
  name: string;
  /** Weergave naam voor UI */
  displayName: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Beschrijving van wat de functie doet */
  description: string;
}

export const LEARNING_FUNCTIONS: LearningFunction[] = [
  { 
    name: 'unified-learner', 
    displayName: 'Unified Learner',
    icon: Brain,
    description: 'Centrale learning engine die alle feedback verwerkt en patterns detecteert'
  },
  { 
    name: 'feedback-processor', 
    displayName: 'Feedback Processor',
    icon: MessageSquare,
    description: 'Verwerkt gebruikersfeedback en past knowledge base aan'
  },
  { 
    name: 'knowledge-graph-builder', 
    displayName: 'Knowledge Graph',
    icon: GitBranch,
    description: 'Bouwt relaties tussen kennisitems voor betere context'
  },
  { 
    name: 'apply-meta-patterns', 
    displayName: 'Meta Patterns',
    icon: Zap,
    description: 'Past gedetecteerde success patterns toe op nieuwe data'
  },
  { 
    name: 'temporal-decay', 
    displayName: 'Temporal Decay',
    icon: Clock,
    description: 'Verlaagt confidence van verouderde kennis automatisch'
  },
  { 
    name: 'data-quality-auditor', 
    displayName: 'Data Quality',
    icon: Database,
    description: 'Controleert kwaliteit en consistentie van knowledge base'
  },
  { 
    name: 'smart-deduplicator', 
    displayName: 'Deduplicator',
    icon: Activity,
    description: 'Detecteert en verwijdert duplicate kennisitems'
  },
  { 
    name: 'process-system-events', 
    displayName: 'System Events',
    icon: RefreshCw,
    description: 'Verwerkt systeem events en triggert learning loops'
  },
];

/**
 * Helper om een LearningFunction te vinden op naam
 */
export function getLearningFunctionByName(name: string): LearningFunction | undefined {
  return LEARNING_FUNCTIONS.find(fn => fn.name === name);
}
