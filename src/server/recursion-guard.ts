/**
 * RecursionGuard — prevents nested/recursive fusion calls within a session.
 * Single level only (MAX_DEPTH = 1). In-memory Map, no persistence across sessions.
 */

export class RecursionGuard {
  /** Maximum allowed recursion depth — single level only */
  static readonly MAX_DEPTH = 1;

  /** In-memory session state — never persisted */
  private activeSessions: Map<string, boolean>;

  constructor() {
    this.activeSessions = new Map();
  }

  /**
   * Check if a session currently has an active fusion call.
   * @param sessionID — unique session identifier
   */
  isFusionActive(sessionID: string): boolean {
    return this.activeSessions.get(sessionID) === true;
  }

  /**
   * Mark a session as having an active fusion call.
   * @returns `true` if activation succeeded, `false` if already active (double activation blocked)
   */
  markFusionActive(sessionID: string): boolean {
    if (this.isFusionActive(sessionID)) {
      return false;
    }
    this.activeSessions.set(sessionID, true);
    return true;
  }

  /**
   * Clear the active fusion flag for a session.
   */
  markFusionComplete(sessionID: string): void {
    this.activeSessions.set(sessionID, false);
  }

  /**
   * Get the current recursion depth for a session.
   * @returns 1 if active, 0 if not
   */
  getDepth(sessionID: string): number {
    return this.isFusionActive(sessionID) ? 1 : 0;
  }
}