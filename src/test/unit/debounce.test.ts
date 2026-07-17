import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../../utils/debounce';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('debounce', () => {
  it('collapses multiple rapid calls into a single trailing call', () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 500);

    debounced();
    debounced();
    debounced();

    vi.advanceTimersByTime(400);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('cancel() prevents the pending call', () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 500);
    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(1000);
    expect(callback).not.toHaveBeenCalled();
  });

  it('flush() runs the pending call immediately', () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 500);
    debounced();
    debounced.flush();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
