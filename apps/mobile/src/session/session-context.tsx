import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import {
  createSession,
  type PracticeSession,
  type SessionSettings,
} from "@/engine";

type SessionContextValue = {
  session: PracticeSession | null;
  start: (settings: SessionSettings) => PracticeSession;
  replace: (next: PracticeSession) => void;
  clear: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<PracticeSession | null>(null);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      start: (settings) => {
        const next = createSession(settings, `${Date.now()}`);
        setSession(next);
        return next;
      },
      replace: setSession,
      clear: () => setSession(null),
    }),
    [session],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function usePracticeSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("usePracticeSession must be used inside SessionProvider");
  }
  return ctx;
}
