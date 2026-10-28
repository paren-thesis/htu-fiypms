'use client';

import * as React from 'react';
import { toast } from 'sonner';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface DebouncedSaverOptions<T> {
  onSave: (data: T) => Promise<void>;
  delay?: number;
  maxRetries?: number;
  onStatusChange?: (status: SaveStatus) => void;
  onError?: (err: unknown) => void;
  onSuccess?: () => void;
}

/**
 * Pure debounced saver class handling timer delays, retry backoffs, and status changes.
 * Can be tested in any JS/Node runtime without requiring DOM/testing-library.
 */
export class DebouncedSaver<T> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private lastSavedJson: string | null = null;
  public status: SaveStatus = 'idle';
  public lastSavedAt: Date | null = null;
  public error: Error | null = null;

  constructor(private options: DebouncedSaverOptions<T>) {}

  public queue(data: T): void {
    const json = JSON.stringify(data);
    if (this.lastSavedJson === null) {
      // Baseline initial state; do not trigger an immediate save
      this.lastSavedJson = json;
      return;
    }
    if (json === this.lastSavedJson) return;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.setStatus('saving');

    const delay = this.options.delay ?? 400;
    this.timer = setTimeout(() => {
      this.executeSave(data, 0);
    }, delay);
  }

  public async flush(data: T): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.executeSave(data, 0);
  }

  public async executeSave(data: T, attempt: number): Promise<void> {
    try {
      this.setStatus('saving');
      await this.options.onSave(data);
      this.lastSavedJson = JSON.stringify(data);
      this.lastSavedAt = new Date();
      this.error = null;
      this.retryCount = 0;
      this.setStatus('saved');
      this.options.onSuccess?.();
    } catch (err) {
      const maxRetries = this.options.maxRetries ?? 3;
      if (attempt < maxRetries) {
        this.retryCount = attempt + 1;
        const backoff = Math.min(300 * Math.pow(2, this.retryCount), 3000);
        this.timer = setTimeout(() => {
          this.executeSave(data, this.retryCount);
        }, backoff);
      } else {
        this.error = err instanceof Error ? err : new Error(String(err));
        this.setStatus('error');
        this.options.onError?.(err);
      }
    }
  }

  public setStatus(status: SaveStatus): void {
    this.status = status;
    this.options.onStatusChange?.(status);
  }

  public cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  public getRetryCount(): number {
    return this.retryCount;
  }
}

export interface UseDebouncedSaveOptions<T> {
  data: T;
  onSave: (data: T) => Promise<void>;
  delay?: number;
  maxRetries?: number;
  enabled?: boolean;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

export interface UseDebouncedSaveReturn {
  status: SaveStatus;
  lastSavedAt: Date | null;
  error: Error | null;
  retryCount: number;
  flush: () => Promise<void>;
}

/**
 * React hook for debounced saving with optimistic UI and exponential backoff.
 * Adheres strictly to React 19 compiler rules (no ref reads/writes during render, no self-referential callbacks).
 */
export function useDebouncedSave<T>({
  data,
  onSave,
  delay = 400,
  maxRetries = 3,
  enabled = true,
  onSuccess,
  onError,
}: UseDebouncedSaveOptions<T>): UseDebouncedSaveReturn {
  const [status, setStatus] = React.useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  const [error, setError] = React.useState<Error | null>(null);
  const [retryCount, setRetryCount] = React.useState<number>(0);

  const lastSavedJsonRef = React.useRef<string | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMountRef = React.useRef(true);

  const saveWithRetries = React.useCallback(
    async (targetData: T) => {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          setStatus('saving');
          await onSave(targetData);
          lastSavedJsonRef.current = JSON.stringify(targetData);
          setLastSavedAt(new Date());
          setError(null);
          setRetryCount(0);
          setStatus('saved');
          onSuccess?.();
          return;
        } catch (err) {
          if (attempt < maxRetries) {
            setRetryCount(attempt + 1);
            const backoff = Math.min(300 * Math.pow(2, attempt + 1), 3000);
            await new Promise((resolve) => setTimeout(resolve, backoff));
          } else {
            const saveErr = err instanceof Error ? err : new Error(String(err));
            setError(saveErr);
            setStatus('error');
            toast.error('Failed to sync evaluation scores. Please check your network connection.');
            onError?.(err);
          }
        }
      }
    },
    [maxRetries, onError, onSave, onSuccess]
  );

  React.useEffect(() => {
    if (!enabled) return;

    const json = JSON.stringify(data);
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      lastSavedJsonRef.current = json;
      return;
    }

    if (json === lastSavedJsonRef.current) {
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setStatus('saving');

    timerRef.current = setTimeout(() => {
      saveWithRetries(data);
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [data, delay, enabled, saveWithRetries]);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const flush = React.useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await saveWithRetries(data);
  }, [data, saveWithRetries]);

  return {
    status,
    lastSavedAt,
    error,
    retryCount,
    flush,
  };
}
