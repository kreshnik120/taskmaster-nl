import { RefObject, useEffect, useState } from "react";
import { ListChecks, Zap, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTextSelection } from "@/hooks/useTextSelection";
import { useToast } from "@/hooks/use-toast";

interface TextSelectionMenuProps {
  containerRef: RefObject<HTMLElement>;
  onCreateSubtask: (text: string) => void;
  onCreateAction: (text: string) => void;
  className?: string;
}

export function TextSelectionMenu({
  containerRef,
  onCreateSubtask,
  onCreateAction,
  className
}: TextSelectionMenuProps) {
  const { text, rect, isActive } = useTextSelection(containerRef);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const { toast } = useToast();

  // Calculate position based on selection rect
  useEffect(() => {
    if (!rect || !isActive || !containerRef.current) {
      setIsVisible(false);
      return;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    
    // Position menu above the selection, centered
    const menuWidth = 200; // Approximate menu width
    const top = rect.top - containerRect.top - 45; // Above selection
    const left = Math.max(
      0,
      Math.min(
        rect.left - containerRect.left + (rect.width / 2) - (menuWidth / 2),
        containerRect.width - menuWidth
      )
    );

    setPosition({ top, left });
    setIsVisible(true);
  }, [rect, isActive, containerRef]);

  const handleCreateSubtask = () => {
    onCreateSubtask(text);
    clearSelection();
  };

  const handleCreateAction = () => {
    onCreateAction(text);
    clearSelection();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Gekopieerd",
        description: "Tekst is gekopieerd naar klembord"
      });
    } catch (error) {
      console.error('Failed to copy:', error);
    }
    clearSelection();
  };

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    setIsVisible(false);
  };

  if (!isVisible || !text) {
    return null;
  }

  return (
    <div
      data-selection-menu
      className={cn(
        "absolute z-50 flex items-center gap-1 p-1.5 rounded-lg",
        "bg-popover/95 backdrop-blur-sm border border-border shadow-lg",
        "animate-in fade-in-0 zoom-in-95 duration-150",
        className
      )}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      <button
        type="button"
        onClick={handleCreateSubtask}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium",
          "hover:bg-primary/10 text-foreground transition-colors"
        )}
      >
        <ListChecks className="h-3.5 w-3.5 text-primary" />
        Subtaak
      </button>

      <div className="w-px h-5 bg-border" />

      <button
        type="button"
        onClick={handleCreateAction}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium",
          "hover:bg-amber-500/10 text-foreground transition-colors"
        )}
      >
        <Zap className="h-3.5 w-3.5 text-amber-500" />
        Actie
      </button>

      <div className="w-px h-5 bg-border" />

      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs",
          "hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        )}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={clearSelection}
        className={cn(
          "flex items-center gap-1.5 px-1.5 py-1.5 rounded-md text-xs",
          "hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        )}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
