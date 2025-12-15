# Folio

Interactive Brokers portfolio manager for the terminal (TUI), plus an optional mobile dashboard.

- Live + paper trading (`7496` / `7497`)
- Positions, P&L, executions, pending orders
- Buy / sell (market orders)
- Local history persisted to `~/.folio/`
- Optional HTTPS + PWA mobile dashboard (`npm run server`)

## Screenshots

Drop your screenshots here (placeholders):

- `docs/screenshots/tui.png`
- `docs/screenshots/mobile.png`

```text
docs/screenshots/tui.png
docs/screenshots/mobile.png
```

Once you add them, they’ll render here:

![Folio TUI](docs/screenshots/tui.png)
![Folio Mobile](docs/screenshots/mobile.png)

## Requirements

- Node.js 18+
- TWS (Trader Workstation) or IB Gateway running
- TWS: API enabled at `Settings → API → Settings`
  - Enable: `Enable ActiveX and Socket Clients`
  - Ports: `7496` (live) / `7497` (paper)

## Install

```bash
git clone https://github.com/GBurgardt/interactive_brokers.git
cd interactive_brokers
npm install
```

## Run (TUI)

```bash
npm start
```

Paper account:

```bash
npm start -- --paper
```

Debug logs:

```bash
npm start -- --debug
```

Help:

```bash
npm start -- --help
```

Optional: install as a local command (`folio` / `ib`):

```bash
npm link
folio --paper
```

## Configure

Defaults work out of the box (localhost + standard IB ports). Optional env vars:

```bash
cp .env.example .env
```

Useful variables:

- `IB_HOST` (default `127.0.0.1`)
- `IB_PORT` (default `7496`)
- `IB_CLIENT_ID` (default `0`)

## Mobile dashboard (optional)

This runs an HTTPS server + PWA and connects to IB with a separate `clientId` to avoid conflicts.

Generate a local certificate:

```bash
npm run server:setup
```

Run the server:

```bash
npm run server
```

Watchlist:

- Edit `server/favorites.json` (auto-created on first run from `server/favorites.example.json`)

## Troubleshooting

Quick connection diagnostic:

```bash
npm run diagnose
```

Common issues:

- TWS API not enabled or wrong port
- Another app is already connected using the same `IB_CLIENT_ID`
- TWS shows a “socket client” approval prompt you must accept

## Notes / disclaimer

- Not affiliated with Interactive Brokers.
- This tool can place orders. Use paper first. You are responsible for what you run.
