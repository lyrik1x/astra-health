# ASTRA HEALTH

An offline-first PWA prototype to explore astronaut health monitoring with delayed Earth–ship communications.

Built for the NASA Space Apps Challenge 2026 challenge **"Create Health Monitoring Software for Astronauts on Space Missions"**.

> [!IMPORTANT]
> - **Educational prototype.** It is **not** a certified medical device.
> - It does **not** replace professional medical care.
> - It is **not** endorsed by NASA or by any other space agency.
> - All data is **fictional**.
> - The mission clock and the communication delay are **simulated**.

## What it does

The demo follows one end-to-end journey:

1. **Record** a measurement on the ship.
2. **Compare** it, in an explainable way, with the astronaut's own previous records.
3. **Work offline:** everything is stored locally while the ship has no link.
4. **Report an incident:** the astronaut creates an incident and explicitly sends the report.
5. **Reconnect and sync:** pending records are synchronized when the link comes back.
6. **Transit with delay:** each transmission travels toward Earth with a simulated delay.
7. **Earth console:** Earth receives the transmission only after that delay.
8. **Earth review:** Earth sends a review back, and it reaches the ship after the same delay.

Also included:

- **Six indicators:** heart rate, body temperature, blood glucose, blood pressure, mood and sleep.
- **Body figure** that shows the transmission status of each indicator's latest record. Its colors describe data transport, never health.
- **Simple trend** of the astronaut's own records over simulated mission time.
- **English and Spanish** interface.

The personal comparison uses the median of up to 7 previous comparable records (same astronaut, indicator, unit and context; at least 3) and shows the absolute and percentage difference and the records it used. Blood pressure is compared per component; mood is not compared.

## What it does not do

- **No clinical thresholds or diagnoses.** Clinical evaluation is disabled: it always reports that there are no validated clinical rules. A statistical difference is not a diagnosis.
- **No emergency instructions.** The emergency guide is only a *design pending* placeholder, because no competent medical review was obtained.
- **No real authentication.** The ship/Earth role is a demo-mode switch (`?role=ship` / `?role=earth`), not a login.
- No free-text messaging between ship and Earth; the reply path is Earth's review of an incident.
- No real astronaut or sensor data is integrated.

## Architecture

Monorepo with npm workspaces:

| Workspace | Purpose |
| --- | --- |
| `apps/web` | React client: ship app and Earth console (offline-first PWA). |
| `apps/api` | NestJS API with Prisma and SQLite. |
| `packages/contracts` | Shared Zod schemas and the mission clock formula. |
| `packages/health-engine` | Personal comparison; runs in the client. |

Stack: TypeScript, React, Vite, Tailwind CSS, i18next, Dexie (IndexedDB), `vite-plugin-pwa`, NestJS, Prisma + SQLite (`better-sqlite3`), Zod, Vitest, Jest and Supertest.

Key ideas:

- **Outbox with idempotent sync:** every offline operation keeps a stable UUID. Retries never create duplicates; the same UUID with different content is rejected as a conflict.
- **Delayed channel:** everything that crosses ship↔Earth is a transmission with a `deliverAt` time. The API filters what each role can see by `deliverAt`, not only the UI.
- **Server-confirmed is not delivered:** the UI distinguishes saved locally, queued, confirmed, in transit and delivered.

## Running it locally

Requirements: **Node.js 26** (see `engines` in `package.json`) and the npm that ships with it.

### Windows (PowerShell)

```powershell
npm ci
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
npm run db:setup
npm run build
$env:DEMO_RESET_ENABLED = "true"; npm run start:api
```

In a second terminal:

```powershell
npm run preview:web
```

### macOS / Linux

```bash
npm ci
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
npm run db:setup
npm run build
DEMO_RESET_ENABLED=true npm run start:api
```

In a second terminal:

```bash
npm run preview:web
```

Notes:

- Copy `apps/web/.env` **before** `npm run build`: Vite reads `VITE_API_URL` at build time.
- `npm run db:setup` applies the migrations and loads the fictional seed data into `apps/api/dev.db`.
- `DEMO_RESET_ENABLED=true` enables the demo reset endpoint and button. The provided `.env.example` already sets it; use it only for local demos.
- The API listens on http://localhost:3000/api.

### Open the demo

- Ship: http://localhost:4173/?role=ship
- Earth: http://localhost:4173/?role=earth

### Simulating link loss

In the ship tab, open the browser's DevTools, go to the **Network** panel and choose **Offline**. New records are stored locally and kept in the outbox. Switch back to **No throttling** to reconnect and synchronize.

Do not change the clock factor while the ship is disconnected.

## Tests

```bash
npm test
npm run build
```

`npm test` runs the Vitest suites (`contracts`, `health-engine`, `web`) and the Jest + Supertest suite (`api`). `npm run build` type-checks and builds every workspace.

## Data and sources

- **Delay:** the one-way Earth–Mars communication delay is **4 to 24 minutes**, depending on the planets' positions (NASA, [*Space Communications: 7 Things You Need to Know*](https://www.nasa.gov/missions/tech-demonstration/space-communications-7-things-you-need-to-know/)). The prototype uses a `MARS_TRANSIT` profile of **20 simulated minutes**, and the mission clock runs **×60**, so the delay is about **20 real seconds**.
- **Challenge resources** used as background:
  - NASA Human Research Program, [*5 Hazards of Human Spaceflight*](https://www.nasa.gov/hrp/hazards/)
  - NASA Human Research Program, [*Risks of Human Spaceflight*](https://www.nasa.gov/hrp/risks/)
  - NASA Human Research Program, [*Ongoing HRP Research in Space*](https://www.nasa.gov/hrp/ongoing-hrp-research/)
  - Canadian Space Agency, [*Monitoring Radiation for Astronaut Health*](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp)
  - Canadian Space Agency, [*Why Do We Conduct Science Experiments in Space?*](https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp)
- The indicators are related to HRP risks **only as documentation**. The prototype does not integrate real data from these sources, and none of them provides the values or rules used in the app.
- All astronauts and measurements in the seed are fictional.

## Open-source dependencies

Direct dependencies declared in the workspace `package.json` files. Licenses are read from each package's own `package.json` in `node_modules`.

| Package | Version | License | Used in |
| --- | --- | --- | --- |
| `@nestjs/common` | 12.5.0 | MIT | api |
| `@nestjs/core` | 12.5.0 | MIT | api |
| `@nestjs/platform-express` | 12.5.0 | MIT | api |
| `@nestjs/testing` | 12.5.0 | MIT | api (dev) |
| `@prisma/adapter-better-sqlite3` | 7.10.1 | Apache-2.0 | api |
| `@prisma/client` | 7.10.1 | Apache-2.0 | api |
| `prisma` | 7.10.1 | Apache-2.0 | api (dev) |
| `better-sqlite3` | 12.11.1 | MIT | api |
| `reflect-metadata` | 0.2.2 | Apache-2.0 | api |
| `rxjs` | 7.8.2 | Apache-2.0 | api |
| `zod` | 4.6.7 | MIT | api, contracts |
| `jest` | 30.5.2 | MIT | api (dev) |
| `ts-jest` | 29.4.15 | MIT | api (dev) |
| `supertest` | 7.3.2 | MIT | api (dev) |
| `@types/jest` | 30.0.0 | MIT | api (dev) |
| `@types/supertest` | 7.2.1 | MIT | api (dev) |
| `react` | 19.3.1 | MIT | web |
| `react-dom` | 19.3.1 | MIT | web |
| `dexie` | 4.4.7 | Apache-2.0 | web |
| `i18next` | 26.7.2 | MIT | web |
| `react-i18next` | 17.1.13 | MIT | web |
| `motion` | 14.8.0 | MIT | web |
| `vite` | 8.3.8 | MIT | web (dev) |
| `@vitejs/plugin-react` | 6.3.0 | MIT | web (dev) |
| `vite-plugin-pwa` | 2.0.0 | MIT | web (dev) |
| `tailwindcss` | 4.3.3 | MIT | web (dev) |
| `@tailwindcss/vite` | 4.3.3 | MIT | web (dev) |
| `fake-indexeddb` | 6.2.7 | Apache-2.0 | web (dev) |
| `@types/react` | 19.3.0 | MIT | web (dev) |
| `@types/react-dom` | 19.3.0 | MIT | web (dev) |
| `vitest` | 5.1.0 | MIT | web, contracts, health-engine (dev) |
| `typescript` | 6.0.3 | Apache-2.0 | root (dev) |
| `@types/node` | 26.6.6 | MIT | root (dev) |

## AI usage

AI assistants (Claude and Codex) were used to plan and write code. All code was reviewed by the team.

## Team

- Bruno Esquivel
- Justin Eduardo
- Benito Reyna
- Ángel Eduardo

## License

Apache-2.0. See [`LICENSE`](LICENSE).
