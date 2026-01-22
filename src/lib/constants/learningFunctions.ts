import { 
  Brain, 
  GitBranch, 
  Zap, 
  Clock, 
  Database, 
  Activity, 
  RefreshCw,
  Workflow,
  Hand,
  FileCheck,
  CalendarCheck,
  UserCheck,
  Award
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
  /** Optioneel: categorie voor groupering */
  category?: 'learning' | 'pipeline' | 'specialist';
}

// Learning functions - consolidated after shim migration
// Removed: feedback-processor, continuous-learner, learn-from-pipeline, retroactive-training-evaluator, process-feedback (all migrated to unified-learner)
export const LEARNING_FUNCTIONS: LearningFunction[] = [
  // === Core Learning Functions ===
  { 
    name: 'unified-learner', 
    displayName: 'Unified Learner',
    icon: Brain,
    description: 'Centrale learning engine - verwerkt chat analyse, pipeline learning, feedback en retroactive scans',
    category: 'learning'
  },
  { 
    name: 'knowledge-graph-builder', 
    displayName: 'Knowledge Graph',
    icon: GitBranch,
    description: 'Bouwt relaties tussen kennisitems voor betere context',
    category: 'learning'
  },
  { 
    name: 'apply-meta-patterns', 
    displayName: 'Meta Patterns',
    icon: Zap,
    description: 'Past gedetecteerde success patterns toe op nieuwe data',
    category: 'learning'
  },
  { 
    name: 'temporal-decay', 
    displayName: 'Temporal Decay',
    icon: Clock,
    description: 'Verlaagt confidence van verouderde kennis automatisch',
    category: 'learning'
  },
  { 
    name: 'data-quality-auditor', 
    displayName: 'Data Quality',
    icon: Database,
    description: 'Controleert kwaliteit en consistentie van knowledge base',
    category: 'learning'
  },
  { 
    name: 'smart-deduplicator', 
    displayName: 'Deduplicator',
    icon: Activity,
    description: 'Detecteert en verwijdert duplicate kennisitems',
    category: 'learning'
  },
  { 
    name: 'process-system-events', 
    displayName: 'System Events',
    icon: RefreshCw,
    description: 'Verwerkt systeem events en triggert learning loops',
    category: 'learning'
  },
  
  // === Pipeline Management ===
  { 
    name: 'pipeline-stage-controller', 
    displayName: 'Pipeline Controller',
    icon: Workflow,
    description: 'Centrale stage transition validator en multi-agent router',
    category: 'pipeline'
  },
  
  // === Specialist Agents ===
  { 
    name: 'agent-welkom', 
    displayName: 'Welkom Agent',
    icon: Hand,
    description: 'Handles nieuw → intake_verstuurd: stuurt welkom emails en vraagt ontbrekende info',
    category: 'specialist'
  },
  { 
    name: 'agent-document', 
    displayName: 'Document Agent',
    icon: FileCheck,
    description: 'Handles intake_verstuurd: verifieert documenten en triggert DUO/GAAV validatie',
    category: 'specialist'
  },
  { 
    name: 'agent-planning', 
    displayName: 'Planning Agent',
    icon: CalendarCheck,
    description: 'Handles intake_verstuurd → gesprek_gepland: plant gesprekken wanneer docs compleet zijn',
    category: 'specialist'
  },
  { 
    name: 'agent-screening', 
    displayName: 'Screening Agent',
    icon: UserCheck,
    description: 'Handles gesprek_gepland → screening: verwerkt interview feedback en VOG requests',
    category: 'specialist'
  },
  { 
    name: 'agent-placement', 
    displayName: 'Placement Agent',
    icon: Award,
    description: 'Handles screening → goedgekeurd: finaliseert goedkeuring en notificeert recruiters',
    category: 'specialist'
  },
];

/**
 * Helper om een LearningFunction te vinden op naam
 */
export function getLearningFunctionByName(name: string): LearningFunction | undefined {
  return LEARNING_FUNCTIONS.find(fn => fn.name === name);
}

