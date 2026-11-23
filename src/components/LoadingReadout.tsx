import { useProgress } from "@react-three/drei";

/** Phosphor-style progress text while the 3D model streams in. */
export function LoadingReadout() {
  const { active, progress } = useProgress();
  if (!active && progress >= 100) return null;
  const pct = Math.round(progress);
  const bar = "#".repeat(Math.round(pct / 5)).padEnd(20, ".");
  return (
    <div className="loading-readout" role="status">
      <span>LOADING 5100 ........ {pct}%</span>
      <span>[{bar}]</span>
    </div>
  );
}
