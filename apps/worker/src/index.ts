import "dotenv/config";
import { migrate } from "./services/db.js";
import { tick } from "./engine.js";

await migrate();

const interval = Number(process.env.POLL_INTERVAL_MS || 1500);

async function loop() {
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
