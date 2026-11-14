/** Controllable replacement for NowProvider: tests move time without waiting. */
export class FakeNow {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current.getTime());
  }

  set(date: Date): void {
    this.current = date;
  }
}
