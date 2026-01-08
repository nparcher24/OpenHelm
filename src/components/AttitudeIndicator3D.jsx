import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

// 3D Axis arrows that rotate with device orientation
function AxisArrows({ roll, pitch, yaw }) {
  const groupRef = useRef()

  // Update rotation each frame for smooth animation
  useFrame(() => {
    if (groupRef.current) {
      // Convert degrees to radians
      // Device axes: X (red) = render Y, Y (green) = render X, Z (blue) = render Z
      const rollRad = (roll || 0) * Math.PI / 180
      const pitchRad = (pitch || 0) * Math.PI / 180
      const yawRad = (yaw || 0) * Math.PI / 180

      // Swap roll/pitch to match swapped X/Y axes
      groupRef.current.rotation.set(rollRad, pitchRad, -yawRad, 'ZXY')
    }
  })

  const arrowLength = 2
  const arrowHeadLength = 0.4
  const arrowHeadWidth = 0.2

  return (
    <group ref={groupRef}>
      {/* X Axis - Red (Device X = render Y direction) */}
      <arrowHelper
        args={[
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(0, 0, 0),
          arrowLength,
          0xff4444,
          arrowHeadLength,
          arrowHeadWidth
        ]}
      />
      {/* Negative X */}
      <arrowHelper
        args={[
          new THREE.Vector3(0, -1, 0),
          new THREE.Vector3(0, 0, 0),
          arrowLength * 0.5,
          0x882222,
          arrowHeadLength * 0.5,
          arrowHeadWidth * 0.5
        ]}
      />

      {/* Y Axis - Green (Device Y = render X direction) */}
      <arrowHelper
        args={[
          new THREE.Vector3(1, 0, 0),
          new THREE.Vector3(0, 0, 0),
          arrowLength,
          0x44ff44,
          arrowHeadLength,
          arrowHeadWidth
        ]}
      />
      {/* Negative Y */}
      <arrowHelper
        args={[
          new THREE.Vector3(-1, 0, 0),
          new THREE.Vector3(0, 0, 0),
          arrowLength * 0.5,
          0x228822,
          arrowHeadLength * 0.5,
          arrowHeadWidth * 0.5
        ]}
      />

      {/* Z Axis - Blue (Up/Down) */}
      <arrowHelper
        args={[
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(0, 0, 0),
          arrowLength,
          0x4444ff,
          arrowHeadLength,
          arrowHeadWidth
        ]}
      />
      {/* Negative Z */}
      <arrowHelper
        args={[
          new THREE.Vector3(0, 0, -1),
          new THREE.Vector3(0, 0, 0),
          arrowLength * 0.5,
          0x222288,
          arrowHeadLength * 0.5,
          arrowHeadWidth * 0.5
        ]}
      />

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
export default function AttitudeIndicator3D({ roll, pitch, yaw }) {
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
        <AxisArrows roll={roll} pitch={pitch} yaw={yaw} />

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
