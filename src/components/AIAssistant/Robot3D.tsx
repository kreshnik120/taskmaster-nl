import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Capsule, Torus, Cylinder } from '@react-three/drei';
import * as THREE from 'three';

interface Robot3DProps {
  isActive?: boolean;
  dragVelocity?: { x: number; y: number };
}

export const Robot3D = ({ isActive, dragVelocity }: Robot3DProps) => {
  const robotRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);
  const headRef = useRef<THREE.Mesh>(null);
  const leftEyeRef = useRef<THREE.Group>(null);
  const rightEyeRef = useRef<THREE.Group>(null);
  const checkmarkRef = useRef<THREE.Group>(null);
  const statusRingRef = useRef<THREE.Mesh>(null);
  const antennaRef = useRef<THREE.Mesh>(null);
  const ledBarRef = useRef<THREE.Mesh>(null);
  
  // Refs for smooth rotation interpolation
  const targetRotation = useRef({ x: 0, y: 0 });
  const currentRotation = useRef({ x: 0, y: 0 });

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
    
    // Calculate target rotation based on drag velocity
    if (dragVelocity) {
      // Y rotation: horizontal drag (max ~15° = 0.26 rad)
      targetRotation.current.y = THREE.MathUtils.clamp(dragVelocity.x * 0.02, -0.26, 0.26);
      // X rotation: vertical drag (max ~8° = 0.15 rad)
      targetRotation.current.x = THREE.MathUtils.clamp(dragVelocity.y * -0.02, -0.15, 0.15);
    } else {
      // Return to neutral when not dragging
      targetRotation.current.x = 0;
      targetRotation.current.y = 0;
    }
    
    // Smooth interpolation (lerp factor 0.1)
    currentRotation.current.x = THREE.MathUtils.lerp(
      currentRotation.current.x,
      targetRotation.current.x,
      0.1
    );
    currentRotation.current.y = THREE.MathUtils.lerp(
      currentRotation.current.y,
      targetRotation.current.y,
      0.1
    );
    
    // Apply rotation (combine with existing subtle animation)
    robotRef.current.rotation.y = currentRotation.current.y + Math.sin(time * 0.5) * 0.02;
    robotRef.current.rotation.x = currentRotation.current.x;

    // Subtle "breathing" - head scale variation
    if (headRef.current) {
      const breathe = 1 + Math.sin(time * 1.2) * 0.01;
      headRef.current.scale.setScalar(breathe);
    }

      // Eyes "looking" subtly around when active
    if (leftEyeRef.current && rightEyeRef.current && isActive) {
      const lookX = Math.sin(time * 0.7) * 0.02;
      const lookY = Math.cos(time * 0.5) * 0.01;
      leftEyeRef.current.position.x = -0.16 + lookX;
      leftEyeRef.current.position.y = 0.55 + lookY;
      rightEyeRef.current.position.x = 0.16 + lookX;
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

    // LED bar pulse when active (communication indicator)
    if (ledBarRef.current) {
      const material = ledBarRef.current.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = isActive 
        ? 0.4 + Math.sin(time * 3) * 0.3
        : 0.2;
    }
  });

  return (
    <group ref={robotRef} scale={1.1}>
      {/* Head - spherical top part */}
      <Sphere ref={headRef} args={[0.5, 48, 48]} position={[0, 0.5, 0]}>
        <meshPhysicalMaterial 
          color={colors.body}
          metalness={0.15}
          roughness={0.2}
          clearcoat={0.8}
          clearcoatRoughness={0.1}
          envMapIntensity={1}
        />
      </Sphere>

      {/* Ear sensors on sides of head */}
      <group position={[-0.48, 0.5, 0]}>
        <Cylinder args={[0.06, 0.06, 0.08, 16]} rotation={[0, 0, Math.PI / 2]}>
          <meshStandardMaterial color={colors.bodyAccent} metalness={0.3} roughness={0.2} />
        </Cylinder>
        <Sphere args={[0.03, 16, 16]} position={[-0.05, 0, 0]}>
          <meshStandardMaterial color={colors.primary} emissive={colors.glow} emissiveIntensity={0.3} />
        </Sphere>
      </group>

      <group position={[0.48, 0.5, 0]}>
        <Cylinder args={[0.06, 0.06, 0.08, 16]} rotation={[0, 0, Math.PI / 2]}>
          <meshStandardMaterial color={colors.bodyAccent} metalness={0.3} roughness={0.2} />
        </Cylinder>
        <Sphere args={[0.03, 16, 16]} position={[0.05, 0, 0]}>
          <meshStandardMaterial color={colors.primary} emissive={colors.glow} emissiveIntensity={0.3} />
        </Sphere>
      </group>

      {/* Neck connection - smaller ring */}
      <Torus args={[0.28, 0.03, 16, 32]} position={[0, 0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color={colors.primary} metalness={0.5} roughness={0.3} />
      </Torus>

      {/* Second neck ring - thinner */}
      <Torus args={[0.25, 0.02, 16, 32]} position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color={colors.bodyAccent} metalness={0.4} roughness={0.3} />
      </Torus>

      {/* Body - smaller and shorter capsule */}
      <Capsule args={[0.32, 0.45, 8, 32]} position={[0, -0.28, 0]}>
        <meshPhysicalMaterial 
          color={colors.body}
          metalness={0.1}
          roughness={0.3}
          clearcoat={0.5}
          clearcoatRoughness={0.2}
        />
      </Capsule>

      {/* Shoulders - smaller and closer */}
      <Sphere args={[0.10, 16, 16]} position={[-0.40, 0.02, 0]}>
        <meshPhysicalMaterial color={colors.body} metalness={0.1} roughness={0.3} clearcoat={0.5} />
      </Sphere>
      <Sphere args={[0.10, 16, 16]} position={[0.40, 0.02, 0]}>
        <meshPhysicalMaterial color={colors.body} metalness={0.1} roughness={0.3} clearcoat={0.5} />
      </Sphere>

      {/* Left arm - shorter and closer */}
      <Capsule args={[0.05, 0.26, 4, 16]} position={[-0.46, -0.13, 0]} rotation={[0, 0, 0.1]}>
        <meshPhysicalMaterial color={colors.body} metalness={0.1} roughness={0.3} clearcoat={0.5} />
      </Capsule>
      <Sphere args={[0.05, 16, 16]} position={[-0.46, -0.26, 0]}>
        <meshStandardMaterial color="#1E293B" metalness={0.5} roughness={0.3} />
      </Sphere>
      <Sphere args={[0.07, 16, 16]} position={[-0.46, -0.38, 0]}>
        <meshStandardMaterial color={colors.primary} metalness={0.4} roughness={0.3} />
      </Sphere>

      {/* Right arm - shorter and closer */}
      <Capsule args={[0.05, 0.26, 4, 16]} position={[0.46, -0.13, 0]} rotation={[0, 0, -0.1]}>
        <meshPhysicalMaterial color={colors.body} metalness={0.1} roughness={0.3} clearcoat={0.5} />
      </Capsule>
      <Sphere args={[0.05, 16, 16]} position={[0.46, -0.26, 0]}>
        <meshStandardMaterial color="#1E293B" metalness={0.5} roughness={0.3} />
      </Sphere>
      <Sphere args={[0.07, 16, 16]} position={[0.46, -0.38, 0]}>
        <meshStandardMaterial color={colors.primary} metalness={0.4} roughness={0.3} />
      </Sphere>

      {/* Left leg - shorter and higher */}
      <Capsule args={[0.07, 0.18, 4, 16]} position={[-0.12, -0.61, 0]}>
        <meshPhysicalMaterial color={colors.body} metalness={0.1} roughness={0.3} clearcoat={0.5} />
      </Capsule>
      <Sphere args={[0.06, 16, 16]} position={[-0.12, -0.70, 0]}>
        <meshStandardMaterial color="#1E293B" metalness={0.5} roughness={0.3} />
      </Sphere>
      <Sphere args={[0.08, 16, 16]} position={[-0.12, -0.80, 0]}>
        <meshStandardMaterial color={colors.primary} metalness={0.4} roughness={0.3} />
      </Sphere>

      {/* Right leg - shorter and higher */}
      <Capsule args={[0.07, 0.18, 4, 16]} position={[0.12, -0.61, 0]}>
        <meshPhysicalMaterial color={colors.body} metalness={0.1} roughness={0.3} clearcoat={0.5} />
      </Capsule>
      <Sphere args={[0.06, 16, 16]} position={[0.12, -0.70, 0]}>
        <meshStandardMaterial color="#1E293B" metalness={0.5} roughness={0.3} />
      </Sphere>
      <Sphere args={[0.08, 16, 16]} position={[0.12, -0.80, 0]}>
        <meshStandardMaterial color={colors.primary} metalness={0.4} roughness={0.3} />
      </Sphere>

      {/* Tech accent lines - smaller body */}
      <Torus args={[0.35, 0.008, 16, 32]} position={[0, -0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color={colors.primary} opacity={0.3} transparent metalness={0.6} />
      </Torus>
      <Torus args={[0.35, 0.008, 16, 32]} position={[0, -0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color={colors.primary} opacity={0.3} transparent metalness={0.6} />
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

      {/* Left eye - larger, more forward, softer grey */}
      <group ref={leftEyeRef} position={[-0.16, 0.55, 0.45]}>
        {/* Eye housing - larger */}
        <Torus args={[0.11, 0.02, 16, 32]}>
          <meshStandardMaterial color="#334155" />
        </Torus>
        {/* LED core - larger */}
        <Sphere args={[0.10, 16, 16]}>
          <meshStandardMaterial 
            color={colors.eyes}
            emissive={colors.eyeGlow}
            emissiveIntensity={0.8}
          />
        </Sphere>
        {/* Double highlights - proportionally larger */}
        <Sphere args={[0.027, 16, 16]} position={[0.03, 0.03, 0.075]}>
          <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={1.2} />
        </Sphere>
        <Sphere args={[0.016, 16, 16]} position={[-0.02, -0.02, 0.08]}>
          <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={0.8} />
        </Sphere>
      </group>

      {/* Right eye - larger, more forward, softer grey */}
      <group ref={rightEyeRef} position={[0.16, 0.55, 0.45]}>
        {/* Eye housing - larger */}
        <Torus args={[0.11, 0.02, 16, 32]}>
          <meshStandardMaterial color="#334155" />
        </Torus>
        {/* LED core - larger */}
        <Sphere args={[0.10, 16, 16]}>
          <meshStandardMaterial 
            color={colors.eyes}
            emissive={colors.eyeGlow}
            emissiveIntensity={0.8}
          />
        </Sphere>
        {/* Double highlights - proportionally larger */}
        <Sphere args={[0.027, 16, 16]} position={[0.03, 0.03, 0.075]}>
          <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={1.2} />
        </Sphere>
        <Sphere args={[0.016, 16, 16]} position={[-0.02, -0.02, 0.08]}>
          <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={0.8} />
        </Sphere>
      </group>

      {/* Communication LED bar below eyes - more forward */}
      <Cylinder 
        ref={ledBarRef}
        args={[0.012, 0.012, 0.22, 8]} 
        position={[0, 0.32, 0.48]} 
        rotation={[0, 0, Math.PI / 2]}
      >
        <meshStandardMaterial 
          color={colors.primary} 
          emissive={colors.glow}
          emissiveIntensity={0.4}
        />
      </Cylinder>

      {/* Forehead sensor - more forward */}
      <Sphere args={[0.04, 16, 16]} position={[0, 0.78, 0.42]}>
        <meshStandardMaterial 
          color={colors.primary}
          emissive={colors.glow}
          emissiveIntensity={0.5}
        />
      </Sphere>

      {/* Chest display frame - smaller and higher */}
      {/* Vertical lines */}
      <Cylinder args={[0.008, 0.008, 0.14, 8]} position={[-0.06, -0.25, 0.35]}>
        <meshStandardMaterial color={colors.primary} opacity={0.5} transparent />
      </Cylinder>
      <Cylinder args={[0.008, 0.008, 0.14, 8]} position={[0.06, -0.25, 0.35]}>
        <meshStandardMaterial color={colors.primary} opacity={0.5} transparent />
      </Cylinder>
      {/* Horizontal lines */}
      <Cylinder args={[0.008, 0.008, 0.12, 8]} position={[0, -0.18, 0.35]} rotation={[0, 0, Math.PI/2]}>
        <meshStandardMaterial color={colors.primary} opacity={0.5} transparent />
      </Cylinder>
      <Cylinder args={[0.008, 0.008, 0.12, 8]} position={[0, -0.32, 0.35]} rotation={[0, 0, Math.PI/2]}>
        <meshStandardMaterial color={colors.primary} opacity={0.5} transparent />
      </Cylinder>

      {/* Checkmark emblem - larger, centered, more forward */}
      <group ref={checkmarkRef} position={[0, -0.25, 0.38]}>
        {/* Short stroke */}
        <Cylinder args={[0.018, 0.018, 0.06, 8]} position={[-0.02, -0.012, 0]} rotation={[0, 0, -0.8]}>
          <meshStandardMaterial 
            color={colors.checkmark} 
            emissive={colors.checkmark} 
            emissiveIntensity={isActive ? 0.8 : 0.4}
          />
        </Cylinder>
        {/* Long stroke */}
        <Cylinder args={[0.018, 0.018, 0.09, 8]} position={[0.008, 0.015, 0]} rotation={[0, 0, 0.5]}>
          <meshStandardMaterial 
            color={colors.checkmark} 
            emissive={colors.checkmark} 
            emissiveIntensity={isActive ? 0.8 : 0.4}
          />
        </Cylinder>
      </group>

      {/* Side panel ventilation lines - adjusted for smaller body */}
      {/* Left side */}
      <Cylinder args={[0.006, 0.006, 0.08, 8]} position={[-0.32, -0.16, 0.15]}>
        <meshStandardMaterial color={colors.bodyAccent} opacity={0.8} transparent />
      </Cylinder>
      <Cylinder args={[0.006, 0.006, 0.08, 8]} position={[-0.32, -0.25, 0.15]}>
        <meshStandardMaterial color={colors.bodyAccent} opacity={0.8} transparent />
      </Cylinder>
      <Cylinder args={[0.006, 0.006, 0.08, 8]} position={[-0.32, -0.34, 0.15]}>
        <meshStandardMaterial color={colors.bodyAccent} opacity={0.8} transparent />
      </Cylinder>

      {/* Right side */}
      <Cylinder args={[0.006, 0.006, 0.08, 8]} position={[0.32, -0.16, 0.15]}>
        <meshStandardMaterial color={colors.bodyAccent} opacity={0.8} transparent />
      </Cylinder>
      <Cylinder args={[0.006, 0.006, 0.08, 8]} position={[0.32, -0.25, 0.15]}>
        <meshStandardMaterial color={colors.bodyAccent} opacity={0.8} transparent />
      </Cylinder>
      <Cylinder args={[0.006, 0.006, 0.08, 8]} position={[0.32, -0.34, 0.15]}>
        <meshStandardMaterial color={colors.bodyAccent} opacity={0.8} transparent />
      </Cylinder>

      {/* Status ring at bottom - higher position */}
      <Torus 
        ref={statusRingRef}
        args={[0.25, 0.015, 16, 32]} 
        position={[0, -0.90, 0]} 
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
