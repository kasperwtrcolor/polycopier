/**
 * Fetch the top traders from the Polymarket leaderboard API.
 *
 * @param apiBase The base URL of the leaderboard API.
 * @param period One of 'daily', 'weekly', 'monthly' or 'all'.
 * @param category Category filter; defaults to 'all'.  Can be 'politics', 'tech', 'sports', 'crypto', 'finance', 'culture'.
 * @param limit Optional number of entries to request (default 100).
 */
export interface LeaderboardEntry {
  walletAddress: string;
  displayName: string;
  profitLoss: number;
  volume: number;
  tradeCount: number;
  rank: number;
  profileUrl: string;
}

export async function fetchTopTraders(
  apiBase: string,
  period: 'daily' | 'weekly' | 'monthly' | 'all',
  category: string = 'all',
  limit: number = 100
): Promise<LeaderboardEntry[]> {
  const u = new URL(apiBase);
  u.searchParams.set('period', period);
  u.searchParams.set('category', category);
  u.searchParams.set('limit', String(limit));
  const res = await fetch(u.toString(), { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`leaderboard_http_${res.status}`);
  }
  const json = await res.json();
  const entries = json?.data?.entries ?? [];
  return entries;
}