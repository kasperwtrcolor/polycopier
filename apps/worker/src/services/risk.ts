import type { Signal } from "./signalSource.js";

// Bot configuration used by sizing and risk logic
export type BotConfig = {
  targets: string[];
  multiplier: number;
  maxTradeUsd: number;
  minNotionalUsd: number;
  maxSlippageBps: number;
  copyDelayMs: number;
};

export type Decision =
  | { ok: true; targetUsd: number; reason?: never }
  | { ok: false; reason: string };

/**
 * Given a signal, the bot configuration and the user’s available cash, decide how much USD to allocate.
 * Returns either a target USD amount or a skip reason.
 */
export function decideSize(signal: Signal, cfg: BotConfig, userCashUsd: number): Decision {
  const raw = cfg.multiplier * (signal.notionalUsd || 0);
  const capped = Math.min(cfg.maxTradeUsd, raw || cfg.maxTradeUsd);
  const targetUsd = Math.min(capped, userCashUsd);
  if (targetUsd <= 0) return { ok: false, reason: "no_cash" };
  if (targetUsd < cfg.minNotionalUsd) return { ok: false, reason: "below_min_notional" };
  return { ok: true, targetUsd };
}

/**
 * Calculate slippage in basis points between the reference price and the desired price.
 */
export function slippageBps(refPrice: number, desiredPrice: number): number {
  if (refPrice <= 0) return 0;
  return Math.round((Math.abs(desiredPrice - refPrice) / refPrice) * 10000);
}