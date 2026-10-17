// Only use for read-only provider queries, including JobTread's POST-based reads.
export async function readFetch(url: string, init: RequestInit = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(25000) });
      if (![429, 502, 503, 504].includes(response.status) || attempt === 2) return response;
      const retryAfter = Number(response.headers.get("retry-after"));
      await response.body?.cancel();
      await new Promise(resolve => setTimeout(resolve, Math.min(5000, Math.max(500 * 2 ** attempt, (retryAfter || 0) * 1000))));
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw new Error("CRM request could not be completed.");
}
