import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Capsule, Torus, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

interface Robot3DProps {
  isActive?: boolean;
}

export const Robot3D = ({ isActive }: Robot3DProps) => {
  const robotRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);
  const leftEyeRef = useRef<THREE.Mesh>(null);
  const rightEyeRef = useRef<THREE.Mesh>(null);
  const checkmarkRef = useRef<THREE.Group>(null);
  const statusRingRef = useRef<THREE.Mesh>(null);

  // Professional TaskFlow color palette
  const colors = {
    body: "#FFFFFF",
    bodyAccent: "#F1F5F9",
    primary: "#3B82F6",
    glow: "#60A5FA",
    eyes: "#1E40AF",
    eyeGlow: "#3B82F6",
    status: "#10B981",
    checkmark: "#3B82F6",
    ring: "#E2E8F0"
  };

  useFrame((state, delta) => {
    if (!robotRef.current) return;
    
    timeRef.current += delta;
    const time = timeRef.current;

    // Subtle, professional floating animation (no bouncy movement)
    robotRef.current.position.y = Math.sin(time * 0.8) * 0.015;
    
    // Very subtle rotation
    robotRef.current.rotation.y = Math.sin(time * 0.5) * 0.02;

    // Eye glow pulse when active
    if (leftEyeRef.current && rightEyeRef.current) {
      const pulse = isActive ? 0.6 + Math.sin(time * 2) * 0.2 : 0.3;
      const eyeMaterial = leftEyeRef.current.material as THREE.MeshStandardMaterial;
      const rightEyeMaterial = rightEyeRef.current.material as THREE.MeshStandardMaterial;
      
      eyeMaterial.emissiveIntensity = pulse;
      rightEyeMaterial.emissiveIntensity = pulse;
    }

    // Checkmark glow when active
    if (checkmarkRef.current) {
      checkmarkRef.current.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          const material = child.material as THREE.MeshStandardMaterial;
          material.emissiveIntensity = isActive ? 0.6 : 0.2;
        }
      });
    }

    // Status ring pulse
    if (statusRingRef.current) {
      const material = statusRingRef.current.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = isActive ? 0.6 + Math.sin(time * 3) * 0.2 : 0.3;
    }
  });

  return (
    <group ref={robotRef} scale={1}>
      {/* Main body - elegant capsule */}
      <Capsule args={[0.6, 1.2, 4, 16]} position={[0, 0, 0]}>
        <meshPhysicalMaterial 
          color={colors.body}
          metalness={0.1}
          roughness={0.3}
          clearcoat={0.5}
          clearcoatRoughness={0.2}
        />
      </Capsule>

      {/* Accent ring around middle */}
      <Torus args={[0.62, 0.02, 16, 32]} position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color={colors.primary} metalness={0.5} roughness={0.3} />
      </Torus>

      {/* Left eye - professional LED style */}
      <group position={[-0.22, 0.35, 0.55]}>
        {/* Eye housing */}
        <RoundedBox args={[0.18, 0.12, 0.05]} radius={0.04}>
          <meshStandardMaterial color="#1E293B" />
        </RoundedBox>
        {/* LED core with glow */}
        <RoundedBox 
          ref={leftEyeRef}
          args={[0.14, 0.08, 0.02]} 
          position={[0, 0, 0.025]} 
          radius={0.03}
        >
          <meshStandardMaterial 
            color={colors.eyes}
            emissive={colors.eyeGlow}
            emissiveIntensity={isActive ? 0.6 : 0.3}
          />
        </RoundedBox>
      </group>

      {/* Right eye - professional LED style */}
      <group position={[0.22, 0.35, 0.55]}>
        {/* Eye housing */}
        <RoundedBox args={[0.18, 0.12, 0.05]} radius={0.04}>
          <meshStandardMaterial color="#1E293B" />
        </RoundedBox>
        {/* LED core with glow */}
        <RoundedBox 
          ref={rightEyeRef}
          args={[0.14, 0.08, 0.02]} 
          position={[0, 0, 0.025]} 
          radius={0.03}
        >
          <meshStandardMaterial 
            color={colors.eyes}
            emissive={colors.eyeGlow}
            emissiveIntensity={isActive ? 0.6 : 0.3}
          />
        </RoundedBox>
      </group>

      {/* Checkmark emblem on chest */}
      <group ref={checkmarkRef} position={[0, -0.15, 0.6]}>
        {/* Short stroke down-left */}
        <mesh position={[-0.04, -0.02, 0]} rotation={[0, 0, Math.PI / 6]}>
          <cylinderGeometry args={[0.015, 0.015, 0.08, 8]} />
          <meshStandardMaterial 
            color={colors.checkmark} 
            emissive={colors.checkmark} 
            emissiveIntensity={isActive ? 0.6 : 0.2}
          />
        </mesh>
        {/* Long stroke up-right */}
        <mesh position={[0.03, 0.02, 0]} rotation={[0, 0, -Math.PI / 4]}>
          <cylinderGeometry args={[0.015, 0.015, 0.14, 8]} />
          <meshStandardMaterial 
            color={colors.checkmark} 
            emissive={colors.checkmark} 
            emissiveIntensity={isActive ? 0.6 : 0.2}
          />
        </mesh>
      </group>

      {/* Status ring at bottom - pulses when active */}
      <Torus 
        ref={statusRingRef}
        args={[0.35, 0.02, 16, 32]} 
        position={[0, -0.7, 0]} 
        rotation={[Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial 
          color={isActive ? colors.status : colors.primary}
          emissive={isActive ? colors.status : colors.primary}
          emissiveIntensity={isActive ? 0.6 : 0.3}
        />
      </Torus>
    </group>
  );
};
