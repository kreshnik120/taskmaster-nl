import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment } from '@react-three/drei';
import { motion } from 'framer-motion';
import { Robot3D } from './Robot3D';
import { RobotErrorBoundary } from './RobotErrorBoundary';
import { Suspense, useState, useEffect } from 'react';
import { Bot } from 'lucide-react';

interface RobotIconProps {
  onClick?: () => void;
  isActive?: boolean;
}

const STORAGE_KEY = 'robot-position';

export const RobotIcon = ({ onClick, isActive }: RobotIconProps) => {
  // Load position from localStorage
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { x: 0, y: 0 };
      }
    }
    return { x: 0, y: 0 };
  });

  // Track if user is dragging to prevent click event
  const [isDragging, setIsDragging] = useState(false);

  // Save position to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  }, [position]);

  const handleClick = () => {
    // Only trigger onClick if not dragging
    if (!isDragging && onClick) {
      onClick();
    }
  };

  const handleDoubleClick = () => {
    // Reset position on double click
    setPosition({ x: 0, y: 0 });
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <motion.button
      drag
      dragMomentum={false}
      dragElastic={0}
      onDragStart={() => {
        setIsDragging(true);
      }}
      onDragEnd={(_, info) => {
        setPosition({ x: position.x + info.offset.x, y: position.y + info.offset.y });
        // Reset dragging state after a short delay to prevent click
        setTimeout(() => setIsDragging(false), 100);
      }}
      style={{ x: position.x, y: position.y }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className="fixed bottom-6 right-6 z-50 cursor-grab active:cursor-grabbing border-none p-0 w-20 h-20 drop-shadow-2xl"
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      animate={!isActive ? { 
        y: [0, -10, 0],
      } : {}}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut"
      }}
    >
      <RobotErrorBoundary
        fallback={
          <div className="w-full h-full flex items-center justify-center">
            <Bot className="w-16 h-16 text-primary drop-shadow-lg" />
          </div>
        }
      >
        <Canvas 
          gl={{ alpha: true, antialias: true }}
          style={{ background: 'transparent' }}
        >
          <Suspense fallback={null}>
            <PerspectiveCamera makeDefault position={[0, 0, 4]} />
            
            {/* Lighting */}
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={1} />
            <pointLight position={[-5, 5, 5]} intensity={0.5} color="#FF6B35" />
            <Environment preset="city" />
            
            {/* 3D Robot */}
            <Robot3D isActive={isActive} />
            
            {/* Optional orbit controls for subtle interaction */}
            <OrbitControls 
              enableZoom={false} 
              enablePan={false}
              autoRotate={!isActive}
              autoRotateSpeed={0.5}
            />
          </Suspense>
        </Canvas>
      </RobotErrorBoundary>
      
      {/* Active indicator */}
      {isActive && (
        <motion.div
          className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full shadow-lg border-2 border-background"
          animate={{ scale: [1, 1.3, 1], opacity: [1, 0.8, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}
      
      {/* Glow effect when inactive */}
      {!isActive && (
        <motion.div
          className="absolute inset-0 rounded-full bg-primary/20 blur-xl -z-10"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}
    </motion.button>
  );
};
