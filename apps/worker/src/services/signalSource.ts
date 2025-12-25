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
 * @param apiBase The base URL of the trades API (without query parameters).
 * @param addresses An array of wallet addresses to include in the query.  If empty, returns an empty array.
 * @param sinceTs Optional timestamp in milliseconds.  Trades older than this will be filtered out.
 * @param limit Optional number of trades to fetch (default 50).
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
  // Build comma‑separated list of addresses
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
      // Use eventSlug as both marketId and tokenId for now; adjust when tokenId is available
      marketId: String(trade.eventSlug ?? trade.market ?? ""),
      tokenId: String(trade.eventSlug ?? trade.market ?? ""),
      // Keep the outcome string from API; fallback to "Unknown" if missing
      outcome: String(trade.outcome ?? "Unknown"),
      side: trade.side === "SELL" ? "SELL" : "BUY",
      price: Number(trade.price ?? 0),
      // amount denotes total size (shares) or notional; we treat as notionalUsd
      notionalUsd: Number(trade.amount ?? 0),
      ts: tsMs
    };
  });
  // Filter by sinceTs if provided
  const filtered = typeof sinceTs === "number" ? signals.filter(s => s.ts > sinceTs) : signals;
  return filtered;
}