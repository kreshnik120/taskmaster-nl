import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PriorityScore {
  task_id: string;
  priority_score: number;
  rank: number;
  breakdown: {
    klant_impact: number;
    omzet_bescherming: number;
    overgang_voorbereiding: number;
    compliance: number;
    operationeel: number;
  };
  label: "NORMAL" | "CRITICAL" | "LOW_PRIORITY";
  explanation?: string;
}

interface Task {
  id: string;
  title: string;
  priority: string;
  due_at: string | null;
  next_action: string | null;
  task_scoring_metadata?: {
    estimated_value_eur: number | null;
    complexity_score: number | null;
    business_impact_score: number | null;
    market_demand_factor: number | null;
  } | null;
}

const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes cache
const SESSION_STORAGE_KEY = 'ai-scoring-cache';

interface CachedScore {
  score: PriorityScore;
  timestamp: number;
}

// Load cache from sessionStorage
const loadCacheFromStorage = (): Map<string, CachedScore> => {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return new Map(Object.entries(parsed));
    }
  } catch (error) {
    console.error('Error loading cache from sessionStorage:', error);
  }
  return new Map();
};

// Save cache to sessionStorage
const saveCacheToStorage = (cache: Map<string, CachedScore>) => {
  try {
    const obj = Object.fromEntries(cache);
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(obj));
  } catch (error) {
    console.error('Error saving cache to sessionStorage:', error);
  }
};

export const useAiScoring = (tasks: Task[], enableAutoScoring: boolean = false) => {
  const [priorityScores, setPriorityScores] = useState<Map<string, PriorityScore>>(new Map());
  const [loading, setLoading] = useState(false);
  const [cache, setCache] = useState<Map<string, CachedScore>>(() => loadCacheFromStorage());

  const calculateScores = useCallback(async (tasksToScore: Task[]) => {
    if (tasksToScore.length === 0) return;

    setLoading(true);
    try {
      // Filter out cached scores that are still valid
      const now = Date.now();
      const uncachedTasks = tasksToScore.filter(task => {
        const cached = cache.get(task.id);
        return !cached || (now - cached.timestamp) > CACHE_DURATION;
      });

      // Use cached scores immediately
      const newScores = new Map(priorityScores);
      tasksToScore.forEach(task => {
        const cached = cache.get(task.id);
        if (cached && (now - cached.timestamp) <= CACHE_DURATION) {
          newScores.set(task.id, cached.score);
        }
      });

      if (uncachedTasks.length > 0) {
        console.log(`🤖 AI Scoring ${uncachedTasks.length} tasks...`);
        
        const { data, error } = await supabase.functions.invoke('ai-task-scorer', {
          body: { tasks: uncachedTasks }
        });

        if (error) {
          console.error('AI scoring error:', error);
          throw error;
        }

        if (data?.scores) {
          const newCache = new Map(cache);
          data.scores.forEach((score: PriorityScore) => {
            newScores.set(score.task_id, score);
            newCache.set(score.task_id, { score, timestamp: now });
          });
          setCache(newCache);
          saveCacheToStorage(newCache);
          console.log(`✅ AI scoring completed for ${data.scores.length} tasks`);
        }
      } else {
        console.log(`✅ Using cached scores for all ${tasksToScore.length} tasks`);
      }

      setPriorityScores(newScores);
    } catch (error: any) {
      console.error('Error calculating AI scores:', error);
      toast.error('AI scoring tijdelijk niet beschikbaar');
    } finally {
      setLoading(false);
    }
  }, [cache, priorityScores]);

  // Auto-score on mount or when tasks change (if enabled)
  useEffect(() => {
    if (enableAutoScoring && tasks.length > 0) {
      calculateScores(tasks);
    }
  }, [enableAutoScoring, tasks.length]); // Only re-score when task count changes

  const getScoreForTask = useCallback((taskId: string): PriorityScore | undefined => {
    return priorityScores.get(taskId);
  }, [priorityScores]);

  const refreshScores = useCallback(() => {
    calculateScores(tasks);
  }, [tasks, calculateScores]);

  const scoreTask = useCallback(async (task: Task) => {
    await calculateScores([task]);
  }, [calculateScores]);

  return {
    priorityScores,
    loading,
    getScoreForTask,
    refreshScores,
    scoreTask,
    calculateScores
  };
};
