import "dotenv/config";
import { tick } from "./engine.js";

// Determine polling interval; default to 1500 ms
const interval = Number(process.env.POLL_INTERVAL_MS || 1500);

async function loop(): Promise<void> {
  try {
    await tick();
  } catch (e: any) {
    console.error("worker_tick_error", e?.message || e);
  } finally {
    setTimeout(loop, interval);
  }
}

console.log("Worker started.");
loop();