import { useEffect, useLayoutEffect, useState } from "react";
import type { RefObject } from "react";
import { sysmonStore } from "./store";

export function useStore() {
  const [, tick] = useState(0);
  useEffect(() => sysmonStore.subscribe(() => tick((n) => n + 1)), []);
  return sysmonStore;
}

export function useSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return size;
}
