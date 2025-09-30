import { motion } from "framer-motion";

interface RobotIconProps {
  onClick?: () => void;
  isActive?: boolean;
}

export const RobotIcon = ({ onClick, isActive }: RobotIconProps) => {
  return (
    <motion.button
      onClick={onClick}
      className="relative cursor-pointer bg-transparent border-none p-0"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      animate={isActive ? { y: [0, -5, 0] } : {}}
      transition={{ duration: 0.5, repeat: isActive ? Infinity : 0 }}
    >
      <svg
        width="80"
        height="80"
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-lg"
      >
        {/* Antenna */}
        <motion.circle
          cx="40"
          cy="12"
          r="3"
          fill="#FF6B35"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        <line x1="40" y1="15" x2="40" y2="22" stroke="#4A90E2" strokeWidth="2" />
        
        {/* Robot Head/Body */}
        <rect
          x="20"
          y="22"
          width="40"
          height="45"
          rx="8"
          fill="#4A90E2"
          className="transition-colors"
        />
        
        {/* Eyes */}
        <motion.circle
          cx="32"
          cy="38"
          r="5"
          fill="white"
          animate={{ scaleY: [1, 0.1, 1] }}
          transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}
        />
        <motion.circle
          cx="48"
          cy="38"
          r="5"
          fill="white"
          animate={{ scaleY: [1, 0.1, 1] }}
          transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}
        />
        
        {/* Pupils */}
        <circle cx="32" cy="38" r="2" fill="#1a1a1a" />
        <circle cx="48" cy="38" r="2" fill="#1a1a1a" />
        
        {/* Mouth */}
        <path
          d="M 30 52 Q 40 58 50 52"
          stroke="#FF6B35"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
        
        {/* Chest Panel */}
        <rect
          x="32"
          y="48"
          width="16"
          height="12"
          rx="2"
          fill="#2C5AA0"
          opacity="0.5"
        />
        
        {/* Arms */}
        <rect x="12" y="32" width="8" height="20" rx="4" fill="#4A90E2" />
        <rect x="60" y="32" width="8" height="20" rx="4" fill="#4A90E2" />
        
        {/* Hands */}
        <circle cx="16" cy="52" r="4" fill="#FF6B35" />
        <circle cx="64" cy="52" r="4" fill="#FF6B35" />
        
        {/* Legs */}
        <rect x="28" y="67" width="8" height="8" rx="2" fill="#4A90E2" />
        <rect x="44" y="67" width="8" height="8" rx="2" fill="#4A90E2" />
      </svg>
      
      {/* Active indicator */}
      {isActive && (
        <motion.div
          className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full"
          animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}
    </motion.button>
  );
};
