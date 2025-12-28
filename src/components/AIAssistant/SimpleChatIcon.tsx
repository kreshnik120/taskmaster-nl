import { Bot } from 'lucide-react';
import { motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useState, useEffect, useRef } from 'react';

interface SimpleChatIconProps {
  onClick: () => void;
  isActive?: boolean;
}

export const SimpleChatIcon = ({ onClick, isActive }: SimpleChatIconProps) => {
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem('chatIconPosition');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { x: 0, y: 0 };
      }
    }
    return { x: 0, y: 0 };
  });

  const constraintsRef = useRef<HTMLDivElement>(null);

  // Save position to localStorage
  useEffect(() => {
    localStorage.setItem('chatIconPosition', JSON.stringify(position));
  }, [position]);

  // Keyboard shortcut (Ctrl+K / Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        onClick();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClick]);

  // Constrain position to screen bounds
  const constrainPosition = (x: number, y: number) => {
    const padding = 16;
    const iconSize = 56;
    const maxX = window.innerWidth - iconSize - padding;
    const maxY = window.innerHeight - iconSize - padding;
    
    return {
      x: Math.max(padding, Math.min(x, maxX)),
      y: Math.max(padding, Math.min(y, maxY))
    };
  };

  return (
    <>
      {/* Invisible drag constraints container */}
      <div 
        ref={constraintsRef}
        className="fixed inset-4 pointer-events-none z-40"
      />
      
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            drag
            dragMomentum={false}
            dragConstraints={constraintsRef}
            onDragEnd={(_, info) => {
              const newPos = constrainPosition(
                position.x + info.offset.x,
                position.y + info.offset.y
              );
              setPosition(newPos);
            }}
            onClick={onClick}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/25 flex items-center justify-center cursor-grab active:cursor-grabbing hover:shadow-xl hover:shadow-primary/30 transition-shadow focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2"
            style={{ 
              x: position.x, 
              y: position.y 
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ 
              opacity: 1, 
              scale: 1,
            }}
            transition={{ 
              type: 'spring', 
              stiffness: 400, 
              damping: 25 
            }}
          >
            {/* Pulse ring when active */}
            {isActive && (
              <motion.div
                className="absolute inset-0 rounded-2xl bg-primary/30"
                animate={{ 
                  scale: [1, 1.3, 1],
                  opacity: [0.5, 0, 0.5]
                }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut'
                }}
              />
            )}
            
            {/* Bot icon */}
            <Bot className="w-7 h-7 text-primary-foreground" />
          </motion.button>
        </TooltipTrigger>
        <TooltipContent side="left" className="bg-popover text-popover-foreground">
          <p className="font-medium">ABCzorg Assistent</p>
          <p className="text-xs text-muted-foreground">Ctrl+K om te openen • Sleep om te verplaatsen</p>
        </TooltipContent>
      </Tooltip>
    </>
  );
};
