interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const TTL = 5 * 60 * 1000;

class DashboardCache {
  private store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() - entry.timestamp > TTL) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  set<T>(key: string, data: T) {
    this.store.set(key, { data, timestamp: Date.now() });
  }

  invalidate(key: string) {
    this.store.delete(key);
  }

  invalidateAll() {
    this.store.clear();
  }
}

export const dashboardCache = new DashboardCache();
