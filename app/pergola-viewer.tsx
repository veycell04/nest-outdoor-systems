"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls, PerspectiveCamera } from "@react-three/drei";

type PergolaViewerProps = {
  product: string;
  width: number;
  depth: number;
  attached: boolean;
  roofOpen: number;
  color: string;
  lighting: boolean;
  screens: boolean;
  presentation?: "studio" | "overlay";
};

function Box({ position, scale, color, emissive }: { position: [number, number, number]; scale: [number, number, number]; color: string; emissive?: string }) {
  return <mesh position={position} scale={scale} castShadow receiveShadow><boxGeometry /><meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={emissive ? 2.2 : 0} roughness={0.36} metalness={0.72} /></mesh>;
}

export function PergolaModel({ product, width, depth, attached, roofOpen, color, lighting, screens, presentation = "studio" }: PergolaViewerProps) {
  const w = Math.min(8.4, Math.max(4.8, width / 2.25));
  const d = Math.min(7.2, Math.max(3.8, depth / 2.5));
  const h = 3.7;
  const beam = 0.24;
  const posts = attached ? [-w / 2, w / 2] : [-w / 2, w / 2, -w / 2, w / 2];
  const louverCount = Math.max(8, Math.round(d * 2.7));
  const louverAngle = (roofOpen / 100) * Math.PI * 0.42;

  if (product === "umbrella") return <group position={[0, .05, 0]}>
    {presentation === "studio" && <Box position={[0, 0, 0]} scale={[w + 4, .08, d + 4]} color="#d9d3c9" />}
    <mesh position={[0, 2.1, 0]} castShadow><cylinderGeometry args={[.1, .14, 4.1, 24]} /><meshStandardMaterial color={color} metalness={.75} roughness={.32} /></mesh>
    <mesh position={[0, 4.05, 0]} castShadow rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[Math.min(w, d) * .6, .85, 8, 1, true]} /><meshStandardMaterial color="#d8c5aa" side={2} roughness={.8} /></mesh>
    <ContactShadows position={[0, .05, 0]} opacity={.3} scale={18} blur={2.5} far={8} />
  </group>;

  if (product === "zip") return <group position={[0, .05, 0]}>
    {presentation === "studio" && <Box position={[0, 0, 0]} scale={[w + 4, .08, d + 4]} color="#d9d3c9" />}
    <Box position={[-w / 2, h / 2, 0]} scale={[beam, h, beam]} color={color} /><Box position={[w / 2, h / 2, 0]} scale={[beam, h, beam]} color={color} />
    <Box position={[0, h, 0]} scale={[w + beam, .34, .34]} color={color} />
    <mesh position={[0, h / 2, .02]} castShadow><planeGeometry args={[w - .32, h - .35]} /><meshStandardMaterial color="#676c69" transparent opacity={.68} roughness={1} /></mesh>
  </group>;

  if (product === "guillotine" || product === "solidroll") return <group position={[0, .05, 0]}>
    {presentation === "studio" && <Box position={[0, 0, 0]} scale={[w + 4, .08, d + 4]} color="#d9d3c9" />}
    <Box position={[-w / 2, h / 2, 0]} scale={[beam, h, beam]} color={color} />
    <Box position={[w / 2, h / 2, 0]} scale={[beam, h, beam]} color={color} />
    <Box position={[0, h, 0]} scale={[w + beam, .28, .28]} color={color} />
    <Box position={[0, .12, 0]} scale={[w + beam, .2, .28]} color={color} />
    {[.68, 1.72, 2.76].map((y, index) => <mesh key={y} position={[0, y, .01 + index * .025]} castShadow>
      <boxGeometry args={[w - .34, .94, .07]} />
      <meshPhysicalMaterial color="#a9d2d8" transparent opacity={.42} transmission={.7} roughness={.06} metalness={.05} />
    </mesh>)}
    {[1.18, 2.22].map((y) => <Box key={y} position={[0, y, .08]} scale={[w - .28, .08, .13]} color={color} />)}
  </group>;

  if (product === "sliding_glass") return <group position={[0, .05, 0]}>
    {presentation === "studio" && <Box position={[0, 0, 0]} scale={[w + 4, .08, d + 4]} color="#d9d3c9" />}
    <Box position={[-w / 2, h / 2, 0]} scale={[beam, h, beam]} color={color} />
    <Box position={[w / 2, h / 2, 0]} scale={[beam, h, beam]} color={color} />
    <Box position={[0, h, 0]} scale={[w + beam, .24, .28]} color={color} />
    <Box position={[0, .1, 0]} scale={[w + beam, .16, .3]} color={color} />
    {[-.375,-.125,.125,.375].map((offset, index) => <mesh key={offset} position={[offset * w, h / 2, index * .035]} castShadow>
      <boxGeometry args={[w / 4 - .09, h - .38, .055]} />
      <meshPhysicalMaterial color="#b6d7dc" transparent opacity={.38} transmission={.74} roughness={.05} />
    </mesh>)}
  </group>;

  if (product === "ceiling_zip") return <group position={[0, .05, 0]}>
    {presentation === "studio" && <Box position={[0, 0, 0]} scale={[w + 4, .08, d + 4]} color="#d9d3c9" />}
    {[[-w/2,d/2],[w/2,d/2],[-w/2,-d/2],[w/2,-d/2]].map(([x,z],i)=><Box key={i} position={[x,h/2,z]} scale={[beam,h,beam]} color={color}/>)}
    <Box position={[0,h,d/2]} scale={[w+beam,beam,beam]} color={color}/><Box position={[0,h,-d/2]} scale={[w+beam,beam,beam]} color={color}/>
    <Box position={[-w/2,h,0]} scale={[beam,beam,d]} color={color}/><Box position={[w/2,h,0]} scale={[beam,beam,d]} color={color}/>
    <mesh position={[0,h-.06,0]} castShadow><boxGeometry args={[w-.28,.07,d-.28]}/><meshStandardMaterial color="#d8c5aa" roughness={.9}/></mesh>
  </group>;

  if (product === "awning") return <group position={[0, .05, 0]}>
    {presentation === "studio" && <Box position={[0, 0, 0]} scale={[w + 4, .08, d + 4]} color="#d9d3c9" />}{presentation === "studio" && <Box position={[0, h / 2, -d / 2]} scale={[w + 1, h, .2]} color="#ddd7cc" />}
    <Box position={[0, h, -d / 2 + .12]} scale={[w, .34, .34]} color={color} />
    <mesh position={[0, h - .25, 0]} rotation={[-.08, 0, 0]} castShadow><boxGeometry args={[w, .06, d]} /><meshStandardMaterial color="#d8c5aa" roughness={.85} /></mesh>
    <Box position={[-w / 2 + .2, h - .65, 0]} scale={[.09, .09, d]} color={color} /><Box position={[w / 2 - .2, h - .65, 0]} scale={[.09, .09, d]} color={color} />
  </group>;

  return <group position={[0, 0.05, 0]}>
    {presentation === "studio" && <Box position={[0, 0, 0]} scale={[w + 4, .08, d + 4]} color="#d9d3c9" />}
    {posts.map((x, i) => {
      const z = attached ? d / 2 : (i < 2 ? d / 2 : -d / 2);
      return <Box key={`${x}-${i}`} position={[x, h / 2, z]} scale={[beam, h, beam]} color={color} />;
    })}
    {attached && presentation === "studio" && <Box position={[0, h / 2, -d / 2 - .13]} scale={[w + .5, h, .18]} color="#ddd7cc" />}
    <Box position={[0, h, d / 2]} scale={[w + beam, beam, beam]} color={color} />
    <Box position={[0, h, -d / 2]} scale={[w + beam, beam, beam]} color={color} />
    <Box position={[-w / 2, h, 0]} scale={[beam, beam, d]} color={color} />
    <Box position={[w / 2, h, 0]} scale={[beam, beam, d]} color={color} />
    {product === "bioclimatic" && Array.from({ length: louverCount }).map((_, i) => {
      const z = -d / 2 + ((i + .5) * d / louverCount);
      return <mesh key={i} position={[0, h - .03, z]} rotation={[louverAngle, 0, 0]} castShadow>
        <boxGeometry args={[w - .18, .1, d / louverCount * .82]} />
        <meshStandardMaterial color={color} roughness={.34} metalness={.75} />
      </mesh>;
    })}
    {product === "fabric" && <mesh position={[0, h - .04, 0]} castShadow><boxGeometry args={[w - .22, .08, d - .22]} /><meshStandardMaterial color="#d8c5aa" roughness={.88} /></mesh>}
    {product === "glass" && <mesh position={[0, h - .02, 0]} castShadow><boxGeometry args={[w - .22, .08, d - .22]} /><meshPhysicalMaterial color="#b9d3d3" transparent opacity={.38} transmission={.55} roughness={.08} /></mesh>}
    {lighting && <><Box position={[0, h - .16, d / 2 - .13]} scale={[w - .45, .035, .035]} color="#ffd2a0" emissive="#ffab62" /><Box position={[0, h - .16, -d / 2 + .13]} scale={[w - .45, .035, .035]} color="#ffd2a0" emissive="#ffab62" /></>}
    {screens && <><mesh position={[0, h / 2, d / 2 + .02]}><planeGeometry args={[w - .35, h - .35]} /><meshStandardMaterial color="#898d89" transparent opacity={.36} roughness={1} /></mesh><mesh position={[w / 2 + .02, h / 2, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[d - .3, h - .35]} /><meshStandardMaterial color="#898d89" transparent opacity={.36} roughness={1} /></mesh></>}
  </group>;
}

export function PergolaViewer(props: PergolaViewerProps) {
  return <div className="viewer" aria-label="Interactive 3D pergola preview">
    <div className="viewer-badge"><span /> LIVE 3D</div>
    <div className="viewer-help">Drag to rotate · Scroll to zoom</div>
    <Canvas shadows dpr={[1, 1.6]} gl={{ antialias: true }}>
      <color attach="background" args={["#e8e4dc"]} />
      <PerspectiveCamera makeDefault position={[9.8, 7.8, 10.5]} fov={36} />
      <ambientLight intensity={1.15} />
      <directionalLight position={[4, 10, 7]} intensity={2.8} castShadow shadow-mapSize={[1024, 1024]} />
      <PergolaModel {...props} />
      <ContactShadows position={[0, .05, 0]} opacity={.3} scale={18} blur={2.5} far={8} />
      <Environment preset="city" />
      <OrbitControls enablePan={false} minDistance={8} maxDistance={22} minPolarAngle={.55} maxPolarAngle={1.45} target={[0, 1.8, 0]} />
    </Canvas>
  </div>;
}
