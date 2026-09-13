export type YouTubePlayer = {
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getPlaybackRate(): number;
  destroy(): void;
};
type YouTubeApi = { Player: new (element: HTMLIFrameElement, options: { events: { onStateChange: (event: { data: number }) => void } }) => YouTubePlayer };
let loading: Promise<YouTubeApi> | null = null;

export function loadYouTubePlayer(): Promise<YouTubeApi> {
  const getApi = () => (window as Window & { YT?: YouTubeApi }).YT;
  if (getApi()?.Player) return Promise.resolve(getApi()!);
  if (loading) return loading;
  loading = new Promise<YouTubeApi>((resolve, reject) => {
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
    const started = Date.now();
    const poll = window.setInterval(() => {
      const api = getApi();
      if (api?.Player) { window.clearInterval(poll); resolve(api); }
      else if (Date.now() - started > 15000) { window.clearInterval(poll); reject(new Error("YouTube playback measurement unavailable")); }
    }, 100);
  }).catch((error) => { loading = null; throw error; });
  return loading;
}
