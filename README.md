## PolyCopier MVP

This repository contains the **PolyCopier** MVP — a simple copy‑trading bot for Polymarket inspired by BetMirror.  It’s designed for developers on dev.fun and demonstrates how to connect a Solana wallet for authentication, store encrypted Polymarket credentials, configure copy‑trading rules, run a long‑lived worker to mirror trades from selected wallets, and expose a minimal API to power a user interface.

### Repository structure

```
polycopier/
  apps/
    api/      # Express API for authentication, bot configuration and status
    worker/   # Long‑running worker that polls signals and executes trades
  sql/        # Database migrations
  README.md   # This file
```

Each app contains its own `package.json`, TypeScript sources in `src/`, and environment examples.  See the `README` sections below for how to run each part.

### Prerequisites

* **Node.js 18+** and **npm** installed on your machine.
* **PostgreSQL** database.  The SQL migration requires the `pgcrypto` extension for UUID generation and encryption support.
* A working **Polymarket** trading account with CLOB credentials (API key/secret/passphrase).

### Setup

1.  Create a PostgreSQL database and run the initial schema:

    ```bash
    psql -d yourdb < sql/001_init.sql
    ```

    If you see an error about `pgcrypto`, enable the extension first:

    ```sql
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    ```

2.  Copy the environment examples and fill in your values:

    ```bash
    cd apps/api
    cp .env.example .env
    # edit .env to set DATABASE_URL, JWT_SECRET, CREDENTIALS_MASTER_KEY, etc.
    npm install

    cd ../worker
    cp .env.example .env
    # edit .env to set DATABASE_URL, CREDENTIALS_MASTER_KEY, SIGNAL_FEED_URL, etc.
    npm install
    ```

3.  Start the API server:

    ```bash
    cd apps/api
    npm run dev
    ```

    It will listen on the port defined in your `.env` (default 8080) and expose endpoints under `/auth` and `/bot`.

4.  Start the worker:

    ```bash
    cd apps/worker
    npm run dev
    ```

    The worker polls a signal feed (configured via `SIGNAL_FEED_URL`) for trades made by followed wallets, applies sizing and risk rules, and places orders through the Polymarket adapter.

### API overview

The API uses JWT authentication.  To log in, call `POST /auth/login` with a Solana public key to obtain a token.  Use the token in the `Authorization: Bearer` header for subsequent requests.

Key endpoints:

| Method & Path            | Description                                        |
|--------------------------|----------------------------------------------------|
| `POST /auth/login`       | Log in with a Solana pubkey and receive a JWT     |
| `POST /bot/credentials`  | Save encrypted Polymarket API credentials          |
| `POST /bot/config`       | Update copy‑trading settings (targets, sizing, etc.) |
| `POST /bot/start`        | Enable the bot for the authenticated user          |
| `POST /bot/stop`         | Disable the bot                                    |
| `GET  /bot/status`       | Get current bot status and recent logs             |
| `GET  /bot/history`      | Get a paginated list of trade attempts             |
| `GET  /bot/positions`    | Get current positions snapshot                     |

### Worker overview

The worker is a separate process that continually:

1.  Loads active users and their bot configurations from the database.
2.  Retrieves encrypted Polymarket credentials and decrypts them using the master key.
3.  Fetches new trade signals from the configured `SIGNAL_FEED_URL`.
4.  Filters signals based on the user’s selected target wallets.
5.  Applies sizing and risk checks (e.g., copy delay, slippage guard, min notional).
6.  Places orders on Polymarket via an adapter and logs the outcome.
7.  Records trade attempts in `bot_history` and updates `positions_snapshot`.

The provided `polymarket.ts` stubs need to be replaced with real API calls to Polymarket’s order book and order submission endpoints.  The `signalSource.ts` should be adapted to match your live trades feed structure.

### Disclaimer

This project is an example provided for educational purposes.  Use at your own risk.  Copy‑trading and interacting with prediction markets may be regulated in your jurisdiction; consult a legal professional before deploying a live service.