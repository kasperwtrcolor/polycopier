import { q } from "./services/db.js";
import { decryptJson } from "./services/crypto.js";
import { log } from "./services/logger.js";
import { fetchSignals, type Signal } from "./services/signalSource.js";
import { decideSize, slippageBps, type BotConfig } from "./services/risk.js";
import { getOrderbook, placeOrder, type PMCreds } from "./services/polymarket.js";

// Shape of an active user returned from the database
type ActiveUser = {
  userId: string;
  targets: string[];
  multiplier: number;
  max_trade_usd: number;
  min_notional_usd: number;
  max_slippage_bps: number;
  copy_delay_ms: number;
};

// Keep per‑user runtime state (last signal timestamp and last trade per token)
type UserState = { lastSignalTs: number; lastTradeByToken: Map<string, number> };
const state = new Map<string, UserState>();

function getState(userId: string): UserState {
  const s = state.get(userId);
  if (s) return s;
  const fresh: UserState = { lastSignalTs: Date.now() - 60_000, lastTradeByToken: new Map() };
  state.set(userId, fresh);
  return fresh;
}

/**
 * The worker’s main tick.  Loads active users, fetches signals for each, applies risk rules,
 * and executes trades via the Polymarket adapter.
 */
export async function tick(): Promise<void> {
  // Retrieve all enabled bots and their config
  const users = await q<ActiveUser>(
    `SELECT bc.user_id as "userId",
            (bc.targets)::jsonb as targets,
            bc.multiplier, bc.max_trade_usd, bc.min_notional_usd, bc.max_slippage_bps, bc.copy_delay_ms
     FROM bot_config bc
     WHERE bc.enabled=true`
  );

  for (const u of users.rows) {
    const s = getState(u.userId);
    const cfg: BotConfig = {
      targets: (u.targets as any) ?? [],
      multiplier: Number(u.multiplier),
      maxTradeUsd: Number(u.max_trade_usd),
      minNotionalUsd: Number(u.min_notional_usd),
      maxSlippageBps: Number(u.max_slippage_bps),
      copyDelayMs: Number(u.copy_delay_ms)
    };

    if (!cfg.targets.length) continue;

    // Load encrypted Polymarket creds
    const credRow = await q<{ ciphertext: string }>(
      "SELECT ciphertext FROM pm_credentials WHERE user_id=$1",
      [u.userId]
    );
    if (!credRow.rows[0]?.ciphertext) {
      await log(u.userId, "warn", "No Polymarket credentials set. Skipping.");
      continue;
    }
    const creds = decryptJson<PMCreds>(credRow.rows[0].ciphertext);

    // Determine user cash (for sizing).  For MVP, assume full maxTradeUsd available.
    const userCashUsd = cfg.maxTradeUsd;

    // Fetch signals (trades) for the user’s target wallets.
    const apiBase = process.env.SIGNAL_FEED_URL || "";
    if (!apiBase) throw new Error("SIGNAL_FEED_URL missing");

    let signals: Signal[] = [];
    try {
      // fetchSignals will query only addresses in cfg.targets and filter by sinceTs
      signals = await fetchSignals(apiBase, cfg.targets, s.lastSignalTs);
    } catch (e: any) {
      await log(u.userId, "error", "Signal feed error", { err: String(e?.message || e) });
      continue;
    }

    // Sort signals chronologically
    const relevant = signals.sort((a, b) => a.ts - b.ts);
    if (relevant.length) s.lastSignalTs = Math.max(s.lastSignalTs, relevant.at(-1)!.ts);

    for (const sig of relevant) {
      const last = s.lastTradeByToken.get(sig.tokenId) || 0;
      // Enforce per‑market cooldown
      if (Date.now() - last < cfg.copyDelayMs) {
        await writeHistory(u.userId, sig, 0, 0, "SKIPPED", "cooldown");
        continue;
      }

      const sizeDecision = decideSize(sig, cfg, userCashUsd);
      if (!sizeDecision.ok) {
        await writeHistory(u.userId, sig, 0, 0, "SKIPPED", sizeDecision.reason);
        continue;
      }

      // Compare desired price to current order book and enforce slippage guard
      const ob = await getOrderbook(sig.tokenId, creds);
      const ref = sig.side === "BUY" ? ob.ask : ob.bid;
      const bps = slippageBps(ref, sig.price);
      if (bps > cfg.maxSlippageBps) {
        await writeHistory(u.userId, sig, 0, 0, "SKIPPED", "slippage_guard");
        await log(u.userId, "warn", "Skipped: slippage_guard", {
          tokenId: sig.tokenId,
          ref,
          desired: sig.price,
          bps
        });
        continue;
      }

      // Convert target USD into number of shares; skip if below min shares threshold
      const shares = sig.price > 0 ? sizeDecision.targetUsd / sig.price : 0;
      const minShares = 5; // adjust for Polymarket min size; on mainnet it's 5 shares
      if (shares < minShares) {
        await writeHistory(u.userId, sig, sizeDecision.targetUsd, shares, "SKIPPED", "cannot_meet_min_shares");
        continue;
      }

      // Place the order
      await log(u.userId, "info", `Placing Order: ${sig.side} ${shares.toFixed(4)} shares @ ${sig.price}`, {
        tokenId: sig.tokenId
      });
      try {
        const r = await placeOrder({ tokenId: sig.tokenId, side: sig.side, price: sig.price, sizeShares: shares, creds });
        await writeHistory(u.userId, sig, sizeDecision.targetUsd, shares, "ACCEPTED", null, r.orderId);
        await log(u.userId, "success", `Order Accepted. Id: ${r.orderId}`, { tokenId: sig.tokenId });
        s.lastTradeByToken.set(sig.tokenId, Date.now());
      } catch (e: any) {
        await writeHistory(u.userId, sig, sizeDecision.targetUsd, shares, "FAILED", "execution_failed");
        await log(u.userId, "error", "Execution failed at adapter level", { err: String(e?.message || e) });
      }
    }
  }
}

/**
 * Write a history record for a trade attempt.  Ensures idempotency on signal_id.
 */
async function writeHistory(
  userId: string,
  sig: Pick<Signal, "signalId" | "marketId" | "tokenId" | "outcome" | "side" | "price" | "ts">,
  requestedUsd: number,
  requestedShares: number,
  status: "ACCEPTED" | "FILLED" | "REJECTED" | "FAILED" | "SKIPPED",
  reason: string | null,
  orderId?: string
): Promise<void> {
  await q(
    `INSERT INTO bot_history(user_id, signal_id, market_id, token_id, outcome, side, price,
                             requested_usd, requested_shares, status, reason, order_id, ts)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,to_timestamp($13/1000.0))
     ON CONFLICT (user_id, signal_id) DO NOTHING`,
    [
      userId,
      sig.signalId,
      sig.marketId,
      sig.tokenId,
      sig.outcome,
      sig.side,
      sig.price,
      requestedUsd,
      requestedShares,
      status,
      reason,
      orderId ?? null,
      sig.ts
    ]
  );
}