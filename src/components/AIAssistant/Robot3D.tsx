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

    // Subtle floating animation - slower and gentler
    robotRef.current.position.y = Math.sin(time * 1.2) * 0.03;
    
    // Slight head tilt - curiosity
    robotRef.current.rotation.z = Math.sin(time * 0.5) * 0.02;
    
    // Active state - very subtle pulse
    if (isActive && robotRef.current) {
      robotRef.current.scale.setScalar(1 + Math.sin(time * 2) * 0.01);
    } else if (robotRef.current) {
      robotRef.current.scale.setScalar(1);
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

    // Arm wave animation - very subtle
    if (leftHandRef.current) {
      leftHandRef.current.rotation.z = Math.sin(time * 1.5) * 0.15;
    }
    if (rightHandRef.current) {
      rightHandRef.current.rotation.z = Math.sin(time * 1.5 + Math.PI) * 0.15;
    }
  });

  // Color scheme: "Zorgie" - Professional Healthcare AI Assistant
  const colors = {
    bodyLight: "#E8F5F2",    // Soft mint (top)
    bodyDark: "#B2DFDB",     // Darker mint (bottom)
    accent: "#4DB6AC",       // Teal accent
    eyes: "#FFB74D",         // Warm amber eyes
    eyeGlow: "#FFC107",      // Golden glow
    cheeks: "#FFAB91",       // Coral cheeks
    heart: "#FF7043",        // Heart detail
    mouth: "#4DB6AC"         // Teal mouth
  };

  return (
    <group ref={robotRef} position={[0, 0, 0]}>
      {/* Unified egg-shaped body - bottom half (darker mint) */}
      <Sphere args={[1.0, 32, 32]} position={[0, -0.2, 0]} scale={[0.9, 1.1, 0.85]}>
        <meshStandardMaterial 
          color={colors.bodyDark} 
          metalness={0.05}
          roughness={0.7}
        />
      </Sphere>

      {/* Unified egg-shaped body - top half (lighter mint, overlapping) */}
      <Sphere args={[1.0, 32, 32]} position={[0, 0.3, 0]} scale={[0.9, 1.1, 0.85]}>
        <meshStandardMaterial 
          color={colors.bodyLight} 
          metalness={0.05}
          roughness={0.7}
        />
      </Sphere>

      {/* Left eye - large warm amber with golden glow */}
      <group ref={leftEyeRef} position={[-0.28, 0.45, 0.78]}>
        {/* Main eye */}
        <Sphere args={[0.22, 24, 24]} scale={[1.1, 1, 1]}>
          <meshStandardMaterial 
            color={colors.eyes}
            emissive={colors.eyeGlow}
            emissiveIntensity={0.4}
            metalness={0.1}
            roughness={0.2}
          />
        </Sphere>
        {/* White highlight */}
        <Sphere args={[0.06, 16, 16]} position={[0.08, 0.08, 0.15]}>
          <meshStandardMaterial 
            color="#FFFFFF"
            emissive="#FFFFFF"
            emissiveIntensity={0.8}
            metalness={0}
            roughness={0.1}
          />
        </Sphere>
      </group>

      {/* Right eye - large warm amber with golden glow */}
      <group ref={rightEyeRef} position={[0.28, 0.45, 0.78]}>
        {/* Main eye */}
        <Sphere args={[0.22, 24, 24]} scale={[1.1, 1, 1]}>
          <meshStandardMaterial 
            color={colors.eyes}
            emissive={colors.eyeGlow}
            emissiveIntensity={0.4}
            metalness={0.1}
            roughness={0.2}
          />
        </Sphere>
        {/* White highlight */}
        <Sphere args={[0.06, 16, 16]} position={[-0.08, 0.08, 0.15]}>
          <meshStandardMaterial 
            color="#FFFFFF"
            emissive="#FFFFFF"
            emissiveIntensity={0.8}
            metalness={0}
            roughness={0.1}
          />
        </Sphere>
      </group>

      {/* Left cheek - subtle coral circle */}
      <Sphere args={[0.12, 16, 16]} position={[-0.45, 0.25, 0.75]}>
        <meshStandardMaterial 
          color={colors.cheeks}
          transparent
          opacity={0.4}
          metalness={0}
          roughness={0.9}
        />
      </Sphere>

      {/* Right cheek - subtle coral circle */}
      <Sphere args={[0.12, 16, 16]} position={[0.45, 0.25, 0.75]}>
        <meshStandardMaterial 
          color={colors.cheeks}
          transparent
          opacity={0.4}
          metalness={0}
          roughness={0.9}
        />
      </Sphere>

      {/* Mouth - small teal smile curve */}
      <RoundedBox args={[0.25, 0.06, 0.08]} radius={0.03} position={[0, 0.15, 0.82]}>
        <meshStandardMaterial 
          color={colors.mouth}
          metalness={0.1}
          roughness={0.6}
        />
      </RoundedBox>

      {/* Heart detail on chest - pulses when active */}
      <group position={[0, -0.15, 0.85]} scale={isActive ? [1, 1, 1] : [0.9, 0.9, 0.9]}>
        {/* Heart shape approximation using spheres */}
        <Sphere args={[0.08, 16, 16]} position={[-0.06, 0.02, 0]}>
          <meshStandardMaterial 
            color={colors.heart}
            emissive={colors.heart}
            emissiveIntensity={isActive ? 0.3 : 0.1}
            metalness={0.1}
            roughness={0.4}
          />
        </Sphere>
        <Sphere args={[0.08, 16, 16]} position={[0.06, 0.02, 0]}>
          <meshStandardMaterial 
            color={colors.heart}
            emissive={colors.heart}
            emissiveIntensity={isActive ? 0.3 : 0.1}
            metalness={0.1}
            roughness={0.4}
          />
        </Sphere>
        <Sphere args={[0.10, 16, 16]} position={[0, -0.08, 0]} scale={[1, 1.2, 1]}>
          <meshStandardMaterial 
            color={colors.heart}
            emissive={colors.heart}
            emissiveIntensity={isActive ? 0.3 : 0.1}
            metalness={0.1}
            roughness={0.4}
          />
        </Sphere>
      </group>

      {/* Left arm stump - minimalistic */}
      <group ref={leftHandRef} position={[-0.65, -0.15, 0]}>
        <Cylinder args={[0.14, 0.12, 0.35, 16]} rotation={[0, 0, Math.PI / 6]}>
          <meshStandardMaterial 
            color={colors.bodyDark}
            metalness={0.05}
            roughness={0.7}
          />
        </Cylinder>
      </group>

      {/* Right arm stump - minimalistic */}
      <group ref={rightHandRef} position={[0.65, -0.15, 0]}>
        <Cylinder args={[0.14, 0.12, 0.35, 16]} rotation={[0, 0, -Math.PI / 6]}>
          <meshStandardMaterial 
            color={colors.bodyDark}
            metalness={0.05}
            roughness={0.7}
          />
        </Cylinder>
      </group>
    </group>
  );
};
