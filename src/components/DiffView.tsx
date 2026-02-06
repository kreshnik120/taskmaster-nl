import { useMemo } from "react";
import { computeWordDiff, isDiffSimple, type DiffSegment } from "@/lib/textDiff";
import { cn } from "@/lib/utils";

interface DiffViewProps {
  oldText: string | null | undefined;
  newText: string | null | undefined;
  className?: string;
  showFallback?: boolean;
}

export function DiffView({ oldText, newText, className, showFallback = true }: DiffViewProps) {
  const segments = useMemo(() => {
    return computeWordDiff(oldText || '', newText || '');
  }, [oldText, newText]);

  const isSimple = useMemo(() => isDiffSimple(segments), [segments]);

  // If diff is too complex, show side-by-side fallback
  if (!isSimple && showFallback) {
    return (
      <div className={cn("space-y-3", className)}>
        {oldText && (
          <div>
            <span className="text-xs font-medium text-muted-foreground">Was:</span>
            <div className="mt-1 p-2 rounded bg-muted/30 border border-border">
              <p className="text-sm whitespace-pre-wrap text-muted-foreground line-through">
                {oldText}
              </p>
            </div>
          </div>
        )}
        {newText && (
          <div>
            <span className="text-xs font-medium text-emerald-600">Werd:</span>
            <div className="mt-1 p-2 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
              <p className="text-sm whitespace-pre-wrap">
                {newText}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn(
      "p-3 rounded-lg bg-muted/20 border border-border text-sm whitespace-pre-wrap",
      className
    )}>
      {segments.map((segment, index) => (
        <DiffSegmentView key={index} segment={segment} />
      ))}
    </div>
  );
}

interface DiffSegmentViewProps {
  segment: DiffSegment;
}

function DiffSegmentView({ segment }: DiffSegmentViewProps) {
  switch (segment.type) {
    case 'added':
      return (
        <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 px-0.5 rounded-sm">
          {segment.text}
        </span>
      );
    case 'removed':
      return (
        <span className="bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 line-through px-0.5 rounded-sm">
          {segment.text}
        </span>
      );
    case 'unchanged':
    default:
      return <span>{segment.text}</span>;
  }
}

export default DiffView;
