# n8n-nodes-invezgo

n8n community node for the [Invezgo API](https://api.invezgo.com): Indonesian stock market (IDX/BEI) data — prices, broker summary, foreign flow, shareholders, financial statements, screener, watchlist, journal, alerts and more.

[n8n](https://n8n.io/) is a fair-code licensed workflow automation platform.

- [Installation](#installation)
- [Credentials](#credentials)
- [Operations](#operations)
- [Usage](#usage)
- [Development](#development)

## Installation

Follow the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/):
in n8n go to **Settings → Community Nodes → Install** and enter `n8n-nodes-invezgo`.

## Credentials

1. You need an active Invezgo subscription — see [plans](https://invezgo.com/id/data-api-saham-indonesia).
2. Generate an API key at [invezgo.com/id/setting/api](https://invezgo.com/id/setting/api).
3. In n8n create an **Invezgo API** credential and paste the key. n8n tests it against `GET /usage/api`.

## Operations

| Resource | What you get |
|---|---|
| Market | Stock / broker / index lists, top gainers & losers, top foreign / BDM / retail flow, UMA, suspensions, notations, corporate action calendar, news, disclosures |
| Stock Price & Trade | Company information, charts (daily & multi-timeframe, indicators), intraday, order book, order queue, running trade, price table, time table, price diary, seasonality, momentum |
| Broker Activity | Broker summary (by stock or by broker), broker stalker, inventory charts, distribution (sankey) chart |
| Shareholder | Composition, KSEI, 5% / 1% holders, insider transactions, free float, relations, classifications |
| Financial | Financial statements, key statistics, flow of funds (with charts) |
| Sector | Sector stalker, sector rotation (RRG) |
| Batch | Order book / intraday data for several codes in one call |
| Search | Search stocks and users |
| Screener | Run a formula screen, manage saved presets |
| Watchlist, Journal, Portfolio, Realized Trade | Your personal Invezgo data |
| Alert | Create, test, update and delete live alerts |
| Post | Community posts, comments and votes |
| Usage | API quota and request logs |

The node is also usable as a tool by the n8n **AI Agent** node.

## Usage

- **Stock codes** are upper-cased automatically, so `bbca` works.
- **Dates** use the date picker; only the date part (`YYYY-MM-DD`, WIB) is sent.
- Optional parameters are under **Options** (or **Additional Fields** for create/update).
- Comma-separated fields (for example IDs to delete) accept `id1,id2`.
- All times in responses are WIB (UTC+7) even though they end with `Z` — do not convert time zones.
- Data is limited to the last 2 years. HTTP `402` means your plan does not include that endpoint; `429` means the rate limit or monthly quota was reached.

### Invezgo Trigger (webhook)

Starts a workflow when Invezgo sends a [webhook event](https://docs.invezgo.com/api-usage/webhook) — data updates (`update.summary`, `update.news`, …), Live Alerts with channel **WEBHOOK** (`alert.triggered`), quota warnings and `test.ping`.

1. Add the **Invezgo Trigger** node and select the **Invezgo API** credential (ADVANCE plan or higher; `update.*` and `alert.*` events need PRIME or higher).
2. Activate the workflow. n8n registers its Production URL as your account webhook and stores the signing secret itself. Your n8n instance must be reachable over public HTTPS.

Invezgo allows **one webhook per account**: activating (or testing) the trigger replaces any webhook set on the website and rotates its secret. Deactivating the workflow disables the webhook.

Every request is checked against `X-Invezgo-Signature` and rejected if older than 5 minutes. Output is the event body plus `event` (`"{domain}.{type}"`) for routing with a **Switch** node. `update` events only carry `data.path`; fetch the fresh data with the **Invezgo** node.

Example: **Schedule Trigger** (weekdays 16:30) → **Invezgo** (Market → Top Foreign Flow, Date = `{{ $today }}`) → **Telegram**.

## Development

```bash
npm install
npm run generate   # regenerate nodes/Invezgo/Invezgo.properties.ts from https://api.invezgo.com/openapi.json
npm run build
npm test           # sanity check of the generated node (run after build)
npm run lint
npm run dev        # starts n8n at http://localhost:5678 with this node loaded
```

`nodes/Invezgo/Invezgo.properties.ts` is generated — edit `scripts/generate.mjs` (resource grouping, labels, operation names) instead of the file itself.

### Publishing (required for n8n verification)

Since 1 May 2026 verified nodes must be published from GitHub Actions with npm provenance. This repo already contains `.github/workflows/publish.yml`.

1. Source: [github.com/Invezgo/n8n-nodes-invezgo](https://github.com/Invezgo/n8n-nodes-invezgo).
2. On npmjs.com set up a **Trusted Publisher** (GitHub Actions, workflow `publish.yml`) — or add an `NPM_TOKEN` repo secret.
3. Run `npm run release` locally: it lints, builds, bumps the version, tags and pushes; the workflow publishes to npm.
4. Submit the package at [creators.n8n.io/nodes](https://creators.n8n.io/nodes). Review can take up to 4 weeks.

## Resources

- [Invezgo API documentation](https://api.invezgo.com)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE.md)
