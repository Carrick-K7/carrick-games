export interface HudEmphasisInput {
  /** Simulation clock in seconds; paused draws must pass the same value. */
  clock: number;
  location: string;
  /** Empty means unscoped; otherwise identify the current zoom caption. */
  scopeKey: string;
  sessionKey?: string;
  /** Omission means alive. */
  alive?: boolean;
}

export interface HudEmphasisFlags {
  location: boolean;
  scope: boolean;
}

const INITIAL_SECONDS = 2;
const LOCATION_SECONDS = 2.2;
const SCOPE_SECONDS = 1.6;

/**
 * Per-HUD caption emphasis only: never use these flags to hide interactive controls.
 * Stores presentation identities and deadlines, not gameplay state or events.
 *
 * Unchanged snapshots never extend deadlines, including repeated paused draws.
 * A clock rewind or session-key change starts a fresh presentation session.
 * NaN/Infinity freeze the last finite timing/snapshot; empty captions and scope-off
 * still hide immediately. Transitions during invalid time are sampled
 * on the next finite update. Before any finite update, eligible captions remain
 * visible; the first finite update starts their full initial windows. There is
 * deliberately no wall-clock fallback, so missing time cannot poison deadlines.
 */
export class HudEmphasis {
  private previous?: HudEmphasisInput;
  private locationUntil = 0;
  private scopeUntil = 0;

  reset(): void {
    this.previous = undefined;
    this.locationUntil = 0;
    this.scopeUntil = 0;
  }

  update(input: HudEmphasisInput): HudEmphasisFlags {
    const { clock, location, scopeKey, sessionKey } = input;
    const alive = input.alive !== false;

    if (!Number.isFinite(clock)) {
      const previousClock = this.previous?.clock;
      return {
        location: location !== '' && (previousClock === undefined || previousClock < this.locationUntil),
        scope: scopeKey !== '' && (previousClock === undefined || previousClock < this.scopeUntil),
      };
    }

    if (this.previous && (clock < this.previous.clock || sessionKey !== this.previous.sessionKey)) {
      this.reset();
    }
    const previous = this.previous;
    const initial = !previous;
    const respawn = previous?.alive === false && alive;

    if (initial || respawn) {
      this.locationUntil = clock + INITIAL_SECONDS;
    } else if (location !== previous.location) {
      this.locationUntil = clock + LOCATION_SECONDS;
    }
    if (initial || scopeKey !== previous.scopeKey) {
      this.scopeUntil = scopeKey === '' ? clock : clock + SCOPE_SECONDS;
    }

    // Copy only scalar presentation inputs; never retain the caller's object.
    this.previous = { clock, location, scopeKey, sessionKey, alive };
    return {
      location: location !== '' && clock < this.locationUntil,
      scope: scopeKey !== '' && clock < this.scopeUntil,
    };
  }
}
