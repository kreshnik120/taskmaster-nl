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

  // Color scheme
  const colors = {
    body: "#f0f4f8",      // White/silver body
    accent: "#00a8e8",    // Blue accent
    eyes: "#00d4ff",      // Cyan eyes
    dark: "#e8eef3",      // Slightly darker for depth
  };

  return (
    <group ref={robotRef} position={[0, 0, 0]}>
      {/* Head - Single sphere */}
      <Sphere args={[0.7, 32, 32]} position={[0, 0.5, 0]}>
        <meshStandardMaterial 
          color={colors.body} 
          metalness={0.4}
          roughness={0.2}
        />
      </Sphere>

      {/* Ear sensors - small spheres on sides */}
      <Sphere args={[0.12, 16, 16]} position={[-0.65, 0.55, 0]}>
        <meshStandardMaterial 
          color={colors.accent} 
          metalness={0.5}
          roughness={0.2}
          emissive={colors.accent}
          emissiveIntensity={0.2}
        />
      </Sphere>
      <Sphere args={[0.12, 16, 16]} position={[0.65, 0.55, 0]}>
        <meshStandardMaterial 
          color={colors.accent} 
          metalness={0.5}
          roughness={0.2}
          emissive={colors.accent}
          emissiveIntensity={0.2}
        />
      </Sphere>

      {/* Eyes - Oval cyan with glow */}
      <group ref={leftEyeRef} position={[-0.22, 0.6, 0.58]}>
        {/* Eye oval */}
        <Sphere args={[0.18, 16, 16]} scale={[1, 1.2, 0.6]}>
          <meshStandardMaterial 
            color={colors.eyes}
            emissive={colors.eyes}
            emissiveIntensity={0.5}
            metalness={0.3}
            roughness={0.1}
          />
        </Sphere>
        {/* Eyelid accent */}
        <RoundedBox args={[0.22, 0.06, 0.1]} radius={0.03} position={[0, 0.18, 0]}>
          <meshStandardMaterial 
            color={colors.dark}
            metalness={0.4}
            roughness={0.2}
          />
        </RoundedBox>
      </group>

      <group ref={rightEyeRef} position={[0.22, 0.6, 0.58]}>
        {/* Eye oval */}
        <Sphere args={[0.18, 16, 16]} scale={[1, 1.2, 0.6]}>
          <meshStandardMaterial 
            color={colors.eyes}
            emissive={colors.eyes}
            emissiveIntensity={0.5}
            metalness={0.3}
            roughness={0.1}
          />
        </Sphere>
        {/* Eyelid accent */}
        <RoundedBox args={[0.22, 0.06, 0.1]} radius={0.03} position={[0, 0.18, 0]}>
          <meshStandardMaterial 
            color={colors.dark}
            metalness={0.4}
            roughness={0.2}
          />
        </RoundedBox>
      </group>

      {/* Neck - Small cylinder */}
      <Cylinder args={[0.2, 0.25, 0.3, 16]} position={[0, -0.05, 0]}>
        <meshStandardMaterial 
          color={colors.body}
          metalness={0.4}
          roughness={0.2}
        />
      </Cylinder>

      {/* Body/Torso - Capsule shape */}
      <RoundedBox args={[0.7, 0.9, 0.6]} radius={0.3} position={[0, -0.7, 0]}>
        <meshStandardMaterial 
          color={colors.body}
          metalness={0.4}
          roughness={0.2}
        />
      </RoundedBox>

      {/* Blue accent stripe on body */}
      <Box args={[0.6, 0.08, 0.62]} position={[0, -0.5, 0]}>
        <meshStandardMaterial 
          color={colors.accent}
          metalness={0.5}
          roughness={0.15}
          emissive={colors.accent}
          emissiveIntensity={0.1}
        />
      </Box>

      {/* Arms - White cylinders with blue joints */}
      <group position={[-0.5, -0.4, 0]}>
        <Cylinder args={[0.12, 0.12, 0.5, 16]} rotation={[0, 0, Math.PI / 6]}>
          <meshStandardMaterial 
            color={colors.body}
            metalness={0.4}
            roughness={0.2}
          />
        </Cylinder>
        {/* Blue shoulder joint */}
        <Sphere args={[0.15, 16, 16]} position={[0, 0.25, 0]}>
          <meshStandardMaterial 
            color={colors.accent}
            metalness={0.5}
            roughness={0.2}
          />
        </Sphere>
      </group>

      <group position={[0.5, -0.4, 0]}>
        <Cylinder args={[0.12, 0.12, 0.5, 16]} rotation={[0, 0, -Math.PI / 6]}>
          <meshStandardMaterial 
            color={colors.body}
            metalness={0.4}
            roughness={0.2}
          />
        </Cylinder>
        {/* Blue shoulder joint */}
        <Sphere args={[0.15, 16, 16]} position={[0, 0.25, 0]}>
          <meshStandardMaterial 
            color={colors.accent}
            metalness={0.5}
            roughness={0.2}
          />
        </Sphere>
      </group>

      {/* Hands - White spheres with blue highlights */}
      <group ref={leftHandRef} position={[-0.7, -0.75, 0]}>
        <Sphere args={[0.18, 16, 16]}>
          <meshStandardMaterial 
            color={colors.body}
            metalness={0.4}
            roughness={0.2}
          />
        </Sphere>
        <Sphere args={[0.08, 16, 16]} position={[0, 0, 0.15]}>
          <meshStandardMaterial 
            color={colors.accent}
            metalness={0.5}
            roughness={0.2}
          />
        </Sphere>
      </group>

      <group ref={rightHandRef} position={[0.7, -0.75, 0]}>
        <Sphere args={[0.18, 16, 16]}>
          <meshStandardMaterial 
            color={colors.body}
            metalness={0.4}
            roughness={0.2}
          />
        </Sphere>
        <Sphere args={[0.08, 16, 16]} position={[0, 0, 0.15]}>
          <meshStandardMaterial 
            color={colors.accent}
            metalness={0.5}
            roughness={0.2}
          />
        </Sphere>
      </group>

      {/* Legs - Short capsule shape */}
      <RoundedBox args={[0.22, 0.35, 0.22]} radius={0.12} position={[-0.25, -1.3, 0]}>
        <meshStandardMaterial 
          color={colors.body}
          metalness={0.4}
          roughness={0.2}
        />
      </RoundedBox>
      <RoundedBox args={[0.22, 0.35, 0.22]} radius={0.12} position={[0.25, -1.3, 0]}>
        <meshStandardMaterial 
          color={colors.body}
          metalness={0.4}
          roughness={0.2}
        />
      </RoundedBox>

      {/* Blue feet accents */}
      <Sphere args={[0.12, 16, 16]} position={[-0.25, -1.5, 0.1]}>
        <meshStandardMaterial 
          color={colors.accent}
          metalness={0.5}
          roughness={0.2}
        />
      </Sphere>
      <Sphere args={[0.12, 16, 16]} position={[0.25, -1.5, 0.1]}>
        <meshStandardMaterial 
          color={colors.accent}
          metalness={0.5}
          roughness={0.2}
        />
      </Sphere>
    </group>
  );
};
