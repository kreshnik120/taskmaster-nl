import { useMemo, useState, useEffect } from "react";
import { computeWordDiff, type DiffSegment } from "@/lib/textDiff";
import { cn } from "@/lib/utils";
import { Plus, Edit3, ChevronDown } from "lucide-react";

interface DescriptionChangeMetadata {
  old_description?: string | null;
  new_description?: string | null;
  change_type?: 'added' | 'modified' | 'removed';
}

interface LatestChange {
  metadata?: DescriptionChangeMetadata;
  created_at: string;
  created_by_name?: string;
}

interface DescriptionWithDiffProps {
  currentDescription: string;
  latestChange: LatestChange | null;
  highlightDuration?: number; // ms before fade starts (default: 10000)
  className?: string;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'zojuist';
  if (diffMins < 60) return `${diffMins} min geleden`;
  if (diffHours < 24) return `${diffHours} uur geleden`;
  return `${diffDays} dag${diffDays > 1 ? 'en' : ''} geleden`;
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

  // Separate unchanged and added segments
  const { unchangedSegments, addedSegments } = useMemo(() => {
    if (!segments) {
      return { unchangedSegments: [], addedSegments: [] };
    }
    
    return {
      unchangedSegments: segments.filter(s => s.type === 'unchanged'),
      addedSegments: segments.filter(s => s.type === 'added')
    };
  }, [segments]);

  // If no segments to highlight, render plain text
  if (!segments || !showHighlight) {
    return (
      <p className={cn("text-sm whitespace-pre-wrap leading-relaxed", className)}>
        {currentDescription}
      </p>
    );
  }

  const changeType = latestChange?.metadata?.change_type;
  const isFullyAdded = changeType === 'added';
  const ChangeIcon = changeType === 'added' ? Plus : Edit3;

  // For fully added descriptions, show everything in the highlight box
  if (isFullyAdded) {
    return (
      <div className={cn("text-sm leading-relaxed", className)}>
        {/* Highlighted additions box */}
        <div className="animate-in fade-in-0 slide-in-from-top-2 duration-300">
          <div className="border-l-2 border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-r-lg overflow-hidden">
            {/* Header */}
            <div className="px-3 py-1.5 bg-emerald-100/50 dark:bg-emerald-900/30 border-b border-emerald-200/50 dark:border-emerald-800/50 flex items-center gap-2">
              <ChangeIcon className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                Toegevoegd door {latestChange?.created_by_name || 'Onbekend'}
              </span>
              <span className="text-xs text-emerald-600/70 dark:text-emerald-400/70">•</span>
              <span className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                {formatRelativeTime(latestChange?.created_at || '')}
              </span>
            </div>
            
            {/* Content */}
            <div className="px-3 py-2 whitespace-pre-wrap">
              <span className="text-emerald-900 dark:text-emerald-100">
                {currentDescription}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // For modified descriptions, show unchanged text first, then connector and additions
  return (
    <div className={cn("text-sm leading-relaxed", className)}>
      {/* Render all segments inline, but separate additions for the box */}
      <div className="whitespace-pre-wrap">
        {segments.map((segment, index) => {
          if (segment.type === 'unchanged') {
            return <span key={index}>{segment.text}</span>;
          }
          // Skip added segments here, they go in the box below
          return null;
        })}
      </div>

      {/* Only show connector and box if there are additions */}
      {addedSegments.length > 0 && (
        <div className="animate-in fade-in-0 slide-in-from-top-2 duration-300">
          {/* Visuele connector */}
          <div className="flex flex-col items-start my-2">
            <div className="flex flex-col items-center ml-4">
              <div className="w-px h-3 bg-gradient-to-b from-transparent to-emerald-400 dark:to-emerald-500" />
              <ChevronDown className="h-3 w-3 text-emerald-500 dark:text-emerald-400 -mt-1" />
            </div>
          </div>

          {/* Highlighted additions box */}
          <div className="border-l-2 border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-r-lg overflow-hidden">
            {/* Header */}
            <div className="px-3 py-1.5 bg-emerald-100/50 dark:bg-emerald-900/30 border-b border-emerald-200/50 dark:border-emerald-800/50 flex items-center gap-2">
              <ChangeIcon className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                Gewijzigd door {latestChange?.created_by_name || 'Onbekend'}
              </span>
              <span className="text-xs text-emerald-600/70 dark:text-emerald-400/70">•</span>
              <span className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                {formatRelativeTime(latestChange?.created_at || '')}
              </span>
            </div>
            
            {/* Content */}
            <div className="px-3 py-2 whitespace-pre-wrap">
              {addedSegments.map((segment, index) => (
                <span key={index} className="text-emerald-900 dark:text-emerald-100">
                  {segment.text}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DescriptionWithDiff;
