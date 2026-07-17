export function debounce<T extends (...args: never[]) => unknown>(
  callback: T,
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
      const pendingArgs = lastArgs!;
      lastArgs = undefined;
      callback(...pendingArgs);
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
      const pendingArgs = lastArgs;
      lastArgs = undefined;
      callback(...pendingArgs);
    }
  };

  return debounced as ((...args: Parameters<T>) => void) & {
    cancel: () => void;
    flush: () => void;
  };
}
