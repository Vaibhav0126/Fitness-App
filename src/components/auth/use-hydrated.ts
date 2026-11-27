"use client";
import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** false during SSR and before hydration, true after: keeps JS-only forms from submitting natively. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
