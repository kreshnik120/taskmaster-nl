import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Capsule, Torus, Cylinder } from '@react-three/drei';
import * as THREE from 'three';

interface Robot3DProps {
  isActive?: boolean;
  dragVelocity?: { x: number; y: number };
  mousePos?: { x: number; y: number };
  isUserTyping?: boolean;
  isThinking?: boolean;
  justOpened?: boolean;
  lastMessageReceived?: number;
}

// ═══════════════════════════════════════════════
// CONSTANTS & CONFIGURATION
// ═══════════════════════════════════════════════

const COLORS = {
  body: "#FFFFFF",
  bodyAccent: "#F1F5F9",
  primary: "#3B82F6",
  glow: "#60A5FA",
  eyes: "#2563EB",
  eyeGlow: "#60A5FA",
  status: "#10B981",
  smile: "#F97316",
  smileGlow: "#FB923C",
  checkmark: "#3B82F6",
  ring: "#E2E8F0",
  purple: "#8B5CF6",
  purpleLight: "#EDE9FE",
  rimHighlight: "#E0F2FE"
};

const MATERIALS = {
  body: { color: COLORS.body, metalness: 0, roughness: 0.3, clearcoat: 0.5 },
  bodyPhysical: { color: COLORS.body, metalness: 0, roughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.3 },
  accent: { color: COLORS.bodyAccent, opacity: 0.8, transparent: true },
  joint: { color: "#64748B", metalness: 0.3, roughness: 0.4 },
  handFoot: { color: COLORS.primary, metalness: 0.4, roughness: 0.3 }
};

const GEOMETRY = {
  head: { radius: 0.55, segments: 48, position: [0, 0.55, 0] as [number, number, number] },
  body: { radius: 0.35, length: 0.15, position: [0, -0.20, 0] as [number, number, number] },
  shoulder: { radius: 0.07, position: { left: [-0.38, 0.02, 0] as [number, number, number], right: [0.38, 0.02, 0] as [number, number, number] } },
  arm: { radius: 0.05, length: 0.28, position: { left: [-0.46, -0.12, 0] as [number, number, number], right: [0.46, -0.12, 0] as [number, number, number] } },
  elbow: { radius: 0.05, position: { left: [-0.46, -0.26, 0] as [number, number, number], right: [0.46, -0.26, 0] as [number, number, number] } },
  hand: { radius: 0.10, position: { left: [-0.46, -0.38, 0] as [number, number, number], right: [0.46, -0.38, 0] as [number, number, number] } },
  leg: { radius: 0.07, length: 0.32, position: { left: [-0.12, -0.58, 0] as [number, number, number], right: [0.12, -0.58, 0] as [number, number, number] } },
  knee: { radius: 0.06, position: { left: [-0.12, -0.74, 0] as [number, number, number], right: [0.12, -0.74, 0] as [number, number, number] } },
  foot: { radius: 0.10, position: { left: [-0.12, -0.88, 0] as [number, number, number], right: [0.12, -0.88, 0] as [number, number, number] } },
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
  armRef,
  handRef
}: { 
  side: 'left' | 'right'; 
  armRef: React.RefObject<THREE.Mesh>;
  handRef?: React.RefObject<THREE.Mesh>;
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
      <Sphere ref={handRef} args={[GEOMETRY.hand.radius, 16, 16]} position={handPos}>
        <meshStandardMaterial {...MATERIALS.handFoot} />
      </Sphere>
    </>
  );
};

const Leg = ({ side, footRef }: { side: 'left' | 'right'; footRef?: React.RefObject<THREE.Mesh> }) => {
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
      <Sphere ref={footRef} args={[GEOMETRY.foot.radius, 16, 16]} position={footPos}>
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

const EarSensor = ({ position, isActive, isUserTyping }: { position: [number, number, number]; isActive: boolean; isUserTyping?: boolean }) => {
  const groupRef = useRef<THREE.Group>(null);
  const sensorOffset = position[0] < 0 ? -0.05 : 0.05;
  const sensorColor = isActive ? COLORS.status : COLORS.primary;
  const glowIntensity = isActive ? 0.6 : 0.15;
  
  useFrame((state) => {
    if (groupRef.current && isUserTyping) {
      // Subtle wiggle when user is typing (detecting sound)
      const wiggle = Math.sin(state.clock.elapsedTime * 8) * 0.03;
      groupRef.current.rotation.y = wiggle;
    } else if (groupRef.current) {
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y, 0, 0.1
      );
    }
  });
  
  return (
    <group ref={groupRef} position={position}>
      <Cylinder args={[0.06, 0.06, 0.08, 16]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color={COLORS.purpleLight} metalness={0.2} roughness={0.3} />
      </Cylinder>
      <Sphere args={[0.02, 12, 12]} position={[sensorOffset, 0, 0]}>
        <meshStandardMaterial
          color={sensorColor}
          emissive={sensorColor}
          emissiveIntensity={glowIntensity}
        />
      </Sphere>
    </group>
  );
};

// ═══════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════

export const Robot3D: React.FC<Robot3DProps> = ({ 
  isActive = false,
  dragVelocity,
  mousePos,
  isUserTyping = false,
  isThinking = false,
  justOpened = false,
  lastMessageReceived = 0
}) => {
  const robotRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);
  const headRef = useRef<THREE.Mesh>(null);
  const leftEyeRef = useRef<THREE.Group>(null);
  const rightEyeRef = useRef<THREE.Group>(null);
  const checkmarkRef = useRef<THREE.Group>(null);
  const antennaRef = useRef<THREE.Mesh>(null);
  const ledBarRef = useRef<THREE.Mesh>(null);
  const smileRef = useRef<THREE.Mesh>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);
  const leftHandRef = useRef<THREE.Mesh>(null);
  const rightHandRef = useRef<THREE.Mesh>(null);
  const chestDisplayRef = useRef<THREE.Mesh>(null);
  const antennaGroupRef = useRef<THREE.Group>(null);
  const leftFootRef = useRef<THREE.Mesh>(null);
  const rightFootRef = useRef<THREE.Mesh>(null);
  const leftArmGroupRef = useRef<THREE.Group>(null);
  const rightArmGroupRef = useRef<THREE.Group>(null);
  
  // Physics state for antenna pendulum effect
  const antennaSwing = useRef({ x: 0, z: 0 });
  const antennaVelocity = useRef({ x: 0, z: 0 });
  
  // Idle curiosity state tracking
  const idleTimer = useRef(0);
  const curiosityTarget = useRef({ x: 0, y: 0 });
  
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

    // ═══════════════════════════════════════════════
    // CONTEXTUAL ANIMATIONS
    // ═══════════════════════════════════════════════
    
    // Wave animation on chat open (eerste 1.5 seconden)
    const waveOffset = justOpened && time < 1.5 ? Math.sin(time * 8) * 0.15 : 0;
    if (rightHandRef.current) {
      const baseY = GEOMETRY.hand.position.right[1];
      rightHandRef.current.position.y = baseY + waveOffset;
    }

    // Acknowledgment nod animation
    const timeSinceMessage = (Date.now() - lastMessageReceived) / 1000;
    const nodOffset = timeSinceMessage < 0.3 ? Math.sin(timeSinceMessage * Math.PI * 3) * -0.05 : 0;

    // ═══════════════════════════════════════════════
    // NATURAL MOTION VARIABLES
    // ═══════════════════════════════════════════════
    
    // Subtle breathing effect (0.8% variation at 0.8Hz resting rate)
    const breathe = 1 + Math.sin(time * 0.8) * 0.008;
    
    // Idle eye saccades - small random eye movements when not focused
    const saccadeX = Math.sin(time * 2.3) * 0.005 + Math.sin(time * 5.7) * 0.003;
    const saccadeY = Math.cos(time * 1.8) * 0.004 + Math.cos(time * 4.2) * 0.002;
    
    // Head tilt logic based on state
    let listenTilt = 0;
    if (isUserTyping) {
      // Listening pose: 5° left tilt
      listenTilt = -0.087; // -5 degrees
    } else if (isThinking) {
      // Thinking pose: slight upward contemplative tilt
      listenTilt = Math.sin(time * 0.5) * 0.035;
    } else if (isActive) {
      // Normal active subtle movement
      listenTilt = Math.sin(time * 0.5) * 0.052;
    }

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

    // Head follows cursor with variable easing and contextual positioning
    if (headRef.current) {
      let targetX = listenTilt;
      let targetY = 0;

      // Different head behavior based on context
      if (isUserTyping) {
        // Direct attention forward when listening
        targetX = -0.087 + nodOffset; // 5° left + nod
        targetY = 0;
      } else if (isThinking) {
        // Contemplative upward gaze with slow eye movement
        targetX = 0.035 + nodOffset;
        targetY = Math.sin(time * 0.3) * 0.03;
      } else if (mousePos) {
        // Normal cursor tracking
        targetX = mousePos.y * -0.05 + listenTilt + nodOffset;
        targetY = mousePos.x * 0.08;
      } else {
        targetX = listenTilt + nodOffset;
      }
      
      // Slower head movement (lerp 0.08)
      const headTiltX = THREE.MathUtils.lerp(headRef.current.rotation.x, targetX, 0.08);
      const headTiltY = THREE.MathUtils.lerp(headRef.current.rotation.y, targetY, 0.08);
      headRef.current.rotation.x = headTiltX;
      headRef.current.rotation.y = headTiltY;
    }

    // Eye tracking with contextual behavior
    if (leftEyeRef.current && rightEyeRef.current) {
      const maxOffset = 0.03;
      
      // Contextual eye behavior
      if (isUserTyping) {
        // Direct eye contact when listening (focused attention)
        targetEyePos.current.x = 0;
        targetEyePos.current.y = 0;
      } else if (isThinking) {
        // Slow contemplative eye movement when thinking
        targetEyePos.current.x = Math.sin(time * 0.5) * 0.02;
        targetEyePos.current.y = 0.01;
      } else if (mousePos) {
        // Normal cursor tracking
        targetEyePos.current.x = THREE.MathUtils.clamp(mousePos.x * 0.04, -maxOffset, maxOffset);
        targetEyePos.current.y = THREE.MathUtils.clamp(mousePos.y * 0.02, -maxOffset * 0.5, maxOffset * 0.5);
      } else {
        // Idle saccades when no activity
        targetEyePos.current.x = saccadeX;
        targetEyePos.current.y = saccadeY;
      }
      
      // Faster eye movement (lerp 0.15 for quick, natural eye response)
      currentEyePos.current.x = THREE.MathUtils.lerp(currentEyePos.current.x, targetEyePos.current.x, 0.15);
      currentEyePos.current.y = THREE.MathUtils.lerp(currentEyePos.current.y, targetEyePos.current.y, 0.15);
      
      leftEyeRef.current.position.set(-0.16 + currentEyePos.current.x, 0.60 + currentEyePos.current.y, 0.50);
      rightEyeRef.current.position.set(0.16 + currentEyePos.current.x, 0.60 + currentEyePos.current.y, 0.50);
      
      // Pupil dilation - larger when listening (interest)
      let eyeDilation = 1.0;
      if (isUserTyping) {
        eyeDilation = 1.08; // 8% larger when listening
      } else if (isActive) {
        eyeDilation = 1.1; // 10% larger when active
      }
      
      const currentDilation = THREE.MathUtils.lerp(
        leftEyeRef.current.scale.x, 
        eyeDilation, 
        0.1
      );
      
      // Only apply dilation when not blinking
      if (!isBlinking.current) {
        leftEyeRef.current.scale.set(currentDilation, currentDilation, currentDilation);
        rightEyeRef.current.scale.set(currentDilation, currentDilation, currentDilation);
      }
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
        // Pupil dilation maintained during blink
        const eyeDilation = isActive ? 1.1 : 1.0;
        leftEyeRef.current.scale.set(eyeDilation, blinkScale * eyeDilation, eyeDilation);
        rightEyeRef.current.scale.set(eyeDilation, blinkScale * eyeDilation, eyeDilation);
      }
    }

    // Smile animation with subtle tremor when active
    if (smileRef.current) {
      const tremor = isActive ? 1 + Math.sin(time * 12) * 0.02 : 1;
      const targetSmileScale = isActive ? 1.15 * tremor : 1.0;
      smileRef.current.scale.x = THREE.MathUtils.lerp(smileRef.current.scale.x, targetSmileScale, 0.1);
    }
    
    // Subtle breathing on body
    if (bodyRef.current) {
      // Very slow body movement (lerp 0.03 for heavy, stable feel)
      const currentBreathing = THREE.MathUtils.lerp(bodyRef.current.scale.y, breathe, 0.03);
      bodyRef.current.scale.set(1, currentBreathing, 1);
    }

    // ═══════════════════════════════════════════════
    // ANTENNA PENDULUM PHYSICS
    // ═══════════════════════════════════════════════
    if (antennaGroupRef.current) {
      const spring = 8;       // Stiffness (how fast to spring back)
      const damping = 0.85;   // Damping (how fast to stop)
      
      // External force from drag movement (opposite direction = inertia)
      if (dragVelocity) {
        antennaVelocity.current.x -= dragVelocity.x * 0.15;
        antennaVelocity.current.z -= dragVelocity.y * 0.1;
      }
      
      // Spring force - pulls back to center
      antennaVelocity.current.x += -antennaSwing.current.x * spring * delta;
      antennaVelocity.current.z += -antennaSwing.current.z * spring * delta;
      
      // Damping - slows down movement
      antennaVelocity.current.x *= damping;
      antennaVelocity.current.z *= damping;
      
      // Update position
      antennaSwing.current.x += antennaVelocity.current.x * delta;
      antennaSwing.current.z += antennaVelocity.current.z * delta;
      
      // Clamp maximum swing (prevent extreme bending)
      const maxSwing = 0.3; // ~17 degrees max
      antennaSwing.current.x = THREE.MathUtils.clamp(antennaSwing.current.x, -maxSwing, maxSwing);
      antennaSwing.current.z = THREE.MathUtils.clamp(antennaSwing.current.z, -maxSwing, maxSwing);
      
      // Apply rotation to antenna group (bends from base)
      antennaGroupRef.current.rotation.x = antennaSwing.current.z;
      antennaGroupRef.current.rotation.z = -antennaSwing.current.x;
    }

    // ═══════════════════════════════════════════════
    // ARM IDLE SWING (synchronized with breathing)
    // ═══════════════════════════════════════════════
    if (leftArmGroupRef.current && rightArmGroupRef.current) {
      const armSwing = Math.sin(time * 0.8) * 0.02;
      leftArmGroupRef.current.rotation.z = 0.1 + armSwing;
      rightArmGroupRef.current.rotation.z = -0.1 - armSwing;
    }

    // ═══════════════════════════════════════════════
    // BODY LEAN DURING LISTENING/THINKING
    // ═══════════════════════════════════════════════
    let bodyLean = 0;
    if (isUserTyping) {
      bodyLean = 0.03; // Forward lean (engaged)
    } else if (isThinking) {
      bodyLean = -0.02; // Slight back lean (contemplative)
    }
    
    if (bodyRef.current) {
      const currentLean = bodyRef.current.rotation.x;
      bodyRef.current.rotation.x = THREE.MathUtils.lerp(currentLean, bodyLean, 0.05);
    }

    // ═══════════════════════════════════════════════
    // IDLE CURIOSITY (looking around when inactive)
    // ═══════════════════════════════════════════════
    if (!isActive && !isUserTyping && !mousePos) {
      idleTimer.current += delta;
      
      // Every 4-6 seconds, pick new random look direction
      if (idleTimer.current > 4 + Math.random() * 2) {
        curiosityTarget.current = {
          x: (Math.random() - 0.5) * 0.15,
          y: (Math.random() - 0.5) * 0.1
        };
        idleTimer.current = 0;
      }
      
      // Apply curiosity look to eyes
      targetEyePos.current.x = curiosityTarget.current.x;
      targetEyePos.current.y = curiosityTarget.current.y;
    } else {
      idleTimer.current = 0;
    }

    // ═══════════════════════════════════════════════
    // RESPONSE ANTICIPATION (when AI is thinking)
    // ═══════════════════════════════════════════════
    if (isThinking && robotRef.current) {
      // Small excited bounce
      const anticipationBounce = Math.abs(Math.sin(time * 3)) * 0.005;
      robotRef.current.position.y = anticipationBounce;
    } else if (robotRef.current) {
      robotRef.current.position.y = THREE.MathUtils.lerp(
        robotRef.current.position.y, 
        0, 
        0.1
      );
    }

    // ═══════════════════════════════════════════════
    // WEIGHT SHIFTING (subtle foot movements)
    // ═══════════════════════════════════════════════
    if (leftFootRef.current && rightFootRef.current) {
      const weightShift = Math.sin(time * 0.12) * 0.008;
      leftFootRef.current.position.y = GEOMETRY.foot.position.left[1] + weightShift;
      rightFootRef.current.position.y = GEOMETRY.foot.position.right[1] - weightShift;
    }

    // ═══════════════════════════════════════════════
    // ALERT MICRO-MOVEMENTS (when inactive but ready)
    // ═══════════════════════════════════════════════
    if (!isActive && !isUserTyping && !isThinking && headRef.current) {
      const microX = Math.sin(time * 0.3) * 0.01 + Math.sin(time * 0.7) * 0.005;
      const microY = Math.cos(time * 0.2) * 0.008;
      
      headRef.current.rotation.x += microX;
      headRef.current.rotation.y += microY;
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

    // LED bar pulse - faster when thinking
    if (ledBarRef.current) {
      const material = ledBarRef.current.material as THREE.MeshStandardMaterial;
      if (isThinking) {
        material.emissiveIntensity = 0.5 + Math.sin(time * 5) * 0.4;
      } else if (isActive) {
        material.emissiveIntensity = 0.4 + Math.sin(time * 3) * 0.3;
      } else {
        material.emissiveIntensity = 0.2;
      }
    }
  });

  return (
    <group ref={robotRef} scale={1.15}>
      {/* ═══════════════════════════════════════════════ */}
      {/* HEAD SECTION */}
      {/* ═══════════════════════════════════════════════ */}
      
      {/* Rim highlight for glass effect */}
      <Sphere args={[GEOMETRY.head.radius - 0.02, 48, 48]} position={GEOMETRY.head.position}>
        <meshStandardMaterial 
          color={COLORS.rimHighlight}
          transparent
          opacity={0.3}
          side={THREE.BackSide}
        />
      </Sphere>
      
      <Sphere ref={headRef} args={[GEOMETRY.head.radius, GEOMETRY.head.segments, GEOMETRY.head.segments]} position={GEOMETRY.head.position}>
        <meshPhysicalMaterial {...MATERIALS.bodyPhysical} envMapIntensity={1} />
      </Sphere>

      <EarSensor position={[-0.53, 0.55, 0]} isActive={isActive} isUserTyping={isUserTyping} />
      <EarSensor position={[0.53, 0.55, 0]} isActive={isActive} isUserTyping={isUserTyping} />

      <Eye position={GEOMETRY.eye.position.left} eyeRef={leftEyeRef} />
      <Eye position={GEOMETRY.eye.position.right} eyeRef={rightEyeRef} />

      <Cylinder ref={ledBarRef} args={[0.012, 0.012, 0.22, 4]} position={[0, 0.32, 0.48]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color={COLORS.primary} emissive={COLORS.glow} emissiveIntensity={0.4} />
      </Cylinder>

      <Torus 
        ref={smileRef} 
        args={isUserTyping ? [0.13, 0.024, 16, 32, Math.PI * 1.1] : [0.12, 0.022, 16, 32, Math.PI]} 
        position={[0, 0.36, 0.52]} 
        rotation={[0, 0, Math.PI]}
      >
        <meshStandardMaterial color={COLORS.smile} emissive={COLORS.smileGlow} emissiveIntensity={isUserTyping ? 0.8 : 0.5} />
      </Torus>

      <Sphere args={[0.04, 12, 12]} position={[0, 0.85, 0.47]}>
        <meshStandardMaterial color={COLORS.primary} emissive={COLORS.glow} emissiveIntensity={0.5} />
      </Sphere>

      {/* Antenna - STATUS INDICATOR with pendulum physics */}
      <group ref={antennaGroupRef} position={[0, 1.05, 0]}>
        <Cylinder args={[0.015, 0.015, 0.40, 4]} position={[0, 0.20, 0]}>
          <meshStandardMaterial color={COLORS.primary} metalness={0.8} roughness={0.2} />
        </Cylinder>
        <Sphere ref={antennaRef} args={[0.07, 16, 16]} position={[0, 0.42, 0]}>
          <meshStandardMaterial color={COLORS.status} emissive={COLORS.status} emissiveIntensity={isActive ? 3.0 : 0.2} />
        </Sphere>
        
        {/* PointLight voor groene gloed wanneer chat open */}
        {isActive && (
          <pointLight 
            position={[0, 0.42, 0]} 
            color={COLORS.status} 
            intensity={5} 
            distance={2}
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
              emissiveIntensity={2.0}
              transparent
              opacity={0.8}
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

      {/* Chest display frame with glow */}
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
      
      {/* Chest display glow panel */}
      <mesh ref={chestDisplayRef} position={[0, -0.18, 0.36]}>
        <planeGeometry args={[0.10, 0.08]} />
        <meshStandardMaterial 
          color="#F8FAFC"
          emissive={isActive ? COLORS.primary : "#F1F5F9"}
          emissiveIntensity={isActive ? 0.3 : 0}
          transparent
          opacity={0.95}
        />
      </mesh>

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

      <group ref={leftArmGroupRef}>
        <Arm side="left" armRef={leftArmRef} handRef={leftHandRef} />
      </group>
      <group ref={rightArmGroupRef}>
        <Arm side="right" armRef={rightArmRef} handRef={rightHandRef} />
      </group>

      <Leg side="left" footRef={leftFootRef} />
      <Leg side="right" footRef={rightFootRef} />
    </group>
  );
};
