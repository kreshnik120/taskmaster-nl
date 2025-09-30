import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Box, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

interface Robot3DProps {
  isActive?: boolean;
}

export const Robot3D = ({ isActive }: Robot3DProps) => {
  const robotRef = useRef<THREE.Group>(null);
  const antennaRef = useRef<THREE.Mesh>(null);
  const leftEyeRef = useRef<THREE.Group>(null);
  const rightEyeRef = useRef<THREE.Group>(null);
  
  let time = 0;
  let blinkTime = 0;

  useFrame((state, delta) => {
    if (!robotRef.current) return;
    
    time += delta;
    blinkTime += delta;

    // Subtle floating animation
    robotRef.current.position.y = Math.sin(time * 2) * 0.05;
    
    // Gentle rotation
    robotRef.current.rotation.y = Math.sin(time * 0.5) * 0.1;
    
    // Active state - more energetic movement
    if (isActive) {
      robotRef.current.rotation.z = Math.sin(time * 4) * 0.05;
    }

    // Antenna pulse
    if (antennaRef.current) {
      const scale = 1 + Math.sin(time * 3) * 0.2;
      antennaRef.current.scale.set(scale, scale, scale);
    }

    // Blinking animation
    if (blinkTime > 3) {
      const blinkProgress = (blinkTime - 3) * 10;
      const scaleY = blinkProgress < 1 ? 1 - blinkProgress : blinkProgress - 1;
      
      if (leftEyeRef.current) {
        leftEyeRef.current.scale.y = Math.max(0.1, scaleY);
      }
      if (rightEyeRef.current) {
        rightEyeRef.current.scale.y = Math.max(0.1, scaleY);
      }
      
      if (blinkTime > 3.2) {
        blinkTime = 0;
      }
    }
  });

  return (
    <group ref={robotRef} position={[0, 0, 0]}>
      {/* Antenna */}
      <group position={[0, 1.2, 0]}>
        <Box args={[0.05, 0.3, 0.05]} position={[0, 0, 0]}>
          <meshStandardMaterial color="#4A90E2" />
        </Box>
        <Sphere ref={antennaRef} args={[0.12, 16, 16]} position={[0, 0.2, 0]}>
          <meshStandardMaterial color="#FF6B35" emissive="#FF6B35" emissiveIntensity={0.5} />
        </Sphere>
      </group>

      {/* Main body/head */}
      <RoundedBox args={[1.2, 1.2, 1]} radius={0.2} position={[0, 0, 0]}>
        <meshStandardMaterial 
          color="#4A90E2" 
          metalness={0.3}
          roughness={0.4}
        />
      </RoundedBox>

      {/* Eyes */}
      <group ref={leftEyeRef} position={[-0.25, 0.15, 0.5]}>
        <Sphere args={[0.18, 16, 16]}>
          <meshStandardMaterial color="white" />
        </Sphere>
        <Sphere args={[0.08, 16, 16]} position={[0, 0, 0.15]}>
          <meshStandardMaterial color="#1a1a1a" />
        </Sphere>
      </group>

      <group ref={rightEyeRef} position={[0.25, 0.15, 0.5]}>
        <Sphere args={[0.18, 16, 16]}>
          <meshStandardMaterial color="white" />
        </Sphere>
        <Sphere args={[0.08, 16, 16]} position={[0, 0, 0.15]}>
          <meshStandardMaterial color="#1a1a1a" />
        </Sphere>
      </group>

      {/* Mouth */}
      <group position={[0, -0.2, 0.5]}>
        <Box args={[0.4, 0.08, 0.05]} position={[0, 0, 0]} rotation={[0, 0, 0.1]}>
          <meshStandardMaterial color="#FF6B35" />
        </Box>
        <Box args={[0.4, 0.08, 0.05]} position={[0, 0, 0]} rotation={[0, 0, -0.1]}>
          <meshStandardMaterial color="#FF6B35" />
        </Box>
      </group>

      {/* Chest panel */}
      <RoundedBox args={[0.4, 0.35, 0.05]} radius={0.05} position={[0, -0.4, 0.48]}>
        <meshStandardMaterial 
          color="#2C5AA0" 
          metalness={0.6}
          roughness={0.3}
          emissive="#2C5AA0"
          emissiveIntensity={isActive ? 0.3 : 0.1}
        />
      </RoundedBox>

      {/* Arms */}
      <RoundedBox args={[0.2, 0.6, 0.2]} radius={0.1} position={[-0.7, -0.1, 0]}>
        <meshStandardMaterial color="#4A90E2" metalness={0.3} roughness={0.4} />
      </RoundedBox>
      <RoundedBox args={[0.2, 0.6, 0.2]} radius={0.1} position={[0.7, -0.1, 0]}>
        <meshStandardMaterial color="#4A90E2" metalness={0.3} roughness={0.4} />
      </RoundedBox>

      {/* Hands */}
      <Sphere args={[0.15, 16, 16]} position={[-0.7, -0.5, 0]}>
        <meshStandardMaterial color="#FF6B35" />
      </Sphere>
      <Sphere args={[0.15, 16, 16]} position={[0.7, -0.5, 0]}>
        <meshStandardMaterial color="#FF6B35" />
      </Sphere>

      {/* Legs */}
      <RoundedBox args={[0.25, 0.3, 0.25]} radius={0.08} position={[-0.25, -0.9, 0]}>
        <meshStandardMaterial color="#4A90E2" metalness={0.3} roughness={0.4} />
      </RoundedBox>
      <RoundedBox args={[0.25, 0.3, 0.25]} radius={0.08} position={[0.25, -0.9, 0]}>
        <meshStandardMaterial color="#4A90E2" metalness={0.3} roughness={0.4} />
      </RoundedBox>
    </group>
  );
};
