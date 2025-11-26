import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Capsule, Torus, Cylinder } from '@react-three/drei';
import * as THREE from 'three';

interface Robot3DProps {
  isActive?: boolean;
}

export const Robot3D = ({ isActive }: Robot3DProps) => {
  const robotRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);
  const headRef = useRef<THREE.Mesh>(null);
  const leftEyeRef = useRef<THREE.Group>(null);
  const rightEyeRef = useRef<THREE.Group>(null);
  const checkmarkRef = useRef<THREE.Group>(null);
  const statusRingRef = useRef<THREE.Mesh>(null);
  const antennaRef = useRef<THREE.Mesh>(null);

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

    // Subtle "breathing" - head scale variation
    if (headRef.current) {
      const breathe = 1 + Math.sin(time * 1.2) * 0.01;
      headRef.current.scale.setScalar(breathe);
    }

    // Eyes "looking" subtly around when active
    if (leftEyeRef.current && rightEyeRef.current && isActive) {
      const lookX = Math.sin(time * 0.7) * 0.02;
      const lookY = Math.cos(time * 0.5) * 0.01;
      leftEyeRef.current.position.x = -0.18 + lookX;
      leftEyeRef.current.position.y = 0.55 + lookY;
      rightEyeRef.current.position.x = 0.18 + lookX;
      rightEyeRef.current.position.y = 0.55 + lookY;
    }

    // Eye glow pulse when active
    if (leftEyeRef.current && rightEyeRef.current) {
      const pulse = isActive ? 0.8 + Math.sin(time * 2) * 0.2 : 0.4;
      leftEyeRef.current.children.forEach((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          if (child.material.emissive) {
            child.material.emissiveIntensity = pulse;
          }
        }
      });
      rightEyeRef.current.children.forEach((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          if (child.material.emissive) {
            child.material.emissiveIntensity = pulse;
          }
        }
      });
    }

    // Antenna glow pulse when active
    if (antennaRef.current) {
      const material = antennaRef.current.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = isActive ? 0.8 + Math.sin(time * 4) * 0.4 : 0.2;
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
      {/* Head - spherical top part */}
      <Sphere ref={headRef} args={[0.5, 32, 32]} position={[0, 0.5, 0]}>
        <meshPhysicalMaterial 
          color={colors.body}
          metalness={0.15}
          roughness={0.2}
          clearcoat={0.8}
          clearcoatRoughness={0.1}
          envMapIntensity={1}
        />
      </Sphere>

      {/* Neck connection - subtle ring */}
      <Torus args={[0.35, 0.04, 16, 32]} position={[0, 0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color={colors.primary} metalness={0.5} roughness={0.3} />
      </Torus>

      {/* Body - capsule bottom part */}
      <Capsule args={[0.45, 0.8, 4, 16]} position={[0, -0.4, 0]}>
        <meshPhysicalMaterial 
          color={colors.body}
          metalness={0.1}
          roughness={0.3}
          clearcoat={0.5}
          clearcoatRoughness={0.2}
        />
      </Capsule>

      {/* Tech accent lines on body */}
      <Torus args={[0.47, 0.01, 16, 32]} position={[0, -0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color={colors.primary} opacity={0.5} transparent metalness={0.6} />
      </Torus>
      <Torus args={[0.47, 0.01, 16, 32]} position={[0, -0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color={colors.primary} opacity={0.5} transparent metalness={0.6} />
      </Torus>

      {/* Antenna on top of head */}
      <group position={[0, 0.95, 0]}>
        {/* Antenna rod */}
        <Cylinder args={[0.015, 0.015, 0.15, 8]} position={[0, 0.075, 0]}>
          <meshStandardMaterial color={colors.primary} metalness={0.8} roughness={0.2} />
        </Cylinder>
        {/* Antenna tip - pulses */}
        <Sphere ref={antennaRef} args={[0.04, 16, 16]} position={[0, 0.15, 0]}>
          <meshStandardMaterial 
            color={colors.status}
            emissive={colors.status}
            emissiveIntensity={isActive ? 1.0 : 0.2}
          />
        </Sphere>
      </group>

      {/* Left eye - circular LED with inner glow */}
      <group ref={leftEyeRef} position={[-0.18, 0.55, 0.4]}>
        {/* Eye housing - dark ring */}
        <Torus args={[0.1, 0.02, 16, 32]}>
          <meshStandardMaterial color="#1E293B" />
        </Torus>
        {/* LED core - circular with strong glow */}
        <Sphere args={[0.08, 16, 16]}>
          <meshStandardMaterial 
            color={colors.eyes}
            emissive={colors.eyeGlow}
            emissiveIntensity={0.8}
          />
        </Sphere>
        {/* Inner highlight - lively */}
        <Sphere args={[0.03, 16, 16]} position={[0.02, 0.02, 0.05]}>
          <meshStandardMaterial 
            color="#FFFFFF" 
            emissive="#FFFFFF" 
            emissiveIntensity={1.0}
          />
        </Sphere>
      </group>

      {/* Right eye - circular LED with inner glow */}
      <group ref={rightEyeRef} position={[0.18, 0.55, 0.4]}>
        {/* Eye housing - dark ring */}
        <Torus args={[0.1, 0.02, 16, 32]}>
          <meshStandardMaterial color="#1E293B" />
        </Torus>
        {/* LED core - circular with strong glow */}
        <Sphere args={[0.08, 16, 16]}>
          <meshStandardMaterial 
            color={colors.eyes}
            emissive={colors.eyeGlow}
            emissiveIntensity={0.8}
          />
        </Sphere>
        {/* Inner highlight - lively */}
        <Sphere args={[0.03, 16, 16]} position={[0.02, 0.02, 0.05]}>
          <meshStandardMaterial 
            color="#FFFFFF" 
            emissive="#FFFFFF" 
            emissiveIntensity={1.0}
          />
        </Sphere>
      </group>

      {/* Checkmark emblem on chest */}
      <group ref={checkmarkRef} position={[0, -0.35, 0.47]}>
        {/* Short stroke down-left */}
        <Cylinder args={[0.015, 0.015, 0.08, 8]} position={[-0.04, -0.02, 0]} rotation={[0, 0, Math.PI / 6]}>
          <meshStandardMaterial 
            color={colors.checkmark} 
            emissive={colors.checkmark} 
            emissiveIntensity={isActive ? 0.6 : 0.2}
          />
        </Cylinder>
        {/* Long stroke up-right */}
        <Cylinder args={[0.015, 0.015, 0.14, 8]} position={[0.03, 0.02, 0]} rotation={[0, 0, -Math.PI / 4]}>
          <meshStandardMaterial 
            color={colors.checkmark} 
            emissive={colors.checkmark} 
            emissiveIntensity={isActive ? 0.6 : 0.2}
          />
        </Cylinder>
      </group>

      {/* Status ring at bottom - pulses when active */}
      <Torus 
        ref={statusRingRef}
        args={[0.35, 0.02, 16, 32]} 
        position={[0, -0.9, 0]} 
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
