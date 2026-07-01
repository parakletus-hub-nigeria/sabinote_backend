import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

// Minimal interface matching what cache-manager v7 exposes at runtime
interface CacheStore {
  get<T>(key: string): Promise<T | undefined | null>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  reset(): Promise<void>;
}

@Injectable()
export class CacheService {
  private readonly registeredKeys = new Set<string>();

  constructor(@Inject(CACHE_MANAGER) private readonly cache: CacheStore) {}

  /**
   * Returns the cached value for `key` if present, otherwise calls `fn`,
   * stores the result, and returns it. `ttl` is in milliseconds.
   */
  async wrap<T>(key: string, fn: () => Promise<T>, ttl: number): Promise<T> {
    const cached = await this.cache.get<T>(key);
    if (cached !== undefined && cached !== null) return cached;
    const value = await fn();
    await this.cache.set(key, value, ttl);
    this.registeredKeys.add(key);
    return value;
  }

  async del(key: string): Promise<void> {
    await this.cache.del(key);
    this.registeredKeys.delete(key);
  }

  /**
   * Deletes all keys whose names start with `prefix`.
   * Uses an in-process registry so no store-level key scan is needed.
   */
  async delByPrefix(prefix: string): Promise<void> {
    const matching = [...this.registeredKeys].filter((k) => k.startsWith(prefix));
    await Promise.all(matching.map((k) => this.cache.del(k)));
    matching.forEach((k) => this.registeredKeys.delete(k));
  }

  /** Clears the entire cache — use sparingly (admin operations only). */
  async reset(): Promise<void> {
    await this.cache.reset();
    this.registeredKeys.clear();
  }
}
