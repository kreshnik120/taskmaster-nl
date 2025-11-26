import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Box, RoundedBox, Cylinder } from '@react-three/drei';
import * as THREE from 'three';

interface Robot3DProps {
  isActive?: boolean;
}

export const Robot3D = ({ isActive }: Robot3DProps) => {
  const robotRef = useRef<THREE.Group>(null);
  const antennaRef = useRef<THREE.Mesh>(null);
  const leftEyeRef = useRef<THREE.Group>(null);
  const rightEyeRef = useRef<THREE.Group>(null);
  
  const timeRef = useRef(0);
  const blinkTimeRef = useRef(0);

  useFrame((state, delta) => {
    if (!robotRef.current) return;
    
    // Reduce update frequency for better performance (every 2nd frame)
    timeRef.current += delta;
    if (timeRef.current % 0.033 > delta) return;
    
    blinkTimeRef.current += delta;
    const time = timeRef.current;
    const blinkTime = blinkTimeRef.current;

    // Subtle floating animation (reduced intensity)
    robotRef.current.position.y = Math.sin(time * 1.5) * 0.03;
    
    // Gentle rotation (reduced frequency)
    robotRef.current.rotation.y = Math.sin(time * 0.3) * 0.08;
    
    // Active state - more energetic movement
    if (isActive) {
      robotRef.current.rotation.z = Math.sin(time * 3) * 0.04;
    }

    // Antenna pulse (reduced frequency)
    if (antennaRef.current) {
      const scale = 1 + Math.sin(time * 2) * 0.15;
      antennaRef.current.scale.set(scale, scale, scale);
    }

    // Blinking animation (less frequent)
    if (blinkTime > 4) {
      const blinkProgress = (blinkTime - 4) * 10;
      const scaleY = blinkProgress < 1 ? 1 - blinkProgress : blinkProgress - 1;
      
      if (leftEyeRef.current) {
        leftEyeRef.current.scale.y = Math.max(0.1, scaleY);
      }
      if (rightEyeRef.current) {
        rightEyeRef.current.scale.y = Math.max(0.1, scaleY);
      }
      
      if (blinkTime > 4.2) {
        blinkTimeRef.current = 0;
      }
    }
  });

  return (
    <group ref={robotRef} position={[0, 0, 0]}>
      {/* Antenna */}
      <group position={[0, 1.2, 0]}>
        <Cylinder args={[0.03, 0.03, 0.4, 16]} position={[0, 0, 0]}>
          <meshStandardMaterial color="#1e5a8e" roughness={0.2} metalness={0.1} />
        </Cylinder>
        <Sphere ref={antennaRef} args={[0.12, 16, 16]} position={[0, 0.2, 0]}>
          <meshStandardMaterial color="#FF6B35" emissive="#FF6B35" emissiveIntensity={0.7} />
        </Sphere>
      </group>

      {/* Main body/head - Two-tone blue effect - Compact & cute */}
      {/* Dark blue left side */}
      <RoundedBox args={[0.6, 0.9, 1]} radius={0.35} position={[-0.3, 0, 0]}>
        <meshStandardMaterial 
          color="#1e5a8e" 
          metalness={0.1}
          roughness={0.2}
        />
      </RoundedBox>
      {/* Light blue right side */}
      <RoundedBox args={[0.6, 0.9, 1]} radius={0.35} position={[0.3, 0, 0]}>
        <meshStandardMaterial 
          color="#4a9fd8" 
          metalness={0.1}
          roughness={0.2}
        />
      </RoundedBox>

      {/* Eyes - Larger and more prominent */}
      <group ref={leftEyeRef} position={[-0.3, 0.2, 0.55]}>
        {/* Grey border */}
        <Sphere args={[0.35, 16, 16]} position={[0, 0, -0.05]}>
          <meshStandardMaterial color="#8a8a8a" roughness={0.3} />
        </Sphere>
        {/* White eyeball */}
        <Sphere args={[0.32, 16, 16]}>
          <meshStandardMaterial color="white" roughness={0.1} />
        </Sphere>
        {/* Black pupil */}
        <Sphere args={[0.15, 16, 16]} position={[0, 0, 0.18]}>
          <meshStandardMaterial color="#1a1a1a" />
        </Sphere>
      </group>

      <group ref={rightEyeRef} position={[0.3, 0.2, 0.55]}>
        {/* Grey border */}
        <Sphere args={[0.35, 16, 16]} position={[0, 0, -0.05]}>
          <meshStandardMaterial color="#8a8a8a" roughness={0.3} />
        </Sphere>
        {/* White eyeball */}
        <Sphere args={[0.32, 16, 16]}>
          <meshStandardMaterial color="white" roughness={0.1} />
        </Sphere>
        {/* Black pupil */}
        <Sphere args={[0.15, 16, 16]} position={[0, 0, 0.18]}>
          <meshStandardMaterial color="#1a1a1a" />
        </Sphere>
      </group>

      {/* No mouth for cleaner cute look */}

      {/* Arms - Adjusted for compact body */}
      <RoundedBox args={[0.2, 0.5, 0.2]} radius={0.1} position={[-0.7, -0.05, 0]}>
        <meshStandardMaterial color="#1e5a8e" metalness={0.1} roughness={0.2} />
      </RoundedBox>
      <RoundedBox args={[0.2, 0.5, 0.2]} radius={0.1} position={[0.7, -0.05, 0]}>
        <meshStandardMaterial color="#4a9fd8" metalness={0.1} roughness={0.2} />
      </RoundedBox>

      {/* Hands - Adjusted position */}
      <Sphere args={[0.18, 16, 16]} position={[-0.7, -0.4, 0]}>
        <meshStandardMaterial color="#FF6B35" roughness={0.2} metalness={0.1} />
      </Sphere>
      <Sphere args={[0.18, 16, 16]} position={[0.7, -0.4, 0]}>
        <meshStandardMaterial color="#FF6B35" roughness={0.2} metalness={0.1} />
      </Sphere>

      {/* Legs - Compact and closer to body */}
      <RoundedBox args={[0.22, 0.22, 0.22]} radius={0.1} position={[-0.25, -0.65, 0]}>
        <meshStandardMaterial color="#1e5a8e" metalness={0.1} roughness={0.2} />
      </RoundedBox>
      <RoundedBox args={[0.22, 0.22, 0.22]} radius={0.1} position={[0.25, -0.65, 0]}>
        <meshStandardMaterial color="#1e5a8e" metalness={0.1} roughness={0.2} />
      </RoundedBox>
    </group>
  );
};
