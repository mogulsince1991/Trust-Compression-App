export type PlaybackSample = { position: number; duration: number; playing: boolean; rate: number; visible: boolean; now: number };

// Count observed playback, not elapsed page time or jumps along the seek bar.
export class PlaybackClock {
  private previous: PlaybackSample | null = null;
  private ranges: [number, number][] = [];
  secondsWatched = 0;
  duration = 0;
  started = false;
  completed = false;

  resetSample() { this.previous = null; }

  sample(current: PlaybackSample) {
    if (!Number.isFinite(current.position) || current.position < 0) { this.resetSample(); return; }
    if (Number.isFinite(current.duration) && current.duration > 0) this.duration = current.duration;
    const previous = this.previous;
    this.previous = current;
    if (!previous?.playing || !previous.visible || !current.visible) return;
    const elapsed = (current.now - previous.now) / 1000;
    const advanced = current.position - previous.position;
    const rate = previous.rate > 0 ? previous.rate : 1;
    if (elapsed <= 0 || elapsed > 2 || advanced <= 0 || advanced > elapsed * rate + 0.35) return;
    this.started = true;
    this.secondsWatched += Math.min(elapsed, advanced / rate);
    const ranges = [...this.ranges, [previous.position, current.position] as [number, number]].sort((a, b) => a[0] - b[0]);
    this.ranges = [];
    for (const range of ranges) {
      const last = this.ranges[this.ranges.length - 1];
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else this.ranges.push([...range]);
    }
  }

  snapshot() {
    const covered = this.ranges.reduce((sum, [start, end]) => sum + Math.max(0, Math.min(end, this.duration || end) - start), 0);
    return {
      secondsWatched: Math.round(this.secondsWatched * 100) / 100,
      durationSeconds: this.duration || null,
      percentWatched: this.duration ? Math.min(100, Math.round(covered / this.duration * 100)) : null,
      measurementVersion: 2,
      measurement: "observed_playback",
    };
  }
}
