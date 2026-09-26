type Event = { journey_id: string; asset_id: string | null; video_id: string | null; viewer_label: string | null; metadata: Record<string, any> | null };

// Progress payloads are cumulative. Never add each heartbeat to the previous one.
export function observedWatchSeconds(events: Event[]) {
  const sessions = new Map<string, number>();
  for (const event of events) {
    const meta = event.metadata;
    if (meta?.excluded || meta?.measurement !== "observed_playback" || !meta.playbackSessionId) continue;
    const seconds = Number(meta.secondsWatched);
    if (!Number.isFinite(seconds) || seconds < 0) continue;
    const key = `${event.journey_id}:${event.asset_id || event.video_id}:${event.viewer_label}:${meta.playbackSessionId}`;
    sessions.set(key, Math.max(sessions.get(key) || 0, seconds));
  }
  return Array.from(sessions.values()).reduce((sum, seconds) => sum + seconds, 0);
}
