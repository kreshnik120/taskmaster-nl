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
      className="relative cursor-grab active:cursor-grabbing border-none p-0 w-32 h-32"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
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
          className="absolute top-2 right-2 w-3 h-3 bg-green-500 rounded-full shadow-lg"
          animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}
    </motion.button>
  );
};
