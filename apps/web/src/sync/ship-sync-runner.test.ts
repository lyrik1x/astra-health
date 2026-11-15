import { describe, expect, it, vi } from "vitest";
import { SHIP_SYNC_INTERVAL_MS, createShipSyncRunner } from "./ship-sync-runner";

function setup({ online = true, syncOnce }: { online?: boolean; syncOnce?: () => Promise<unknown> } = {}) {
  const state = { online, intervalCallback: undefined as (() => void) | undefined, intervalMs: 0 };
  const onlineListeners = new Set<() => void>();
  const deps = {
    syncOnce: vi.fn(syncOnce ?? (() => Promise.resolve({}))),
    isOnline: () => state.online,
    setInterval: vi.fn((callback: () => void, ms: number) => {
      state.intervalCallback = callback;
      state.intervalMs = ms;
      return 42;
    }),
    clearInterval: vi.fn(),
    addOnlineListener: vi.fn((callback: () => void) => {
      onlineListeners.add(callback);
      return () => onlineListeners.delete(callback);
    }),
    log: vi.fn(),
  };
  const runner = createShipSyncRunner(deps);
  const fireOnline = () => onlineListeners.forEach((listener) => listener());
  const tick = () => state.intervalCallback?.();
  return { deps, runner, state, onlineListeners, fireOnline, tick };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createShipSyncRunner", () => {
  it("syncs once at start when there is a link", () => {
    const { deps, runner } = setup();
    runner.start();
    expect(deps.syncOnce).toHaveBeenCalledTimes(1);
  });

  it("does not sync without a link", async () => {
    const { deps, runner, tick } = setup({ online: false });
    runner.start();
    tick();
    runner.requestSync();
    await flush();
    expect(deps.syncOnce).not.toHaveBeenCalled();
  });

  it("does not overlap cycles", async () => {
    let finish: () => void = () => {};
    const { deps, runner, tick, fireOnline } = setup({
      syncOnce: () => new Promise<void>((resolve) => (finish = resolve)),
    });
    runner.start();
    tick();
    fireOnline();
    runner.requestSync();
    expect(deps.syncOnce).toHaveBeenCalledTimes(1);
    finish();
    await flush();
    runner.requestSync();
    expect(deps.syncOnce).toHaveBeenCalledTimes(2);
  });

  it("reacts to the online event", async () => {
    const { deps, runner, state, fireOnline } = setup({ online: false });
    runner.start();
    expect(deps.syncOnce).not.toHaveBeenCalled();
    state.online = true;
    fireOnline();
    expect(deps.syncOnce).toHaveBeenCalledTimes(1);
  });

  it("syncs on every 5 s tick only while online", async () => {
    const { deps, runner, state, tick } = setup();
    runner.start();
    expect(state.intervalMs).toBe(SHIP_SYNC_INTERVAL_MS);
    expect(SHIP_SYNC_INTERVAL_MS).toBe(5_000);
    await flush();
    tick();
    expect(deps.syncOnce).toHaveBeenCalledTimes(2);
    await flush();
    state.online = false;
    tick();
    expect(deps.syncOnce).toHaveBeenCalledTimes(2);
  });

  it("logs a failed cycle without throwing, and allows the next one", async () => {
    const { deps, runner } = setup({ syncOnce: () => Promise.reject(new Error("network down")) });
    expect(() => runner.start()).not.toThrow();
    await flush();
    expect(deps.log).toHaveBeenCalledTimes(1);
    runner.requestSync();
    expect(deps.syncOnce).toHaveBeenCalledTimes(2);
  });

  it("logs a synchronous throw of syncOnce without throwing", async () => {
    const { deps, runner } = setup({
      syncOnce: () => {
        throw new Error("boom");
      },
    });
    expect(() => runner.start()).not.toThrow();
    await flush();
    expect(deps.log).toHaveBeenCalledTimes(1);
  });

  it("stop clears the interval and the online listener", () => {
    const { deps, runner, onlineListeners } = setup();
    runner.start();
    runner.stop();
    expect(deps.clearInterval).toHaveBeenCalledWith(42);
    expect(onlineListeners.size).toBe(0);
  });

  it("start twice does not create a second interval", () => {
    const { deps, runner } = setup();
    runner.start();
    runner.start();
    expect(deps.setInterval).toHaveBeenCalledTimes(1);
  });
});
