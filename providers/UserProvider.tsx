// providers/UserProvider.tsx
import { ReactNode } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getUser, createUser } from "@/actions/user.actions";
import UserProviderClient from "./UserProviderClient";
import { unstable_noStore as noStore } from "next/cache";

type SubscriptionTier = "free" | "basic";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export default async function UserProvider({
  children,
}: {
  children: ReactNode;
}) {
  noStore();

  const { userId } = await auth();

  // Guest defaults
  if (!userId) {
    console.log("[UserProvider] no userId → guest defaults");
    return (
      <UserProviderClient
        initial={{
          isAuthenticated: false,
          clerkId: "",
          tier: "free",
          credits: 0,
          createdAt: null,
        }}
      >
        {children}
      </UserProviderClient>
    );
  }

  // Try to find the user in Mongo
  let dbUser = await getUser(userId);

  // If not found, self-heal by creating it from Clerk profile
  if (!dbUser) {
    const cu = await currentUser(); // Clerk server API
    const email =
      cu?.emailAddresses?.[0]?.emailAddress?.toLowerCase().trim() ?? "";
    const firstName = cu?.firstName ?? "";
    const lastName = cu?.lastName ?? "";

    // Only create if we actually have an email (your schema requires it)
    if (email) {
      console.log(
        "[UserProvider] self-heal: creating DB user for",
        userId,
        email
      );
      dbUser = await createUser({
        clerkId: userId,
        email,
        firstName,
        lastName,
        subscriptionTier: "free", // or set based on your logic
        // omit credits so schema default (10) applies, or pass credits: 10
      });
    } else {
      console.warn("[UserProvider] cannot self-heal: missing email from Clerk");
    }
  }

  console.log("[UserProvider] final payload:", {
    userId,
    tier: dbUser?.subscriptionTier,
    credits: dbUser?.credits,
    exists: !!dbUser,
  });

  return (
    <UserProviderClient
      initial={{
        isAuthenticated: true,
        clerkId: userId,
        tier: (dbUser?.subscriptionTier as SubscriptionTier) ?? "free",
        credits: dbUser?.credits ?? 0,
        createdAt: dbUser?.createdAt ?? null,
      }}
    >
      {children}
    </UserProviderClient>
  );
}
