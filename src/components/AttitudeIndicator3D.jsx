import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

const BASE_LENGTH = 2
const HEAD_LENGTH = 0.4
const HEAD_WIDTH = 0.2
const MAX_ACCEL_G = 0.4 // Clamp at 0.4g for arrow scaling

// Compute arrow length from acceleration magnitude using exponential scaling
// At 0g: 2 units, at 0.1g: 4 units, at 0.2g: 8 units, at 0.3g: 16 units, at 0.4g+: 32 units
function accelToLength(accelG) {
  const clamped = Math.min(Math.abs(accelG), MAX_ACCEL_G)
  return BASE_LENGTH * Math.pow(2, clamped / 0.1)
}

// 3D Axis arrows that rotate with device orientation
// Arrow lengths driven by earth-frame acceleration (gravity removed)
function AxisArrows({ roll, pitch, yaw, ax, ay, az }) {
  const groupRef = useRef()

  // Create arrow helpers imperatively so we can call setLength() in useFrame
  const arrows = useMemo(() => {
    const origin = new THREE.Vector3(0, 0, 0)
    return {
      // Positive arrows (Device X=red=renderY, Device Y=green=renderX, Device Z=blue=renderZ)
      xPos: new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), origin, BASE_LENGTH, 0xff4444, HEAD_LENGTH, HEAD_WIDTH),
      xNeg: new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), origin, BASE_LENGTH * 0.5, 0x882222, HEAD_LENGTH * 0.5, HEAD_WIDTH * 0.5),
      yPos: new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, BASE_LENGTH, 0x44ff44, HEAD_LENGTH, HEAD_WIDTH),
      yNeg: new THREE.ArrowHelper(new THREE.Vector3(-1, 0, 0), origin, BASE_LENGTH * 0.5, 0x228822, HEAD_LENGTH * 0.5, HEAD_WIDTH * 0.5),
      zPos: new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), origin, BASE_LENGTH, 0x4444ff, HEAD_LENGTH, HEAD_WIDTH),
      zNeg: new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), origin, BASE_LENGTH * 0.5, 0x222288, HEAD_LENGTH * 0.5, HEAD_WIDTH * 0.5),
    }
  }, [])

  // Update rotation and arrow lengths each frame
  useFrame(() => {
    if (!groupRef.current) return

    // Convert degrees to radians
    const rollRad = (roll || 0) * Math.PI / 180
    const pitchRad = (pitch || 0) * Math.PI / 180
    const yawRad = (yaw || 0) * Math.PI / 180

    // Swap roll/pitch to match swapped X/Y axes
    groupRef.current.rotation.set(rollRad, pitchRad, -yawRad, 'ZXY')

    // Build rotation matrix from roll/pitch, then INVERT to get body→earth transform
    // The Euler angles describe earth→body rotation; we need the inverse
    const euler = new THREE.Euler(rollRad, pitchRad, 0, 'ZXY')
    const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(euler)
    rotMatrix.invert() // body→earth
    const bodyAccel = new THREE.Vector3(ax || 0, ay || 0, az || 0)
    const earthAccel = bodyAccel.applyMatrix4(rotMatrix)

    // Subtract gravity from Z (sensor reads ~1g on Z when stationary)
    earthAccel.z -= 1.0

    // Dead zone: sensor noise < 0.03g should not cause visible arrow differences
    const DEAD_ZONE = 0.03
    const ex = Math.abs(earthAccel.x) < DEAD_ZONE ? 0 : earthAccel.x
    const ey = Math.abs(earthAccel.y) < DEAD_ZONE ? 0 : earthAccel.y
    const ez = Math.abs(earthAccel.z) < DEAD_ZONE ? 0 : earthAccel.z

    // Compute per-axis arrow lengths from earth-frame net acceleration
    // Device X maps to render Y, Device Y maps to render X
    const xLen = accelToLength(ey) // device X -> render Y
    const yLen = accelToLength(ex) // device Y -> render X
    const zLen = accelToLength(ez)

    // Update positive arrows
    arrows.xPos.setLength(xLen, Math.min(HEAD_LENGTH, xLen * 0.2), HEAD_WIDTH)
    arrows.yPos.setLength(yLen, Math.min(HEAD_LENGTH, yLen * 0.2), HEAD_WIDTH)
    arrows.zPos.setLength(zLen, Math.min(HEAD_LENGTH, zLen * 0.2), HEAD_WIDTH)

    // Update negative arrows (proportional, half-length)
    arrows.xNeg.setLength(xLen * 0.5, Math.min(HEAD_LENGTH * 0.5, xLen * 0.1), HEAD_WIDTH * 0.5)
    arrows.yNeg.setLength(yLen * 0.5, Math.min(HEAD_LENGTH * 0.5, yLen * 0.1), HEAD_WIDTH * 0.5)
    arrows.zNeg.setLength(zLen * 0.5, Math.min(HEAD_LENGTH * 0.5, zLen * 0.1), HEAD_WIDTH * 0.5)
  })

  return (
    <group ref={groupRef}>
      <primitive object={arrows.xPos} />
      <primitive object={arrows.xNeg} />
      <primitive object={arrows.yPos} />
      <primitive object={arrows.yNeg} />
      <primitive object={arrows.zPos} />
      <primitive object={arrows.zNeg} />

      {/* Device body representation - flat box */}
      <mesh>
        <boxGeometry args={[1, 1.5, 0.15]} />
        <meshStandardMaterial color="#333333" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Forward indicator on device (X axis = red = render Y direction) */}
      <mesh position={[0, 0.5, 0.1]}>
        <coneGeometry args={[0.15, 0.3, 8]} />
        <meshStandardMaterial color="#ff4444" />
      </mesh>
    </group>
  )
}

// Reference grid showing horizon (XY plane with Z up)
function ReferenceGrid() {
  return (
    <group>
      {/* Horizon plane grid - rotate to XY plane since gridHelper defaults to XZ */}
      <gridHelper args={[8, 8, 0x00ff00, 0x004400]} rotation={[Math.PI / 2, 0, 0]} />

      {/* Cardinal direction markers on XY plane */}
      <mesh position={[0, 4, 0]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, -4, 0]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color="#880000" />
      </mesh>
      <mesh position={[4, 0, 0]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color="#008800" />
      </mesh>
      <mesh position={[-4, 0, 0]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color="#004400" />
      </mesh>
    </group>
  )
}

// Main 3D attitude indicator component
export default function AttitudeIndicator3D({ roll, pitch, yaw, ax, ay, az }) {
  return (
    <div className="w-full h-full bg-black rounded-lg overflow-hidden">
      <Canvas
        camera={{ position: [5, 2, 3], fov: 50, up: [0, 0, 1] }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
      >
        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <directionalLight position={[-5, -5, -5]} intensity={0.3} />

        {/* Background color */}
        <color attach="background" args={['#0a0a0a']} />

        {/* Reference grid (stationary) */}
        <ReferenceGrid />

        {/* Rotating axis arrows */}
        <AxisArrows roll={roll} pitch={pitch} yaw={yaw} ax={ax} ay={ay} az={az} />

        {/* Allow user to orbit/zoom */}
        <OrbitControls
          enablePan={false}
          minDistance={3}
          maxDistance={10}
          enableDamping
          dampingFactor={0.1}
          makeDefault
        />
      </Canvas>
    </div>
  )
}
