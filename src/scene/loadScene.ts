// One shared import of the 3D chunk. Importing it also starts the model
// download (Ibm5100Scene preloads the GLB at module load).
let pending: Promise<typeof import("./SceneView")> | null = null;

export function loadScene() {
  pending ??= import("./SceneView");
  return pending;
}

/** Fetch the 3D chunk + model once the page is idle, before anyone clicks power. */
export function prefetchSceneWhenIdle() {
  const start = () => void loadScene().catch(() => (pending = null));
  // Safari has no requestIdleCallback
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(start, { timeout: 2500 });
  else setTimeout(start, 1200);
}
