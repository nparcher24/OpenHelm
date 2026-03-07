import { useRef, useMemo, useEffect, memo } from 'react'
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

// Lerp factor per frame (~60fps). Higher = snappier, lower = smoother.
// 0.15 at 60fps gives ~90% convergence in ~15 frames (~250ms)
const LERP_FACTOR = 0.15

// Lerp for angles in degrees, handling wraparound (e.g. 359° → 1°)
function lerpAngle(current, target, t) {
  let diff = target - current
  // Normalize to [-180, 180]
  while (diff > 180) diff -= 360
  while (diff < -180) diff += 360
  return current + diff * t
}

// 3D Axis arrows that rotate with device orientation
// Arrow lengths driven by earth-frame acceleration (gravity removed)
// Reads target values from dataRef and lerps smoothly each frame
function AxisArrows({ dataRef }) {
  const groupRef = useRef()
  // Current smoothed values (updated each frame, never cause re-renders)
  const smoothed = useRef({ roll: 0, pitch: 0, yaw: 0, ax: 0, ay: 0, az: 0 })

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

  // Reusable Three.js objects to avoid GC pressure in useFrame
  const _euler = useMemo(() => new THREE.Euler(), [])
  const _mat4 = useMemo(() => new THREE.Matrix4(), [])
  const _vec3 = useMemo(() => new THREE.Vector3(), [])

  // Update rotation and arrow lengths each frame with lerp interpolation
  useFrame(() => {
    if (!groupRef.current) return
    const data = dataRef.current
    const s = smoothed.current
    const t = LERP_FACTOR

    // Lerp toward target values
    s.roll = lerpAngle(s.roll, data.roll, t)
    s.pitch = lerpAngle(s.pitch, data.pitch, t)
    s.yaw = lerpAngle(s.yaw, data.yaw, t)
    s.ax = s.ax + (data.ax - s.ax) * t
    s.ay = s.ay + (data.ay - s.ay) * t
    s.az = s.az + (data.az - s.az) * t

    // Convert degrees to radians
    const rollRad = s.roll * Math.PI / 180
    const pitchRad = s.pitch * Math.PI / 180
    const yawRad = s.yaw * Math.PI / 180

    // Swap roll/pitch to match swapped X/Y axes
    groupRef.current.rotation.set(rollRad, pitchRad, -yawRad, 'ZXY')

    // Build rotation matrix from roll/pitch, then INVERT to get body→earth transform
    // The Euler angles describe earth→body rotation; we need the inverse
    _euler.set(rollRad, pitchRad, 0, 'ZXY')
    _mat4.makeRotationFromEuler(_euler)
    _mat4.invert() // body→earth
    _vec3.set(s.ax, s.ay, s.az)
    _vec3.applyMatrix4(_mat4)

    // Subtract gravity from Z (sensor reads ~1g on Z when stationary)
    _vec3.z -= 1.0

    // Dead zone: sensor noise < 0.03g should not cause visible arrow differences
    const DEAD_ZONE = 0.03
    const ex = Math.abs(_vec3.x) < DEAD_ZONE ? 0 : _vec3.x
    const ey = Math.abs(_vec3.y) < DEAD_ZONE ? 0 : _vec3.y
    const ez = Math.abs(_vec3.z) < DEAD_ZONE ? 0 : _vec3.z

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
// Memoized so it only renders once — all updates flow through the dataRef
export default memo(function AttitudeIndicator3D({ roll, pitch, yaw, ax, ay, az }) {
  // Store latest sensor values in a ref — useFrame reads this, no re-renders
  const dataRef = useRef({ roll: 0, pitch: 0, yaw: 0, ax: 0, ay: 0, az: 0 })

  // Update ref on every prop change without triggering re-render of Canvas
  useEffect(() => {
    dataRef.current = {
      roll: roll || 0,
      pitch: pitch || 0,
      yaw: yaw || 0,
      ax: ax || 0,
      ay: ay || 0,
      az: az || 0,
    }
  })

  return (
    <div className="w-full h-full bg-black rounded-lg overflow-hidden">
      <Canvas
        camera={{ position: [5, 2, 3], fov: 50, up: [0, 0, 1] }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
        frameloop="always"
      >
        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <directionalLight position={[-5, -5, -5]} intensity={0.3} />

        {/* Background color */}
        <color attach="background" args={['#0a0a0a']} />

        {/* Reference grid (stationary) */}
        <ReferenceGrid />

        {/* Rotating axis arrows - reads from ref, no prop-driven re-renders */}
        <AxisArrows dataRef={dataRef} />

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
})
