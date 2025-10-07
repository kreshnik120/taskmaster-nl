import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { Robot3D } from './Robot3D';
import { RobotErrorBoundary } from './RobotErrorBoundary';
import { Suspense, useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import { toast } from 'sonner';

interface MiniRobotIconProps {
  isActive?: boolean;
}

export const MiniRobotIcon = ({ isActive }: MiniRobotIconProps) => {
  const [webglSupported, setWebglSupported] = useState(true);
  const [contextLost, setContextLost] = useState(false);

  useEffect(() => {
    // Check WebGL support
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
      console.warn('⚠️ WebGL not supported');
      setWebglSupported(false);
      return;
    }

    // Listen for context loss
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

  const handleRobotError = (error: Error) => {
    if (error.message.includes('context')) {
      setContextLost(true);
    }
  };

  // Fallback to 2D icon if WebGL not supported or context lost
  if (!webglSupported || contextLost) {
    return (
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-primary/30 transition-all ${isActive ? 'animate-pulse' : ''}`}>
        <Bot className="w-5 h-5 text-primary" />
      </div>
    );
  }

  return (
    <div className="w-10 h-10">
      <RobotErrorBoundary
        fallback={
          <div className="w-full h-full flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
        }
        onError={handleRobotError}
      >
        <Canvas 
          gl={{ 
            alpha: true, 
            antialias: false, // Disable for better performance
            powerPreference: 'low-power'
          }}
          frameloop="demand" // Only render when needed
          style={{ background: 'transparent' }}
          onCreated={({ gl }) => {
            // Add context loss handlers
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
            <PerspectiveCamera makeDefault position={[0, 0, 4]} />
            
            {/* Simplified lighting for performance */}
            <ambientLight intensity={0.6} />
            <directionalLight position={[3, 3, 3]} intensity={0.8} />
            
            {/* 3D Robot */}
            <Robot3D isActive={isActive} />
          </Suspense>
        </Canvas>
      </RobotErrorBoundary>
    </div>
  );
};
