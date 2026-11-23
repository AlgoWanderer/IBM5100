import { Suspense, type ComponentProps } from "react";
import { Canvas } from "@react-three/fiber";
import { LoadingReadout } from "../components/LoadingReadout";
import { Ibm5100Scene } from "./Ibm5100Scene";

type Props = ComponentProps<typeof Ibm5100Scene> & { running: boolean };

/**
 * Everything 3D: three.js, the model and the CRT shader. App loads this
 * module lazily, so the first paint only needs React and the power button.
 */
export default function SceneView({ running, ...sceneProps }: Props) {
  return (
    <>
      <Canvas
        className="scene-canvas"
        dpr={[1, 1.75]}
        frameloop={running ? "always" : "never"}
        // measure layout size, not the transformed size: the power-on
        // animation scales the screen to a dot, which would stick
        resize={{ offsetSize: true }}
        camera={{ fov: 34, near: 0.05, far: 30, position: [-0.06, 1.42, 1.95] }}
        gl={{ antialias: false, powerPreference: "high-performance" }}
      >
        <Suspense fallback={null}>
          <Ibm5100Scene {...sceneProps} />
        </Suspense>
      </Canvas>
      <LoadingReadout />
    </>
  );
}
