import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment } from '@react-three/drei';
import { motion } from 'framer-motion';
import { Robot3D } from './Robot3D';
import { Suspense } from 'react';

interface RobotIconProps {
  onClick?: () => void;
  isActive?: boolean;
}

export const RobotIcon = ({ onClick, isActive }: RobotIconProps) => {
  return (
    <motion.button
      onClick={onClick}
      className="relative cursor-pointer bg-transparent border-none p-0 w-32 h-32 rounded-2xl overflow-hidden"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      style={{
        background: 'linear-gradient(135deg, rgba(74, 144, 226, 0.1) 0%, rgba(255, 107, 53, 0.1) 100%)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(74, 144, 226, 0.3)',
      }}
    >
      <Canvas>
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
