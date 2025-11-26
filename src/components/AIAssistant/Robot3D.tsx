import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Box, RoundedBox, Cylinder } from '@react-three/drei';
import * as THREE from 'three';

interface Robot3DProps {
  isActive?: boolean;
}

export const Robot3D = ({ isActive }: Robot3DProps) => {
  const robotRef = useRef<THREE.Group>(null);
  const leftEyeRef = useRef<THREE.Group>(null);
  const rightEyeRef = useRef<THREE.Group>(null);
  const leftHandRef = useRef<THREE.Group>(null);
  const rightHandRef = useRef<THREE.Group>(null);
  
  const timeRef = useRef(0);
  const blinkTimeRef = useRef(0);

  useFrame((state, delta) => {
    if (!robotRef.current) return;
    
    timeRef.current += delta;
    blinkTimeRef.current += delta;
    const time = timeRef.current;
    const blinkTime = blinkTimeRef.current;

    // Subtle floating animation
    robotRef.current.position.y = Math.sin(time * 1.5) * 0.04;
    
    // Gentle rotation
    robotRef.current.rotation.y = Math.sin(time * 0.3) * 0.05;
    
    // Active state - slight tilt
    if (isActive && robotRef.current) {
      robotRef.current.rotation.z = Math.sin(time * 3) * 0.03;
    }

    // Blinking animation
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

    // Hand wave animation
    if (leftHandRef.current) {
      leftHandRef.current.rotation.z = Math.sin(time * 2) * 0.3;
    }
    if (rightHandRef.current) {
      rightHandRef.current.rotation.z = Math.sin(time * 2 + Math.PI) * 0.3;
    }
  });

  // Color scheme: Gray robot with cyan eyes (matching reference image)
  const colors = {
    bodyMain: "#9ca3ab",    // Gray main body
    bodyDark: "#7a8289",    // Darker gray for depth
    eyes: "#00d4ff",        // Cyan eyes with glow
    accent: "#0099cc",      // Blue accents for hands
    mouth: "#6b7278"        // Dark gray for mouth grille
  };

  return (
    <group ref={robotRef} position={[0, 0, 0]}>
      {/* Main body capsule - bottom sphere (darker) */}
      <Sphere args={[0.9, 32, 32]} position={[0, -0.3, 0]}>
        <meshStandardMaterial 
          color={colors.bodyDark} 
          metalness={0.3}
          roughness={0.4}
        />
      </Sphere>

      {/* Main body capsule - top sphere (lighter, overlapping) */}
      <Sphere args={[0.9, 32, 32]} position={[0, 0.4, 0]}>
        <meshStandardMaterial 
          color={colors.bodyMain} 
          metalness={0.3}
          roughness={0.4}
        />
      </Sphere>

      {/* Large round eyes - MUCH bigger than before */}
      <group ref={leftEyeRef} position={[-0.25, 0.5, 0.75]}>
        <Sphere args={[0.32, 24, 24]}>
          <meshStandardMaterial 
            color={colors.eyes}
            emissive={colors.eyes}
            emissiveIntensity={0.6}
            metalness={0.2}
            roughness={0.1}
          />
        </Sphere>
      </group>

      <group ref={rightEyeRef} position={[0.25, 0.5, 0.75]}>
        <Sphere args={[0.32, 24, 24]}>
          <meshStandardMaterial 
            color={colors.eyes}
            emissive={colors.eyes}
            emissiveIntensity={0.6}
            metalness={0.2}
            roughness={0.1}
          />
        </Sphere>
      </group>

      {/* Mouth grille - rectangular with horizontal lines */}
      <RoundedBox args={[0.5, 0.25, 0.1]} radius={0.05} position={[0, 0.05, 0.85]}>
        <meshStandardMaterial 
          color={colors.mouth}
          metalness={0.4}
          roughness={0.5}
        />
      </RoundedBox>

      {/* Grille lines - 4 horizontal bars */}
      <Box args={[0.45, 0.03, 0.12]} position={[0, 0.14, 0.85]}>
        <meshStandardMaterial color={colors.bodyMain} metalness={0.2} roughness={0.6} />
      </Box>
      <Box args={[0.45, 0.03, 0.12]} position={[0, 0.06, 0.85]}>
        <meshStandardMaterial color={colors.bodyMain} metalness={0.2} roughness={0.6} />
      </Box>
      <Box args={[0.45, 0.03, 0.12]} position={[0, -0.02, 0.85]}>
        <meshStandardMaterial color={colors.bodyMain} metalness={0.2} roughness={0.6} />
      </Box>
      <Box args={[0.45, 0.03, 0.12]} position={[0, -0.10, 0.85]}>
        <meshStandardMaterial color={colors.bodyMain} metalness={0.2} roughness={0.6} />
      </Box>

      {/* Left arm - simple gray cylinder */}
      <Cylinder args={[0.12, 0.10, 0.5, 16]} position={[-0.75, -0.1, 0]} rotation={[0, 0, Math.PI / 4]}>
        <meshStandardMaterial 
          color={colors.bodyDark}
          metalness={0.3}
          roughness={0.4}
        />
      </Cylinder>

      {/* Right arm - simple gray cylinder */}
      <Cylinder args={[0.12, 0.10, 0.5, 16]} position={[0.75, -0.1, 0]} rotation={[0, 0, -Math.PI / 4]}>
        <meshStandardMaterial 
          color={colors.bodyDark}
          metalness={0.3}
          roughness={0.4}
        />
      </Cylinder>

      {/* Left hand - blue sphere */}
      <group ref={leftHandRef} position={[-1.05, -0.35, 0]}>
        <Sphere args={[0.16, 16, 16]}>
          <meshStandardMaterial 
            color={colors.accent}
            metalness={0.4}
            roughness={0.3}
            emissive={colors.accent}
            emissiveIntensity={0.1}
          />
        </Sphere>
      </group>

      {/* Right hand - blue sphere */}
      <group ref={rightHandRef} position={[1.05, -0.35, 0]}>
        <Sphere args={[0.16, 16, 16]}>
          <meshStandardMaterial 
            color={colors.accent}
            metalness={0.4}
            roughness={0.3}
            emissive={colors.accent}
            emissiveIntensity={0.1}
          />
        </Sphere>
      </group>
    </group>
  );
};
