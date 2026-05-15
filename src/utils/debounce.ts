export function debounce<T extends (...args: never[]) => unknown>(
  fn: T,
  waitMs: number
): ((...args: Parameters<T>) => void) & { cancel: () => void; flush: () => void } {
  let timer: NodeJS.Timeout | undefined;
  let lastArgs: Parameters<T> | undefined;

  const debounced = (...args: Parameters<T>): void => {
    lastArgs = args;
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      const a = lastArgs!;
      lastArgs = undefined;
      fn(...a);
    }, waitMs);
  };

  (debounced as unknown as { cancel: () => void }).cancel = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    lastArgs = undefined;
  };

  (debounced as unknown as { flush: () => void }).flush = (): void => {
    if (timer && lastArgs) {
      clearTimeout(timer);
      timer = undefined;
      const a = lastArgs;
      lastArgs = undefined;
      fn(...a);
    }
  };

  return debounced as ((...args: Parameters<T>) => void) & {
    cancel: () => void;
    flush: () => void;
  };
}
