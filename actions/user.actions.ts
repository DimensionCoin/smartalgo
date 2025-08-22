// actions/user.actions.ts
"use server";

import User, { type IUser } from "@/modals/user.modal";
import { connect } from "@/db";

/** Typed input for creating a user (no `any`) */
export type CreateUserInput = {
  clerkId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  subscriptionTier?: "free" | "basic";
  customerId?: string;
  // credits optional; if omitted, schema default (10) applies
  credits?: number;
};

/**
 * Create (or fetch) a user by clerkId. Safe for webhook retries.
 * Ensures credits default = 10 on first insert (schema also enforces).
 */
export async function createUser(
  user: CreateUserInput
): Promise<IUser & { _id: string }> {
  await connect();

  const doc = await User.findOneAndUpdate(
    { clerkId: user.clerkId },
    {
      $setOnInsert: {
        clerkId: user.clerkId,
        email: user.email,
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        subscriptionTier: user.subscriptionTier ?? "free",
        customerId: user.customerId ?? "",
        credits: user.credits ?? undefined, // if provided, use it; else let schema default
        topCoins: [],
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return JSON.parse(JSON.stringify(doc)) as IUser & { _id: string };
}

/** Fetch by Clerk ID */
export async function getUser(
  userId: string
): Promise<(IUser & { _id: string }) | null> {
  await connect();
  const user = await User.findOne({ clerkId: userId });
  return user
    ? (JSON.parse(JSON.stringify(user)) as IUser & { _id: string })
    : null;
}

/**
 * Deduct credits for a backtest and log coin + strategy.
 * Uses a single atomic update to prevent race conditions.
 */
export async function consumeBacktestCredits(
  userId: string,
  amount: number,
  opts: { coin: string; strategy: string }
): Promise<IUser & { _id: string }> {
  await connect();
  if (amount <= 0) throw new Error("Amount must be > 0");

  const entry = {
    coin: opts.coin,
    strategy: opts.strategy,
    creditsUsed: amount,
    timestamp: new Date(),
  };

  const updated = await User.findOneAndUpdate(
    { clerkId: userId, credits: { $gte: amount } },
    {
      $inc: { credits: -amount },
      $push: {
        creditHistory: {
          $each: [entry],
          $position: 0, // newest first
          $slice: 50, // keep latest 50 entries
        },
      },
    },
    { new: true }
  );

  if (!updated) throw new Error("User not found or not enough credits");
  return JSON.parse(JSON.stringify(updated)) as IUser & { _id: string };
}

/** Add credits */
export async function addCredits(
  userId: string,
  amount: number
): Promise<IUser & { _id: string }> {
  await connect();
  if (amount <= 0) throw new Error("Amount must be > 0");

  const updated = await User.findOneAndUpdate(
    { clerkId: userId },
    { $inc: { credits: amount } },
    { new: true }
  );

  if (!updated) throw new Error("User not found");
  return JSON.parse(JSON.stringify(updated)) as IUser & { _id: string };
}

/** Check available credits */
export async function hasEnoughCredits(
  userId: string,
  requiredCredits = 1
): Promise<boolean> {
  await connect();
  const user = await User.findOne({ clerkId: userId }, { credits: 1, _id: 0 });
  if (!user) throw new Error("User not found");
  return user.credits >= requiredCredits;
}

/** Top coins */
export async function getUserTopCoins(userId: string): Promise<string[]> {
  await connect();
  const user = await User.findOne({ clerkId: userId }, { topCoins: 1, _id: 0 });
  return user?.topCoins ?? [];
}

/** Update top coins (max 3) */
export async function updateUserTopCoins(
  userId: string,
  topCoins: string[]
): Promise<string[]> {
  if (topCoins.length > 3) throw new Error("Only 3 coins can be selected");

  await connect();
  const user = await User.findOneAndUpdate(
    { clerkId: userId },
    { topCoins },
    { new: true, projection: { topCoins: 1 } }
  );

  if (!user) throw new Error("User not found");
  return user.topCoins;
}
