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
    const fn = vi.fn();
    const debounced = debounce(fn, 500);

    debounced();
    debounced();
    debounced();

    vi.advanceTimersByTime(400);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel() prevents the pending call', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 500);
    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });

  it('flush() runs the pending call immediately', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 500);
    debounced();
    debounced.flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
