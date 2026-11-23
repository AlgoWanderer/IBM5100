import { Component, type ReactNode } from "react";

/** Keeps a 3D/WebGL crash inside the TV screen instead of blanking the page. */
export class SceneErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="loading-readout" role="alert" style={{ whiteSpace: "normal", textAlign: "center", padding: "0 10%" }}>
        <span>?SIGNAL LOST</span>
        <span style={{ fontSize: "0.7em", opacity: 0.75 }}>{this.state.error.message}</span>
        <span style={{ fontSize: "0.7em", opacity: 0.75 }}>TRY ?nofx IN THE ADDRESS BAR, OR RELOAD.</span>
      </div>
    );
  }
}
