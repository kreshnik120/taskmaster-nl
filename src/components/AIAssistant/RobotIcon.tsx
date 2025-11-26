import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera, Environment } from '@react-three/drei';
import { motion } from 'framer-motion';
import { Robot3D } from './Robot3D';
import { RobotErrorBoundary } from './RobotErrorBoundary';
import { Suspense, useState, useEffect } from 'react';
import { Bot } from 'lucide-react';

interface RobotIconProps {
  onClick?: () => void;
  isActive?: boolean;
}

interface MousePos {
  x: number;
  y: number;
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
  const [dragVelocity, setDragVelocity] = useState({ x: 0, y: 0 });
  const [webglSupported, setWebglSupported] = useState(true);
  const [contextLost, setContextLost] = useState(false);
  
  // Track mouse position for eye tracking (normalized -1 to 1)
  const [mousePos, setMousePos] = useState<MousePos>({ x: 0, y: 0 });

  // Clamp any restored position on mount to ensure visibility
  useEffect(() => {
    setPosition(prev => constrainPosition(prev.x, prev.y));
  }, []);

  // Check WebGL support and add context recovery
  useEffect(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (!gl) {
      console.warn('⚠️ WebGL not supported on this device');
      setWebglSupported(false);
      return;
    }

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      console.error('🔴 WebGL context lost');
      setContextLost(true);
    };

    const handleContextRestored = () => {
      console.log('✅ WebGL context restored');
      setContextLost(false);
    };

    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    };
  }, []);

  // Save position to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  }, [position]);

  // Track mouse position for eye tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Normalize mouse position to -1 to 1 range
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      setMousePos({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleClick = () => {
    // Only trigger onClick if not dragging
    if (!isDragging && onClick) {
      onClick();
    }
  };

  const handleDrag = (_: any, info: any) => {
    // Track drag velocity for robot rotation
    setDragVelocity({ x: info.delta.x, y: info.delta.y });
  };

  const handleDoubleClick = () => {
    // Reset position on double click
    setPosition({ x: 0, y: 0 });
    localStorage.removeItem(STORAGE_KEY);
  };

  // Boundary check function
  const constrainPosition = (x: number, y: number) => {
    const maxX = 0; // Prevent moving further right than bottom-right anchor
    const maxY = 0; // Prevent moving further down than bottom-right anchor
    const minX = -window.innerWidth + 120;
    const minY = -window.innerHeight + 120;
    
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y))
    };
  };

  const handleRobotError = (error: Error) => {
    if (error.message.includes('context')) {
      setContextLost(true);
    }
  };

  // Fallback to 2D icon if WebGL issues
  if (!webglSupported || contextLost) {
    return (
      <motion.button
        drag
        dragMomentum={false}
        dragElastic={0}
        onDragStart={() => setIsDragging(true)}
        onDrag={handleDrag}
        onDragEnd={(_, info) => {
          const newPos = constrainPosition(
            position.x + info.offset.x,
            position.y + info.offset.y
          );
          setPosition(newPos);
          setDragVelocity({ x: 0, y: 0 }); // Reset velocity
          setTimeout(() => setIsDragging(false), 100);
        }}
        style={{ x: position.x, y: position.y }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        className="relative group fixed bottom-6 right-6 z-[2147483647] cursor-grab active:cursor-grabbing border-none p-0 w-32 h-32 drop-shadow-2xl"
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.9 }}
        title="Klik voor AI hulp"
      >
        <div className="w-full h-full rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border-2 border-primary/30">
          <Bot className="w-16 h-16 text-primary" />
        </div>
        {isActive && (
          <motion.div
            className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full shadow-lg border-2 border-background"
            animate={{ scale: [1, 1.3, 1], opacity: [1, 0.8, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        )}
      </motion.button>
    );
  }

  return (
    <motion.button
      drag
      dragMomentum={false}
      dragElastic={0}
      onDragStart={() => {
        setIsDragging(true);
      }}
      onDrag={handleDrag}
      onDragEnd={(_, info) => {
        const newPos = constrainPosition(
          position.x + info.offset.x,
          position.y + info.offset.y
        );
        setPosition(newPos);
        setDragVelocity({ x: 0, y: 0 }); // Reset velocity
        // Reset dragging state after a short delay to prevent click
        setTimeout(() => setIsDragging(false), 100);
      }}
      style={{ x: position.x, y: position.y }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className="relative group fixed bottom-6 right-6 z-[2147483647] cursor-grab active:cursor-grabbing border-none p-0 w-32 h-32 drop-shadow-2xl"
      whileHover={{ scale: 1.15 }}
      whileTap={{ scale: 0.9 }}
      animate={!isActive ? { 
        y: [0, -15, 0],
        scale: [1, 1.05, 1],
      } : {}}
      transition={{
        duration: 2.5,
        repeat: Infinity,
        ease: "easeInOut"
      }}
      title="Klik voor AI hulp"
    >
      <div className="relative w-full h-full transition-all duration-300">
        <RobotErrorBoundary
          fallback={
            <div className="w-full h-full flex items-center justify-center">
              <Bot className="w-16 h-16 text-primary" />
            </div>
          }
          onError={handleRobotError}
        >
          <Canvas 
            gl={{ 
              alpha: true, 
              antialias: true,
              powerPreference: 'low-power'
            }}
            frameloop="always"
            style={{ background: 'transparent' }}
            onCreated={({ gl }) => {
              // Context loss recovery
              gl.domElement.addEventListener('webglcontextlost', (e) => {
                e.preventDefault();
                console.error('🔴 Canvas context lost');
                setContextLost(true);
              });
              
              gl.domElement.addEventListener('webglcontextrestored', () => {
                console.log('✅ Canvas context restored');
                setContextLost(false);
              });
            }}
          >
            <Suspense fallback={null}>
              <PerspectiveCamera makeDefault position={[0, 0.2, 3.5]} />
              
              {/* Environment map for reflections */}
              <Environment preset="city" background={false} />
              
              {/* Professional clean lighting */}
              <ambientLight intensity={0.8} />
              <directionalLight position={[3, 5, 5]} intensity={1.2} />
              <directionalLight position={[0, -3, 2]} intensity={0.3} />
              <pointLight position={[-2, 2, 3]} intensity={0.4} color="#60A5FA" />
              <spotLight position={[0, 3, 2]} intensity={0.3} angle={0.5} />
              
              {/* 3D Robot */}
              <Robot3D isActive={isActive} dragVelocity={dragVelocity} mousePos={mousePos} />
            </Suspense>
          </Canvas>
        </RobotErrorBoundary>
        
        {/* Active indicator */}
        {isActive && (
          <motion.div
            className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full shadow-lg border-2 border-background"
            animate={{ scale: [1, 1.3, 1], opacity: [1, 0.8, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        )}
      </div>
      
      {/* Tooltip */}
      <motion.div
        className="absolute -top-12 left-1/2 -translate-x-1/2 bg-background border border-primary/20 rounded-lg px-3 py-2 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap"
        initial={{ opacity: 0, y: 5 }}
        whileHover={{ opacity: 1, y: 0 }}
      >
        <p className="text-xs font-medium">AI Assistent</p>
      </motion.div>
    </motion.button>
  );
};
