import * as React from "react";
import { cn } from "@/lib/utils";
import { getScoreColor, getScoreProgressColor, PROGRESS_HEIGHTS, TRANSITIONS } from "@/lib/constants/designTokens";

interface MatchScoreIndicatorProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showProgress?: boolean;
  className?: string;
}

/**
 * Apple-style unified match score indicator
 * Used consistently across all matching views
 */
export function MatchScoreIndicator({ 
  score, 
  size = 'md', 
  showProgress = true,
  className 
}: MatchScoreIndicatorProps) {
  const roundedScore = Math.round(score);
  
  const sizeClasses = {
    sm: {
      container: 'gap-1.5',
      score: 'text-sm font-medium',
      percent: 'text-xs',
      progress: PROGRESS_HEIGHTS.xs,
      progressWidth: 'w-12',
    },
    md: {
      container: 'gap-2',
      score: 'text-base font-medium',
      percent: 'text-sm',
      progress: PROGRESS_HEIGHTS.sm,
      progressWidth: 'w-16',
    },
    lg: {
      container: 'gap-2',
      score: 'text-2xl font-light tracking-tight',
      percent: 'text-lg',
      progress: PROGRESS_HEIGHTS.sm,
      progressWidth: 'w-20',
    },
  };

  const config = sizeClasses[size];

  return (
    <div className={cn("flex items-center", config.container, className)}>
      {/* Score number */}
      <div className="flex items-baseline">
        <span className={cn(config.score, getScoreColor(roundedScore))}>
          {roundedScore}
        </span>
        <span className={cn(config.percent, "text-muted-foreground/60 ml-0.5")}>%</span>
      </div>
      
      {/* Progress bar - Apple style 4px */}
      {showProgress && (
        <div className={cn(
          "bg-muted rounded-full overflow-hidden",
          config.progress,
          config.progressWidth
        )}>
          <div 
            className={cn(
              "h-full rounded-full",
              TRANSITIONS.slow,
              getScoreProgressColor(roundedScore)
            )}
            style={{ width: `${roundedScore}%` }}
          />
        </div>
      )}
    </div>
  );
}
