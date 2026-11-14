import { useEffect, useState } from "react";
import { engineVersion } from "@astra/health-engine";
import { fetchHealth } from "./api/health";

// T-101: textos temporales en inglés, sin i18n (llega con T-103).
type HealthState =
  | { kind: "loading" }
  | { kind: "ok"; body: unknown }
  | { kind: "error"; message: string };

const apiUrl = import.meta.env.VITE_API_URL;

export function App() {
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });

  useEffect(() => {
    if (!apiUrl) {
      setHealth({ kind: "error", message: "VITE_API_URL is not set (see apps/web/.env.example)" });
      return;
    }
    fetchHealth(apiUrl)
      .then((body) => setHealth({ kind: "ok", body }))
      .catch((error: unknown) =>
        setHealth({ kind: "error", message: error instanceof Error ? error.message : String(error) }),
      );
  }, []);

  return (
    <main>
      <h1>ASTRA HEALTH</h1>
      <p>Educational prototype. Not a medical device.</p>
      <h2>API health</h2>
      {health.kind === "loading" && <p>Checking /api/health…</p>}
      {health.kind === "ok" && <pre data-testid="health">{JSON.stringify(health.body)}</pre>}
      {health.kind === "error" && <p role="alert">Error: {health.message}</p>}
      <p>health-engine version: {engineVersion()}</p>
    </main>
  );
}
