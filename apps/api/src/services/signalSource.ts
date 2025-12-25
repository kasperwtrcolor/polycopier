/**
 * Type definition for a copy signal.  Each signal describes a single trade or order to mirror.
 */
export type Signal = {
  signalId: string;
  sourceWallet: string;
  marketId: string;
  tokenId: string;
  /**
   * Outcome name from Polymarket; not limited to YES/NO because some markets have named outcomes.
   */
  outcome: string;
  side: "BUY" | "SELL";
  price: number;
  notionalUsd: number;
  ts: number;
};

/**
 * Fetch live trades for the given list of trader addresses from the Polymarket trades API.
 *
 * This function mirrors the worker implementation.  It accepts a base URL, a list of addresses,
 * an optional since timestamp (ms) and a limit.  It returns an array of normalized signals.
 */
export async function fetchSignals(
  apiBase: string,
  addresses: string[],
  sinceTs?: number,
  limit: number = 50
): Promise<Signal[]> {
  if (!addresses || addresses.length === 0) {
    return [];
  }
  const u = new URL(apiBase);
  u.searchParams.set("traders", addresses.join(","));
  u.searchParams.set("limit", String(limit));
  const res = await fetch(u.toString(), { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`signal_feed_http_${res.status}`);
  }
  const json = await res.json();
  const trades = json?.data?.trades ?? [];
  const signals: Signal[] = trades.map((trade: any) => {
    const tsMs = Number(trade.timestamp) * 1000;
    return {
      signalId: String(trade.id ?? `${trade.traderAddress}-${trade.eventSlug}-${trade.timestamp}-${trade.side}`),
      sourceWallet: String(trade.traderAddress),
      marketId: String(trade.eventSlug ?? trade.market ?? ""),
      tokenId: String(trade.eventSlug ?? trade.market ?? ""),
      outcome: String(trade.outcome ?? "Unknown"),
      side: trade.side === "SELL" ? "SELL" : "BUY",
      price: Number(trade.price ?? 0),
      notionalUsd: Number(trade.amount ?? 0),
      ts: tsMs
    };
  });
  const filtered = typeof sinceTs === "number" ? signals.filter(s => s.ts > sinceTs) : signals;
  return filtered;
}