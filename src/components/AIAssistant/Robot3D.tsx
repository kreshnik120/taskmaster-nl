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

    // Kawaii bouncy floating - energetic and playful
    robotRef.current.position.y = Math.sin(time * 2.5) * 0.08 + Math.cos(time * 1.8) * 0.03;
    
    // Playful head tilt and rotation
    robotRef.current.rotation.z = Math.sin(time * 1.5) * 0.08;
    robotRef.current.rotation.y = Math.cos(time * 1.2) * 0.05;
    
    // Bouncy scale pulse - kawaii energy
    const bounce = 1 + Math.sin(time * 3.5) * 0.04;
    const activePulse = isActive ? 1 + Math.sin(time * 4) * 0.03 : 1;
    robotRef.current.scale.setScalar(bounce * activePulse);

    // Anime-style blinking with excitement
    if (blinkTime > 3.5) {
      const blinkProgress = (blinkTime - 3.5) * 12;
      const scaleY = blinkProgress < 1 ? 1 - blinkProgress : blinkProgress - 1;
      
      if (leftEyeRef.current) {
        leftEyeRef.current.scale.y = Math.max(0.1, scaleY);
        // Slight eye bounce
        leftEyeRef.current.scale.x = 1 + Math.sin(time * 3) * 0.05;
      }
      if (rightEyeRef.current) {
        rightEyeRef.current.scale.y = Math.max(0.1, scaleY);
        rightEyeRef.current.scale.x = 1 + Math.sin(time * 3) * 0.05;
      }
      
      if (blinkTime > 3.7) {
        blinkTimeRef.current = 0;
      }
    }

    // Excited arm wave animation - bouncy
    if (leftHandRef.current) {
      leftHandRef.current.rotation.z = Math.sin(time * 3) * 0.25;
    }
    if (rightHandRef.current) {
      rightHandRef.current.rotation.z = Math.sin(time * 3.5 + 0.5) * 0.35;
    }
  });

  // Kawaii/Anime pastel color palette
  const colors = {
    bodyLight: "#FFE6F0",      // Soft pastel pink
    bodyDark: "#E8D5F2",       // Lavender
    accent: "#C8A2E0",         // Soft purple accent
    eyes: "#4A90E2",           // Bright anime blue
    eyeGlow: "#87CEEB",        // Sky blue glow
    cheeks: "#FFB5C5",         // Rosy pink blush
    heart: "#FF69B4",          // Hot pink heart
    mouth: "#FFB5C5",          // Pink smile
    pupil: "#2C3E50"           // Dark pupil
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

      {/* Left eye - HUGE Kawaii/Anime style with sparkles and pupil */}
      <group ref={leftEyeRef} position={[-0.20, 0.5, 0.8]}>
        {/* White eye background */}
        <Sphere args={[0.35, 24, 24]} scale={[1.1, 1.4, 0.8]}>
          <meshStandardMaterial 
            color="#FFFFFF"
            metalness={0.05}
            roughness={0.2}
          />
        </Sphere>
        {/* Anime iris - large and expressive */}
        <Sphere args={[0.24, 24, 24]} position={[0, -0.03, 0.20]} scale={[1.1, 1.3, 0.9]}>
          <meshStandardMaterial 
            color={colors.eyes}
            emissive={colors.eyeGlow}
            emissiveIntensity={0.6}
            metalness={0.2}
            roughness={0.3}
          />
        </Sphere>
        {/* Dark pupil */}
        <Sphere args={[0.11, 16, 16]} position={[0, -0.03, 0.28]}>
          <meshStandardMaterial 
            color={colors.pupil}
            metalness={0.8}
            roughness={0.2}
          />
        </Sphere>
        {/* HUGE anime highlight (top-left) */}
        <Sphere args={[0.14, 16, 16]} position={[-0.08, 0.12, 0.32]}>
          <meshStandardMaterial 
            color="#FFFFFF"
            emissive="#FFFFFF"
            emissiveIntensity={1.5}
            transparent
            opacity={0.98}
          />
        </Sphere>
        {/* Secondary highlight */}
        <Sphere args={[0.08, 16, 16]} position={[0.10, 0.08, 0.34]}>
          <meshStandardMaterial 
            color="#FFFFFF"
            emissive="#FFFFFF"
            emissiveIntensity={1.3}
            transparent
            opacity={0.9}
          />
        </Sphere>
        {/* Sparkle stars */}
        <Sphere args={[0.04, 8, 8]} position={[-0.18, 0.22, 0.36]}>
          <meshStandardMaterial 
            color="#FFFFFF"
            emissive="#FFE6F0"
            emissiveIntensity={2.0}
            transparent
            opacity={0.95}
          />
        </Sphere>
        <Sphere args={[0.03, 8, 8]} position={[0.18, -0.18, 0.36]}>
          <meshStandardMaterial 
            color="#FFFFFF"
            emissive="#E8D5F2"
            emissiveIntensity={1.8}
            transparent
            opacity={0.9}
          />
        </Sphere>
      </group>

      {/* Right eye - HUGE Kawaii/Anime style with sparkles and pupil */}
      <group ref={rightEyeRef} position={[0.20, 0.5, 0.8]}>
        {/* White eye background */}
        <Sphere args={[0.35, 24, 24]} scale={[1.1, 1.4, 0.8]}>
          <meshStandardMaterial 
            color="#FFFFFF"
            metalness={0.05}
            roughness={0.2}
          />
        </Sphere>
        {/* Anime iris - large and expressive */}
        <Sphere args={[0.24, 24, 24]} position={[0, -0.03, 0.20]} scale={[1.1, 1.3, 0.9]}>
          <meshStandardMaterial 
            color={colors.eyes}
            emissive={colors.eyeGlow}
            emissiveIntensity={0.6}
            metalness={0.2}
            roughness={0.3}
          />
        </Sphere>
        {/* Dark pupil */}
        <Sphere args={[0.11, 16, 16]} position={[0, -0.03, 0.28]}>
          <meshStandardMaterial 
            color={colors.pupil}
            metalness={0.8}
            roughness={0.2}
          />
        </Sphere>
        {/* HUGE anime highlight (top-right) */}
        <Sphere args={[0.14, 16, 16]} position={[0.08, 0.12, 0.32]}>
          <meshStandardMaterial 
            color="#FFFFFF"
            emissive="#FFFFFF"
            emissiveIntensity={1.5}
            transparent
            opacity={0.98}
          />
        </Sphere>
        {/* Secondary highlight */}
        <Sphere args={[0.08, 16, 16]} position={[-0.10, 0.08, 0.34]}>
          <meshStandardMaterial 
            color="#FFFFFF"
            emissive="#FFFFFF"
            emissiveIntensity={1.3}
            transparent
            opacity={0.9}
          />
        </Sphere>
        {/* Sparkle stars */}
        <Sphere args={[0.04, 8, 8]} position={[0.18, 0.22, 0.36]}>
          <meshStandardMaterial 
            color="#FFFFFF"
            emissive="#FFE6F0"
            emissiveIntensity={2.0}
            transparent
            opacity={0.95}
          />
        </Sphere>
        <Sphere args={[0.03, 8, 8]} position={[-0.18, -0.18, 0.36]}>
          <meshStandardMaterial 
            color="#FFFFFF"
            emissive="#E8D5F2"
            emissiveIntensity={1.8}
            transparent
            opacity={0.9}
          />
        </Sphere>
      </group>

      {/* Kawaii Rosy Blush Cheeks - bigger and more visible */}
      <Sphere args={[0.16, 16, 16]} position={[-0.50, 0.28, 0.78]} scale={[1.3, 0.9, 0.6]}>
        <meshStandardMaterial 
          color={colors.cheeks}
          transparent
          opacity={0.75}
          emissive={colors.cheeks}
          emissiveIntensity={0.4}
          metalness={0}
          roughness={0.9}
        />
      </Sphere>

      <Sphere args={[0.16, 16, 16]} position={[0.50, 0.28, 0.78]} scale={[1.3, 0.9, 0.6]}>
        <meshStandardMaterial 
          color={colors.cheeks}
          transparent
          opacity={0.75}
          emissive={colors.cheeks}
          emissiveIntensity={0.4}
          metalness={0}
          roughness={0.9}
        />
      </Sphere>

      {/* Kawaii Smile - curved with small spheres for anime style */}
      <group position={[0, 0.12, 0.83]}>
        <Sphere args={[0.028]} position={[-0.10, 0, 0]}>
          <meshStandardMaterial color={colors.mouth} emissive={colors.mouth} emissiveIntensity={0.3} />
        </Sphere>
        <Sphere args={[0.028]} position={[-0.06, -0.012, 0]}>
          <meshStandardMaterial color={colors.mouth} emissive={colors.mouth} emissiveIntensity={0.3} />
        </Sphere>
        <Sphere args={[0.028]} position={[-0.02, -0.018, 0]}>
          <meshStandardMaterial color={colors.mouth} emissive={colors.mouth} emissiveIntensity={0.3} />
        </Sphere>
        <Sphere args={[0.028]} position={[0.02, -0.018, 0]}>
          <meshStandardMaterial color={colors.mouth} emissive={colors.mouth} emissiveIntensity={0.3} />
        </Sphere>
        <Sphere args={[0.028]} position={[0.06, -0.012, 0]}>
          <meshStandardMaterial color={colors.mouth} emissive={colors.mouth} emissiveIntensity={0.3} />
        </Sphere>
        <Sphere args={[0.028]} position={[0.10, 0, 0]}>
          <meshStandardMaterial color={colors.mouth} emissive={colors.mouth} emissiveIntensity={0.3} />
        </Sphere>
      </group>

      {/* Glowing Kawaii Heart - bigger and more prominent */}
      <group position={[0, -0.08, 0.86]}>
        {/* Heart shape using spheres - bigger */}
        <Sphere args={[0.12, 16, 16]} position={[-0.08, 0.03, 0]}>
          <meshStandardMaterial 
            color={colors.heart}
            emissive={colors.heart}
            emissiveIntensity={isActive ? 0.8 : 0.5}
            metalness={0.3}
            roughness={0.3}
          />
        </Sphere>
        <Sphere args={[0.12, 16, 16]} position={[0.08, 0.03, 0]}>
          <meshStandardMaterial 
            color={colors.heart}
            emissive={colors.heart}
            emissiveIntensity={isActive ? 0.8 : 0.5}
            metalness={0.3}
            roughness={0.3}
          />
        </Sphere>
        <Sphere args={[0.14, 16, 16]} position={[0, -0.10, 0]} scale={[1, 1.3, 1]}>
          <meshStandardMaterial 
            color={colors.heart}
            emissive={colors.heart}
            emissiveIntensity={isActive ? 0.8 : 0.5}
            metalness={0.3}
            roughness={0.3}
          />
        </Sphere>
        {/* Heart glow halo */}
        <Sphere args={[0.20, 16, 16]} position={[0, -0.02, 0]}>
          <meshStandardMaterial 
            color={colors.heart}
            emissive={colors.heart}
            emissiveIntensity={0.3}
            transparent
            opacity={0.4}
          />
        </Sphere>
      </group>

      {/* Left arm - small and cute */}
      <group ref={leftHandRef} position={[-0.6, 0, 0.1]}>
        <Cylinder args={[0.08, 0.08, 0.3, 16]} rotation={[0, 0, Math.PI / 5]}>
          <meshStandardMaterial 
            color={colors.bodyDark}
            metalness={0.05}
            roughness={0.7}
          />
        </Cylinder>
        {/* Small hand */}
        <Sphere args={[0.10, 16, 16]} position={[-0.12, -0.18, 0]}>
          <meshStandardMaterial 
            color={colors.accent}
            metalness={0.1}
            roughness={0.6}
          />
        </Sphere>
      </group>

      {/* Right arm - small and cute */}
      <group ref={rightHandRef} position={[0.6, 0, 0.1]}>
        <Cylinder args={[0.08, 0.08, 0.3, 16]} rotation={[0, 0, -Math.PI / 5]}>
          <meshStandardMaterial 
            color={colors.bodyDark}
            metalness={0.05}
            roughness={0.7}
          />
        </Cylinder>
        {/* Small hand */}
        <Sphere args={[0.10, 16, 16]} position={[0.12, -0.18, 0]}>
          <meshStandardMaterial 
            color={colors.accent}
            metalness={0.1}
            roughness={0.6}
          />
        </Sphere>
      </group>

      {/* Left leg - small and cute */}
      <Cylinder args={[0.10, 0.08, 0.25, 16]} position={[-0.25, -0.85, 0]}>
        <meshStandardMaterial 
          color={colors.bodyDark}
          metalness={0.05}
          roughness={0.7}
        />
      </Cylinder>
      {/* Left foot */}
      <Sphere args={[0.12, 16, 16]} position={[-0.25, -1.0, 0.08]} scale={[1, 0.6, 1.3]}>
        <meshStandardMaterial 
          color={colors.accent}
          metalness={0.1}
          roughness={0.6}
        />
      </Sphere>

      {/* Right leg - small and cute */}
      <Cylinder args={[0.10, 0.08, 0.25, 16]} position={[0.25, -0.85, 0]}>
        <meshStandardMaterial 
          color={colors.bodyDark}
          metalness={0.05}
          roughness={0.7}
        />
      </Cylinder>
      {/* Right foot */}
      <Sphere args={[0.12, 16, 16]} position={[0.25, -1.0, 0.08]} scale={[1, 0.6, 1.3]}>
        <meshStandardMaterial 
          color={colors.accent}
          metalness={0.1}
          roughness={0.6}
        />
      </Sphere>
    </group>
  );
};
