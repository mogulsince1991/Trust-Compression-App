# Journey playback measurement

Version 2 replaces the page-time estimate with observed player progress.

- Direct HTML video files and YouTube's IFrame API provide measurement.
- Drive uses Google's preview iframe, not the original-file proxy. Drive and unsupported embeds do not emit playback events. Opening a page or loading an iframe is not a video start.
- `secondsWatched` is cumulative foreground playback time, excluding pauses, buffering and detected seeks. Playback at 2x counts one second of viewing for two seconds of content.
- `percentWatched` is unique observed content coverage. Replays increase viewing time, not coverage. Polling gaps longer than two seconds are excluded conservatively.
- Completion means the player emitted `ended`, not that 100% was watched. Auto-advance uses that event only.
- Snapshots flush every ten measured seconds and on pause, seek, asset change, visibility change and page exit. Exit delivery uses fetch keepalive but is still best effort.
- Metadata includes `measurementVersion: 2`, `measurement: observed_playback`, provider `source`, and `playbackSessionId`.
- Progress snapshots are cumulative. Consumers must use the maximum per playback session and asset, not sum snapshots. Historical `client_timer` values must not be presented as verified playback.
- A play event is evidence of player activity, not proof a human watched attentively or that the intended recipient used the link.

Tests:

```
node scripts/playback-clock-test.cjs
node scripts/playback-viewer-test.cjs
```

The lifecycle tests use simulated native/YouTube events and verify emitted payloads. Real provider playback and persisted events still require a live journey check. The legacy media proxy remains available but is no longer used by the journey viewer.
