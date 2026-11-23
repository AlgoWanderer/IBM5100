/** Tiny pub/sub so global keyboard events can reach the 3D keys. */
type KeyListener = (code: string, down: boolean) => void;

export class KeyBus {
  private listeners = new Set<KeyListener>();
  private held = new Set<string>();

  on(fn: KeyListener) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  emit(code: string, down: boolean) {
    if (down) this.held.add(code);
    else this.held.delete(code);
    this.listeners.forEach((fn) => fn(code, down));
  }

  releaseAll() {
    [...this.held].forEach((c) => this.emit(c, false));
  }
}
