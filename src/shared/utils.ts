export const now = (): number => Date.now();

export const generateId = (): string =>
  (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `snip_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`);

export const debounce = <T extends (...args: never[]) => void>(fn: T, delayMs: number): T => {
  let timeoutId: number | undefined;

  return ((...args: Parameters<T>) => {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(() => fn(...args), delayMs);
  }) as T;
};

export const throttle = <T extends (...args: never[]) => void>(fn: T, intervalMs: number): T => {
  let last = 0;
  let trailing: number | undefined;

  return ((...args: Parameters<T>) => {
    const current = Date.now();
    const remaining = intervalMs - (current - last);

    if (remaining <= 0) {
      last = current;
      fn(...args);
      return;
    }

    if (trailing) {
      window.clearTimeout(trailing);
    }

    trailing = window.setTimeout(() => {
      last = Date.now();
      fn(...args);
    }, remaining);
  }) as T;
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);
