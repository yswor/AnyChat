import { useEffect } from "react";
import { registerBackHandler, unregisterBackHandler } from "../utils/backButtonManager";

export function useBackHandler(handler: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    registerBackHandler(handler);
    return () => {
      unregisterBackHandler(handler);
    };
  }, [active, handler]);
}
