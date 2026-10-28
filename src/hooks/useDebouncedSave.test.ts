import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DebouncedSaver } from './useDebouncedSave';

describe('DebouncedSaver logic with fake timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not trigger onSave on initial baseline queue', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onStatusChange = vi.fn();
    const saver = new DebouncedSaver<{ score: number }>({
      onSave,
      onStatusChange,
      delay: 400,
    });

    saver.queue({ score: 10 });

    expect(saver.status).toBe('idle');
    expect(onSave).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);

    expect(onSave).not.toHaveBeenCalled();
    expect(saver.status).toBe('idle');
  });

  it('debounces onSave by the specified delay', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onStatusChange = vi.fn();
    const saver = new DebouncedSaver<{ score: number }>({
      onSave,
      onStatusChange,
      delay: 400,
    });

    // Initial baseline
    saver.queue({ score: 10 });

    // First edit
    saver.queue({ score: 15 });
    expect(saver.status).toBe('saving');
    expect(onSave).not.toHaveBeenCalled();

    // Advance 200ms
    vi.advanceTimersByTime(200);
    expect(onSave).not.toHaveBeenCalled();

    // Second edit before 400ms fires
    saver.queue({ score: 20 });
    vi.advanceTimersByTime(200);
    expect(onSave).not.toHaveBeenCalled();

    // Complete the remaining 200ms of the second edit
    vi.advanceTimersByTime(200);
    // Allow async promise to resolve
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ score: 20 });
    expect(saver.status).toBe('saved');
    expect(saver.lastSavedAt).toBeInstanceOf(Date);
  });

  it('retries with exponential backoff on save failure', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network drop 1'))
      .mockRejectedValueOnce(new Error('Network drop 2'))
      .mockResolvedValueOnce(undefined);

    const saver = new DebouncedSaver<{ comments: string }>({
      onSave,
      delay: 400,
      maxRetries: 2,
    });

    saver.queue({ comments: 'Initial' });
    saver.queue({ comments: 'Updated remarks' });

    // Initial attempt at 400ms
    vi.advanceTimersByTime(400);
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(saver.getRetryCount()).toBe(1);

    // 1st backoff attempt: 300 * 2^1 = 600ms
    vi.advanceTimersByTime(600);
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(saver.getRetryCount()).toBe(2);

    // 2nd backoff attempt: 300 * 2^2 = 1200ms
    vi.advanceTimersByTime(1200);
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledTimes(3);
    expect(saver.status).toBe('saved');
    expect(saver.getRetryCount()).toBe(0);
  });

  it('marks error status and calls onError when maxRetries exceeded', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Persistent error'));
    const onError = vi.fn();

    const saver = new DebouncedSaver<{ val: number }>({
      onSave,
      onError,
      delay: 400,
      maxRetries: 1,
    });

    saver.queue({ val: 1 });
    saver.queue({ val: 2 });

    // Initial attempt after 400ms
    vi.advanceTimersByTime(400);
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(saver.getRetryCount()).toBe(1);

    // 1st retry after 600ms
    vi.advanceTimersByTime(600);
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(saver.status).toBe('error');
    expect(onError).toHaveBeenCalled();
  });

  it('flushes pending changes immediately on flush()', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const saver = new DebouncedSaver<{ val: number }>({
      onSave,
      delay: 1000,
    });

    saver.queue({ val: 1 });
    saver.queue({ val: 99 });

    expect(onSave).not.toHaveBeenCalled();

    await saver.flush({ val: 99 });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ val: 99 });
    expect(saver.status).toBe('saved');
  });
});
