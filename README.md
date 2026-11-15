# ASTRA HEALTH

ASTRA HEALTH — an offline-first educational prototype for monitoring astronaut health with intermittent connectivity and delayed Earth–ship communications (NASA Space Apps Challenge 2026).

> **Important**
>
> - Educational prototype — not a medical device.
> - Does not replace professional care.
> - Not endorsed by NASA.
> - All data is fictional.
> - The mission clock and communication delay are simulated.

## What it does

The demo follows one end-to-end journey:

1. The astronaut records a measurement on the ship.
2. The app compares it, in an explainable way, with the astronaut's own previous records.
3. Everything keeps working and is stored locally while the ship is offline.
4. The astronaut creates an incident and explicitly sends a report.
5. When the link comes back, pending records are synchronized.
6. Each transmission travels toward Earth with a simulated delay.
7. The Earth console receives it only after that delay.
8. Earth sends a review back, which reaches the ship after the same delay.

The comparison shows numbers and the records it used. It does not produce diagnoses or clinical status labels.

## How it works

- **Monorepo** (npm workspaces):
  - `apps/web`: React + Vite client (ship app and Earth console).
  - `apps/api`: NestJS API with Prisma and SQLite.
  - `packages/contracts`: shared Zod schemas and the mission clock formula.
  - `packages/health-engine`: the personal comparison, which runs in the client.
- **Offline-first PWA:** records are stored in IndexedDB (Dexie), and a service worker caches the app shell so it loads without a network.
- **Outbox with idempotent sync:** every operation keeps a stable UUID. Retries never create duplicates, and the same UUID with different content is rejected as a conflict.
- **Delayed channel:** everything crossing ship↔Earth is a transmission with a `deliverAt` time. The server filters what each role can see by `deliverAt`, so hiding things in the UI is not the only safeguard.
- **Explainable personal comparison:** the median of up to 7 previous comparable records (same astronaut, indicator, unit and context; at least 3), shown with the absolute and percentage difference. There are no clinical thresholds.

## Simulated delay

- The `MARS_TRANSIT` profile uses a **one-way delay of 20 simulated minutes**. This is within the real range of **4 to 24 minutes** between Earth and Mars, according to NASA ([source](#sources)).
- In the demo the mission clock runs **60 times faster**, so the delay is about **20 real seconds**.

## Running it

Requirements: **Node 26** and **npm 11**. The commands below are for Windows PowerShell.

```powershell
npm ci
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
npm run db:setup
npm run build
npm run start:api
```

In a second terminal:

```powershell
npm run preview:web
```

Then open:

- Ship: http://localhost:4173/?role=ship
- Earth: http://localhost:4173/?role=earth

The role is chosen with a "demo mode" switch. **It is not a login** and provides no authentication.

**Simulating link loss:** in the ship tab, open the browser's developer tools, go to the **Network** panel and choose **Offline**. Records are stored locally and kept in the outbox. Switch back to **No throttling** to reconnect and synchronize.

**Optional, local only:** to enable the demo reset button, set `DEMO_RESET_ENABLED=true` in `apps/api/.env`.

**Tests:**

```powershell
npm test
```

## Known limitations

- No real authentication.
- The emergency guide is only a *design pending* placeholder, because no competent medical review was obtained.
- There are no clinical rules.
- Mood is not compared.
- There are no free-text messages.
- Do not change the clock factor while the ship is disconnected.

## Sources

- NASA, *Space Communications: 7 Things You Need to Know* — https://www.nasa.gov/missions/tech-demonstration/space-communications-7-things-you-need-to-know/
- NASA Space Apps Challenge 2026 — https://www.spaceappschallenge.org/2026/

## AI usage

The project was developed with AI assistants (Claude Code and Codex). The team reviewed every change, and changes were checked with automated tests.

## Team

- Bruno — technical lead (architecture, contracts, API, sync, integration)
- Justin — frontend (UI, PWA, Earth console)
- Benito — health engine and automated tests
- Lalo — demo, rules research and evidence

## License

Apache-2.0. See [`LICENSE`](LICENSE).
