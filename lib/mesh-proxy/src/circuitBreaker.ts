import { EventEmitter } from "events";
import { logger } from "./logger.js";

/**
 * Sentinel Mesh Sidecar — Fail-Closed Circuit Breaker
 *
 * States:
 *   CLOSED    — Redis governance connection healthy; traffic flows normally.
 *   OPEN      — Redis disconnected; ALL agent traffic is blocked (fail-closed).
 *   HALF_OPEN — Reconnection attempt in progress; traffic remains blocked
 *               until Redis confirms `ready`. This is intentionally stricter
 *               than a standard circuit breaker — no probe traffic is allowed
 *               through until the governance data plane is confirmed stable.
 *
 * Transitions:
 *   CLOSED    → OPEN      : Redis `error` or `close`
 *   OPEN      → HALF_OPEN : Redis `reconnecting`
 *   HALF_OPEN → CLOSED    : Redis `ready` (connection confirmed)
 *   HALF_OPEN → OPEN      : Redis `error` during probe window
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerEvents {
  open: () => void;
  half_open: () => void;
  closed: () => void;
}

export class CircuitBreaker extends EventEmitter {
  private _state: CircuitState = "CLOSED";

  get currentState(): CircuitState {
    return this._state;
  }

  /**
   * Returns true when the circuit is blocking traffic.
   * Both OPEN and HALF_OPEN block agent calls — fail-closed semantics.
   */
  isBlocking(): boolean {
    return this._state !== "CLOSED";
  }

  /**
   * Trip the breaker. Called when Redis loses connection.
   */
  trip(): void {
    if (this._state === "CLOSED" || this._state === "HALF_OPEN") {
      const prev = this._state;
      this._state = "OPEN";
      logger.error(
        { from: prev, to: "OPEN" },
        "circuit-breaker: TRIPPED — agent traffic suspended (fail-closed)",
      );
      this.emit("open");
    }
  }

  /**
   * Move to HALF_OPEN probe window. Called when Redis begins reconnecting.
   * Traffic stays blocked until close() is called.
   */
  halfOpen(): void {
    if (this._state === "OPEN") {
      this._state = "HALF_OPEN";
      logger.warn(
        { from: "OPEN", to: "HALF_OPEN" },
        "circuit-breaker: HALF_OPEN — probing governance connection",
      );
      this.emit("half_open");
    }
  }

  /**
   * Close the circuit. Called when Redis confirms `ready`.
   */
  close(): void {
    if (this._state !== "CLOSED") {
      const prev = this._state;
      this._state = "CLOSED";
      logger.info(
        { from: prev, to: "CLOSED" },
        "circuit-breaker: CLOSED — governance connection restored, traffic resumed",
      );
      this.emit("closed");
    }
  }

  // Typed emit/on overloads for IDE safety
  emit(event: "open" | "half_open" | "closed"): boolean {
    return super.emit(event);
  }

  on(event: "open" | "half_open" | "closed", listener: () => void): this {
    return super.on(event, listener);
  }
}
