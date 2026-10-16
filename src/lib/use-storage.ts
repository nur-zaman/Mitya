import { useEffect, useState } from 'react';
import type { WxtStorageItem } from 'wxt/utils/storage';

/** Subscribes a component to a storage item. Returns undefined until the first read. */
export function useStorageItem<T>(item: WxtStorageItem<T, Record<string, unknown>>): T | undefined {
  const [value, setValue] = useState<T>();

  useEffect(() => {
    let active = true;
    void item.getValue().then((initial) => {
      if (active) setValue(initial);
    });
    const unwatch = item.watch((next) => setValue(next));
    return () => {
      active = false;
      unwatch();
    };
  }, [item]);

  return value;
}
