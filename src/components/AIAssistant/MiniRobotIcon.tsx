import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment } from '@react-three/drei';
import { Robot3D } from './Robot3D';
import { RobotErrorBoundary } from './RobotErrorBoundary';
import { Suspense } from 'react';
import { Bot } from 'lucide-react';

interface MiniRobotIconProps {
  isActive?: boolean;
}

export const MiniRobotIcon = ({ isActive }: MiniRobotIconProps) => {
  return (
    <div className="w-10 h-10">
      <RobotErrorBoundary
        fallback={
          <div className="w-full h-full flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
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
    </div>
  );
};
