// providers/UserProviderClient.tsx
"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type SubscriptionTier = "free" | "basic";

type InitialUserState = {
  isAuthenticated: boolean;
  clerkId: string;
  tier: SubscriptionTier;
  credits: number;
  createdAt: string | null;
};

type UserContextType = InitialUserState & {
  isContextLoaded: boolean;
  refreshUser: () => Promise<void>;
};

const UserContext = createContext<UserContextType | null>(null);

export default function UserProviderClient({
  children,
  initial,
}: {
  children: React.ReactNode;
  initial: InitialUserState;
}) {
  const router = useRouter();

  // ⬇️ log once on mount (client) to confirm what the server sent
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[UserProviderClient] initial from server:", initial);
  }, [initial]);

  const [tier, setTier] = useState<SubscriptionTier>(initial.tier);
  const [credits, setCredits] = useState<number>(initial.credits);
  const [createdAt, setCreatedAt] = useState<string | null>(initial.createdAt);
  const [isContextLoaded] = useState<boolean>(true);

  useEffect(() => {
    setTier(initial.tier);
    setCredits(initial.credits);
    setCreatedAt(initial.createdAt);
  }, [initial.tier, initial.credits, initial.createdAt]);

  const refreshUser = async () => {
    router.refresh(); // re-runs the server provider
  };

  const value = useMemo<UserContextType>(
    () => ({
      isAuthenticated: initial.isAuthenticated,
      clerkId: initial.clerkId,
      tier,
      credits,
      createdAt,
      isContextLoaded,
      refreshUser,
    }),
    [
      initial.isAuthenticated,
      initial.clerkId,
      tier,
      credits,
      createdAt,
      isContextLoaded,
    ]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUserContext() {
  const ctx = useContext(UserContext);
  if (!ctx)
    throw new Error("useUserContext must be used within a UserProvider");
  return ctx;
}
