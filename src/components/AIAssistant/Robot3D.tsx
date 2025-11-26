import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Capsule, Torus, Cylinder } from '@react-three/drei';
import * as THREE from 'three';

interface Robot3DProps {
  isActive?: boolean;
  dragVelocity?: { x: number; y: number };
  mousePos?: { x: number; y: number };
}

// ═══════════════════════════════════════════════
// CONSTANTS & CONFIGURATION
// ═══════════════════════════════════════════════

const COLORS = {
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

const MATERIALS = {
  body: { color: COLORS.body, metalness: 0, roughness: 0.3, clearcoat: 0.5 },
  bodyPhysical: { color: COLORS.body, metalness: 0, roughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.3 },
  accent: { color: COLORS.bodyAccent, opacity: 0.8, transparent: true },
  joint: { color: "#1E293B", metalness: 0.5, roughness: 0.3 },
  handFoot: { color: COLORS.primary, metalness: 0.4, roughness: 0.3 }
};

const GEOMETRY = {
  head: { radius: 0.55, segments: 48, position: [0, 0.55, 0] as [number, number, number] },
  body: { radius: 0.35, length: 0.15, position: [0, -0.20, 0] as [number, number, number] },
  shoulder: { radius: 0.10, position: { left: [-0.40, 0.02, 0] as [number, number, number], right: [0.40, 0.02, 0] as [number, number, number] } },
  arm: { radius: 0.05, length: 0.20, position: { left: [-0.46, -0.08, 0] as [number, number, number], right: [0.46, -0.08, 0] as [number, number, number] } },
  elbow: { radius: 0.05, position: { left: [-0.46, -0.18, 0] as [number, number, number], right: [0.46, -0.18, 0] as [number, number, number] } },
  hand: { radius: 0.10, position: { left: [-0.46, -0.28, 0] as [number, number, number], right: [0.46, -0.28, 0] as [number, number, number] } },
  leg: { radius: 0.07, length: 0.15, position: { left: [-0.12, -0.48, 0] as [number, number, number], right: [0.12, -0.48, 0] as [number, number, number] } },
  knee: { radius: 0.06, position: { left: [-0.12, -0.55, 0] as [number, number, number], right: [0.12, -0.55, 0] as [number, number, number] } },
  foot: { radius: 0.10, position: { left: [-0.12, -0.60, 0] as [number, number, number], right: [0.12, -0.60, 0] as [number, number, number] } },
  eye: { radius: 0.12, housingRadius: 0.13, position: { left: [-0.16, 0.60, 0.50] as [number, number, number], right: [0.16, 0.60, 0.50] as [number, number, number] } }
};

// ═══════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════

const Eye = ({ position, eyeRef }: { position: [number, number, number]; eyeRef: React.RefObject<THREE.Group> }) => (
  <group ref={eyeRef} position={position}>
    <Torus args={[GEOMETRY.eye.housingRadius, 0.02, 16, 32]}>
      <meshStandardMaterial color="#334155" />
    </Torus>
    <Sphere args={[GEOMETRY.eye.radius, 16, 16]}>
      <meshStandardMaterial color={COLORS.eyes} emissive={COLORS.eyeGlow} emissiveIntensity={0.8} />
    </Sphere>
    <Sphere args={[0.027, 8, 8]} position={[0.03, 0.03, 0.075]}>
      <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={1.2} />
    </Sphere>
    <Sphere args={[0.016, 8, 8]} position={[-0.02, -0.02, 0.08]}>
      <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={0.8} />
    </Sphere>
  </group>
);

const Arm = ({ 
  side, 
  armRef 
}: { 
  side: 'left' | 'right'; 
  armRef: React.RefObject<THREE.Mesh> 
}) => {
  const rotation = side === 'left' ? 0.1 : -0.1;
  const armPos = GEOMETRY.arm.position[side];
  const elbowPos = GEOMETRY.elbow.position[side];
  const handPos = GEOMETRY.hand.position[side];
  
  return (
    <>
      <Capsule ref={armRef} args={[GEOMETRY.arm.radius, GEOMETRY.arm.length, 4, 16]} position={armPos} rotation={[0, 0, rotation]}>
        <meshPhysicalMaterial {...MATERIALS.body} />
      </Capsule>
      <Sphere args={[GEOMETRY.elbow.radius, 12, 12]} position={elbowPos}>
        <meshStandardMaterial {...MATERIALS.joint} />
      </Sphere>
      <Sphere args={[GEOMETRY.hand.radius, 16, 16]} position={handPos}>
        <meshStandardMaterial {...MATERIALS.handFoot} />
      </Sphere>
    </>
  );
};

const Leg = ({ side }: { side: 'left' | 'right' }) => {
  const legPos = GEOMETRY.leg.position[side];
  const kneePos = GEOMETRY.knee.position[side];
  const footPos = GEOMETRY.foot.position[side];
  
  return (
    <>
      <Capsule args={[GEOMETRY.leg.radius, GEOMETRY.leg.length, 4, 16]} position={legPos}>
        <meshPhysicalMaterial {...MATERIALS.body} />
      </Capsule>
      <Sphere args={[GEOMETRY.knee.radius, 12, 12]} position={kneePos}>
        <meshStandardMaterial {...MATERIALS.joint} />
      </Sphere>
      <Sphere args={[GEOMETRY.foot.radius, 16, 16]} position={footPos}>
        <meshStandardMaterial {...MATERIALS.handFoot} />
      </Sphere>
    </>
  );
};

const VentLine = ({ position }: { position: [number, number, number] }) => (
  <Cylinder args={[0.006, 0.006, 0.08, 4]} position={position}>
    <meshStandardMaterial {...MATERIALS.accent} />
  </Cylinder>
);

const EarSensor = ({ position }: { position: [number, number, number] }) => {
  const sensorOffset = position[0] < 0 ? -0.05 : 0.05;
  return (
    <group position={position}>
      <Cylinder args={[0.06, 0.06, 0.08, 16]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color={COLORS.bodyAccent} metalness={0.3} roughness={0.2} />
      </Cylinder>
      <Sphere args={[0.02, 12, 12]} position={[sensorOffset, 0, 0]}>
        <meshStandardMaterial color={COLORS.primary} emissive={COLORS.glow} emissiveIntensity={0.15} />
      </Sphere>
    </group>
  );
};

// ═══════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════

export const Robot3D = ({ isActive, dragVelocity, mousePos }: Robot3DProps) => {
  const robotRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);
  const headRef = useRef<THREE.Mesh>(null);
  const leftEyeRef = useRef<THREE.Group>(null);
  const rightEyeRef = useRef<THREE.Group>(null);
  const checkmarkRef = useRef<THREE.Group>(null);
  const statusRingRef = useRef<THREE.Mesh>(null);
  const antennaRef = useRef<THREE.Mesh>(null);
  const ledBarRef = useRef<THREE.Mesh>(null);
  const smileRef = useRef<THREE.Mesh>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);
  
  const targetRotation = useRef({ x: 0, y: 0 });
  const currentRotation = useRef({ x: 0, y: 0 });
  const targetEyePos = useRef({ x: 0, y: 0 });
  const currentEyePos = useRef({ x: 0, y: 0 });
  const blinkTimer = useRef(0);
  const nextBlinkTime = useRef(3 + Math.random() * 3);
  const isBlinking = useRef(false);
  const blinkProgress = useRef(0);

  useFrame((state, delta) => {
    if (!robotRef.current) return;
    
    timeRef.current += delta;
    const time = timeRef.current;

    // Drag rotation
    if (dragVelocity) {
      targetRotation.current.y = THREE.MathUtils.clamp(dragVelocity.x * 0.15, -0.35, 0.35);
      targetRotation.current.x = THREE.MathUtils.clamp(dragVelocity.y * -0.12, -0.25, 0.25);
    } else {
      targetRotation.current.x = 0;
      targetRotation.current.y = 0;
    }
    
    currentRotation.current.x = THREE.MathUtils.lerp(currentRotation.current.x, targetRotation.current.x, 0.1);
    currentRotation.current.y = THREE.MathUtils.lerp(currentRotation.current.y, targetRotation.current.y, 0.1);
    
    robotRef.current.rotation.y = currentRotation.current.y;
    robotRef.current.rotation.x = currentRotation.current.x;

    // Head follows cursor - only movement is cursor tracking
    if (headRef.current && mousePos) {
      const headTiltX = THREE.MathUtils.lerp(headRef.current.rotation.x, mousePos.y * -0.05, 0.05);
      const headTiltY = THREE.MathUtils.lerp(headRef.current.rotation.y, mousePos.x * 0.08, 0.05);
      headRef.current.rotation.x = headTiltX;
      headRef.current.rotation.y = headTiltY;
    }

    // Eye tracking
    if (mousePos && leftEyeRef.current && rightEyeRef.current) {
      const maxOffset = 0.03;
      targetEyePos.current.x = THREE.MathUtils.clamp(mousePos.x * 0.04, -maxOffset, maxOffset);
      targetEyePos.current.y = THREE.MathUtils.clamp(mousePos.y * 0.02, -maxOffset * 0.5, maxOffset * 0.5);
      
      currentEyePos.current.x = THREE.MathUtils.lerp(currentEyePos.current.x, targetEyePos.current.x, 0.1);
      currentEyePos.current.y = THREE.MathUtils.lerp(currentEyePos.current.y, targetEyePos.current.y, 0.1);
      
      leftEyeRef.current.position.set(-0.16 + currentEyePos.current.x, 0.60 + currentEyePos.current.y, 0.50);
      rightEyeRef.current.position.set(0.16 + currentEyePos.current.x, 0.60 + currentEyePos.current.y, 0.50);
    }

    // Blinking
    blinkTimer.current += delta;
    if (blinkTimer.current >= nextBlinkTime.current && !isBlinking.current) {
      isBlinking.current = true;
      blinkProgress.current = 0;
      blinkTimer.current = 0;
      nextBlinkTime.current = 3 + Math.random() * 3;
    }

    if (isBlinking.current) {
      blinkProgress.current += delta * 15;
      
      if (blinkProgress.current >= 1) {
        isBlinking.current = false;
        blinkProgress.current = 0;
      }
      
      let blinkScale = 1;
      if (blinkProgress.current < 0.5) {
        blinkScale = 1 - (blinkProgress.current * 2) * 0.9;
      } else {
        blinkScale = 0.1 + ((blinkProgress.current - 0.5) * 2) * 0.9;
      }
      
      if (leftEyeRef.current && rightEyeRef.current) {
        leftEyeRef.current.scale.set(1, blinkScale, 1);
        rightEyeRef.current.scale.set(1, blinkScale, 1);
      }
    } else {
      if (leftEyeRef.current && rightEyeRef.current) {
        leftEyeRef.current.scale.set(1, 1, 1);
        rightEyeRef.current.scale.set(1, 1, 1);
      }
    }

    // Smile animation
    if (smileRef.current) {
      const targetSmileScale = isActive ? 1.15 : 1.0;
      smileRef.current.scale.x = THREE.MathUtils.lerp(smileRef.current.scale.x, targetSmileScale, 0.1);
    }

    // Antenna scale animation - status indicator
    if (antennaRef.current) {
      const targetScale = isActive ? 1.4 : 1.0;
      antennaRef.current.scale.x = THREE.MathUtils.lerp(antennaRef.current.scale.x, targetScale, 0.1);
      antennaRef.current.scale.y = THREE.MathUtils.lerp(antennaRef.current.scale.y, targetScale, 0.1);
      antennaRef.current.scale.z = THREE.MathUtils.lerp(antennaRef.current.scale.z, targetScale, 0.1);
    }

    // Eye glow pulse
    if (leftEyeRef.current && rightEyeRef.current) {
      const pulse = isActive ? 0.8 + Math.sin(time * 2) * 0.2 : 0.4;
      [leftEyeRef.current, rightEyeRef.current].forEach((eyeRef) => {
        eyeRef.children.forEach((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            if (child.material.emissive) {
              child.material.emissiveIntensity = pulse;
            }
          }
        });
      });
    }

    // Antenna glow - enhanced when active
    if (antennaRef.current) {
      const material = antennaRef.current.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = isActive ? 1.5 + Math.sin(time * 4) * 0.5 : 0.2;
    }

    // Checkmark glow
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

    // LED bar pulse
    if (ledBarRef.current) {
      const material = ledBarRef.current.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = isActive ? 0.4 + Math.sin(time * 3) * 0.3 : 0.2;
    }
  });

  return (
    <group ref={robotRef} scale={1.15}>
      {/* ═══════════════════════════════════════════════ */}
      {/* HEAD SECTION */}
      {/* ═══════════════════════════════════════════════ */}
      
      <Sphere ref={headRef} args={[GEOMETRY.head.radius, GEOMETRY.head.segments, GEOMETRY.head.segments]} position={GEOMETRY.head.position}>
        <meshPhysicalMaterial {...MATERIALS.bodyPhysical} envMapIntensity={1} />
      </Sphere>

      <EarSensor position={[-0.53, 0.55, 0]} />
      <EarSensor position={[0.53, 0.55, 0]} />

      <Eye position={GEOMETRY.eye.position.left} eyeRef={leftEyeRef} />
      <Eye position={GEOMETRY.eye.position.right} eyeRef={rightEyeRef} />

      <Cylinder ref={ledBarRef} args={[0.012, 0.012, 0.22, 4]} position={[0, 0.32, 0.48]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color={COLORS.primary} emissive={COLORS.glow} emissiveIntensity={0.4} />
      </Cylinder>

      <Torus ref={smileRef} args={[0.12, 0.022, 16, 32, Math.PI]} position={[0, 0.36, 0.52]} rotation={[0, 0, Math.PI]}>
        <meshStandardMaterial color={COLORS.primary} emissive={COLORS.glow} emissiveIntensity={0.6} />
      </Torus>

      <Sphere args={[0.04, 12, 12]} position={[0, 0.85, 0.47]}>
        <meshStandardMaterial color={COLORS.primary} emissive={COLORS.glow} emissiveIntensity={0.5} />
      </Sphere>

      {/* Antenna - STATUS INDICATOR */}
      <group position={[0, 1.05, 0]}>
        <Cylinder args={[0.015, 0.015, 0.40, 4]} position={[0, 0.20, 0]}>
          <meshStandardMaterial color={COLORS.primary} metalness={0.8} roughness={0.2} />
        </Cylinder>
        <Sphere ref={antennaRef} args={[0.07, 16, 16]} position={[0, 0.42, 0]}>
          <meshStandardMaterial color={COLORS.status} emissive={COLORS.status} emissiveIntensity={isActive ? 1.5 : 0.2} />
        </Sphere>
        
        {/* PointLight voor groene gloed wanneer chat open */}
        {isActive && (
          <pointLight 
            position={[0, 0.42, 0]} 
            color={COLORS.status} 
            intensity={2} 
            distance={0.8}
            decay={2}
          />
        )}
        
        {/* Glow ring halo effect wanneer chat open */}
        {isActive && (
          <Torus 
            args={[0.12, 0.015, 8, 32]} 
            position={[0, 0.42, 0]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <meshStandardMaterial 
              color={COLORS.status} 
              emissive={COLORS.status} 
              emissiveIntensity={1.0}
              transparent
              opacity={0.6}
            />
          </Torus>
        )}
      </group>

      {/* ═══════════════════════════════════════════════ */}
      {/* BODY SECTION */}
      {/* ═══════════════════════════════════════════════ */}
      
      <Torus args={[0.28, 0.03, 16, 32]} position={[0, 0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color={COLORS.primary} metalness={0.5} roughness={0.3} />
      </Torus>

      <Torus args={[0.25, 0.02, 16, 32]} position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color={COLORS.bodyAccent} metalness={0.4} roughness={0.3} />
      </Torus>

      <Capsule ref={bodyRef} args={[GEOMETRY.body.radius, GEOMETRY.body.length, 8, 32]} position={GEOMETRY.body.position}>
        <meshPhysicalMaterial {...MATERIALS.body} clearcoatRoughness={0.2} />
      </Capsule>

      <Torus args={[0.35, 0.008, 16, 32]} position={[0, -0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color={COLORS.primary} opacity={0.3} transparent metalness={0.6} />
      </Torus>
      <Torus args={[0.35, 0.008, 16, 32]} position={[0, -0.32, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color={COLORS.primary} opacity={0.3} transparent metalness={0.6} />
      </Torus>

      {/* Chest display frame */}
      <Cylinder args={[0.008, 0.008, 0.10, 4]} position={[-0.06, -0.18, 0.35]}>
        <meshStandardMaterial color={COLORS.primary} opacity={0.5} transparent />
      </Cylinder>
      <Cylinder args={[0.008, 0.008, 0.10, 4]} position={[0.06, -0.18, 0.35]}>
        <meshStandardMaterial color={COLORS.primary} opacity={0.5} transparent />
      </Cylinder>
      <Cylinder args={[0.008, 0.008, 0.12, 4]} position={[0, -0.13, 0.35]} rotation={[0, 0, Math.PI/2]}>
        <meshStandardMaterial color={COLORS.primary} opacity={0.5} transparent />
      </Cylinder>
      <Cylinder args={[0.008, 0.008, 0.12, 4]} position={[0, -0.23, 0.35]} rotation={[0, 0, Math.PI/2]}>
        <meshStandardMaterial color={COLORS.primary} opacity={0.5} transparent />
      </Cylinder>

      <group ref={checkmarkRef} position={[0, -0.18, 0.38]}>
        <Cylinder args={[0.018, 0.018, 0.06, 4]} position={[-0.02, -0.012, 0]} rotation={[0, 0, -0.8]}>
          <meshStandardMaterial color={COLORS.checkmark} emissive={COLORS.checkmark} emissiveIntensity={isActive ? 0.8 : 0.4} />
        </Cylinder>
        <Cylinder args={[0.018, 0.018, 0.09, 4]} position={[0.008, 0.015, 0]} rotation={[0, 0, 0.5]}>
          <meshStandardMaterial color={COLORS.checkmark} emissive={COLORS.checkmark} emissiveIntensity={isActive ? 0.8 : 0.4} />
        </Cylinder>
      </group>

      <VentLine position={[-0.32, -0.10, 0.15]} />
      <VentLine position={[-0.32, -0.18, 0.15]} />
      <VentLine position={[-0.32, -0.26, 0.15]} />
      <VentLine position={[0.32, -0.10, 0.15]} />
      <VentLine position={[0.32, -0.18, 0.15]} />
      <VentLine position={[0.32, -0.26, 0.15]} />

      {/* ═══════════════════════════════════════════════ */}
      {/* LIMBS SECTION */}
      {/* ═══════════════════════════════════════════════ */}
      
      <Sphere args={[GEOMETRY.shoulder.radius, 16, 16]} position={GEOMETRY.shoulder.position.left}>
        <meshPhysicalMaterial {...MATERIALS.body} />
      </Sphere>
      <Sphere args={[GEOMETRY.shoulder.radius, 16, 16]} position={GEOMETRY.shoulder.position.right}>
        <meshPhysicalMaterial {...MATERIALS.body} />
      </Sphere>

      <Arm side="left" armRef={leftArmRef} />
      <Arm side="right" armRef={rightArmRef} />

      <Leg side="left" />
      <Leg side="right" />

      <Torus ref={statusRingRef} args={[0.25, 0.015, 16, 32]} position={[0, -0.75, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial 
          color={isActive ? COLORS.status : COLORS.primary}
          emissive={isActive ? COLORS.status : COLORS.primary}
          emissiveIntensity={isActive ? 0.6 : 0.3}
        />
      </Torus>
    </group>
  );
};
