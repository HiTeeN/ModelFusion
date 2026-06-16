import { EventEmitter } from "node:events";
const emitter = new EventEmitter();
export function emitFusionProgress(event) {
    emitter.emit("progress", event);
}
export function subscribeToFusionProgress(listener) {
    emitter.on("progress", listener);
    return () => emitter.off("progress", listener);
}
export function getFusionProgressListenerCount() {
    return emitter.listenerCount("progress");
}
//# sourceMappingURL=progress-bus.js.map