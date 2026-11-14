/** Calls GET /api/health and returns the parsed JSON body. */
export async function fetchHealth(apiUrl: string): Promise<unknown> {
  const response = await fetch(`${apiUrl}/api/health`);
  if (!response.ok) {
    throw new Error(`GET /api/health failed with HTTP ${response.status}`);
  }
  return response.json();
}
