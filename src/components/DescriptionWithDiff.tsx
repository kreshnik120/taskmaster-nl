import { useMemo, useState, useEffect } from "react";
import { computeWordDiff, type DiffSegment } from "@/lib/textDiff";
import { cn } from "@/lib/utils";

interface DescriptionChangeMetadata {
  old_description?: string | null;
  new_description?: string | null;
  change_type?: 'added' | 'modified' | 'removed';
}

interface LatestChange {
  metadata?: DescriptionChangeMetadata;
  created_at: string;
}

interface DescriptionWithDiffProps {
  currentDescription: string;
  latestChange: LatestChange | null;
  highlightDuration?: number; // ms before fade starts (default: 10000)
  className?: string;
}

export function DescriptionWithDiff({ 
  currentDescription, 
  latestChange,
  highlightDuration = 10000,
  className 
}: DescriptionWithDiffProps) {
  const [showHighlight, setShowHighlight] = useState(true);

  // Check if change is recent (within last 24 hours)
  const isRecentChange = useMemo(() => {
    if (!latestChange?.created_at) return false;
    const changeTime = new Date(latestChange.created_at).getTime();
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    return (now - changeTime) < twentyFourHours;
  }, [latestChange?.created_at]);

  // Start fade-out timer
  useEffect(() => {
    if (!isRecentChange || !showHighlight) return;
    
    const timer = setTimeout(() => {
      setShowHighlight(false);
    }, highlightDuration);

    return () => clearTimeout(timer);
  }, [isRecentChange, highlightDuration, showHighlight]);

  // Compute what should be highlighted
  const segments = useMemo(() => {
    if (!latestChange?.metadata || !isRecentChange) {
      return null;
    }

    const { change_type, old_description, new_description } = latestChange.metadata;

    // For 'added' type: the entire new_description was added
    if (change_type === 'added' && new_description) {
      // The current description IS the new description, highlight it all
      return [{ type: 'added' as const, text: currentDescription }];
    }

    // For 'modified' type: compute diff and find added segments
    if (change_type === 'modified' && old_description && new_description) {
      const diff = computeWordDiff(old_description, new_description);
      // Only show if there are actual additions
      const hasAdditions = diff.some(s => s.type === 'added');
      if (hasAdditions) {
        return diff;
      }
    }

    return null;
  }, [latestChange, currentDescription, isRecentChange]);

  // If no segments to highlight, render plain text
  if (!segments || !showHighlight) {
    return (
      <p className={cn("text-sm whitespace-pre-wrap leading-relaxed", className)}>
        {currentDescription}
      </p>
    );
  }

  return (
    <div className={cn("text-sm whitespace-pre-wrap leading-relaxed", className)}>
      {segments.map((segment, index) => (
        <HighlightedSegment 
          key={index} 
          segment={segment} 
          animate={isRecentChange}
        />
      ))}
    </div>
  );
}

interface HighlightedSegmentProps {
  segment: DiffSegment;
  animate?: boolean;
}

function HighlightedSegment({ segment, animate }: HighlightedSegmentProps) {
  if (segment.type === 'added') {
    return (
      <span 
        className={cn(
          "bg-emerald-100/80 dark:bg-emerald-900/40",
          "border-l-2 border-emerald-500 pl-1",
          "text-emerald-900 dark:text-emerald-100",
          "rounded-r-sm",
          animate && "animate-in fade-in-0 duration-500"
        )}
      >
        {segment.text}
      </span>
    );
  }

  if (segment.type === 'removed') {
    // Removed text is not shown in the current description
    // since the current description doesn't contain it anymore
    return null;
  }

  // Unchanged text
  return <span>{segment.text}</span>;
}

export default DescriptionWithDiff;
