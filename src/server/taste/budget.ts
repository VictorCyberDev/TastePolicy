// Process-local quota guard only; not a distributed rate-limit guarantee.
let windowStart = Date.now();
let used = 0;
let active = 0;
export function acquireDemoBudget(now = Date.now()): (() => void) | null {
  if (now - windowStart >= 60000) {
    windowStart = now;
    used = 0;
  }
  if (used >= 30 || active >= 4) return null;
  used++;
  active++;
  let released = false;
  return () => {
    if (!released) {
      active--;
      released = true;
    }
  };
}
