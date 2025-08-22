// actions/user.actions.ts
"use server";

import User from "@/modals/user.modal";
import { connect } from "@/db";

export async function createUser(user: any) {
  try {
    await connect();
    // You can omit credits here because schema default is 10,
    // but leaving it is fine if you want explicit control.
    const userData = { ...user, credits: user.credits ?? 10 };
    const newUser = await User.create(userData);
    return JSON.parse(JSON.stringify(newUser));
  } catch (error) {
    console.error("❌ Error creating user:", error);
    throw new Error("Error creating user");
  }
}

export async function getUser(userId: string) {
  try {
    await connect();
    const user = await User.findOne({ clerkId: userId });
    return user ? JSON.parse(JSON.stringify(user)) : null;
  } catch (error) {
    console.error("Error fetching user:", error);
    throw new Error("Error fetching user");
  }
}

/**
 * Deduct credits for a backtest and log coin + strategy.
 * Uses a single atomic update to prevent race conditions.
 */
export async function consumeBacktestCredits(
  userId: string,
  amount: number,
  opts: { coin: string; strategy: string }
) {
  try {
    await connect();
    if (amount <= 0) throw new Error("Amount must be > 0");

    const entry = {
      coin: opts.coin,
      strategy: opts.strategy,
      creditsUsed: amount,
      timestamp: new Date(),
    };

    // Atomically ensure enough credits, then deduct and log
    const updated = await User.findOneAndUpdate(
      { clerkId: userId, credits: { $gte: amount } },
      {
        $inc: { credits: -amount },
        $push: {
          creditHistory: {
            $each: [entry],
            $position: 0, // like unshift
            $slice: 50, // keep latest 50
          },
        },
      },
      { new: true }
    );

    if (!updated) throw new Error("User not found or not enough credits");
    return JSON.parse(JSON.stringify(updated));
  } catch (error) {
    console.error("Error consuming backtest credits:", error);
    throw new Error("Error consuming backtest credits");
  }
}

/**
 * Add credits
 */
export async function addCredits(userId: string, amount: number) {
  try {
    await connect();
    if (amount <= 0) throw new Error("Amount must be > 0");

    const updated = await User.findOneAndUpdate(
      { clerkId: userId },
      { $inc: { credits: amount } },
      { new: true }
    );

    if (!updated) throw new Error("User not found");
    return JSON.parse(JSON.stringify(updated));
  } catch (error) {
    console.error("Error adding credits:", error);
    throw new Error("Error adding credits");
  }
}

/**
 * Check available credits
 */
export async function hasEnoughCredits(userId: string, requiredCredits = 1) {
  try {
    await connect();
    const user = await User.findOne(
      { clerkId: userId },
      { credits: 1, _id: 0 }
    );
    if (!user) throw new Error("User not found");
    return user.credits >= requiredCredits;
  } catch (error) {
    console.error("Error checking credits:", error);
    throw new Error("Error checking credits");
  }
}

/**
 * Top coins
 */
export async function getUserTopCoins(userId: string) {
  try {
    await connect();
    const user = await User.findOne(
      { clerkId: userId },
      { topCoins: 1, _id: 0 }
    );
    return user?.topCoins || [];
  } catch (error) {
    console.error("Error fetching user's top coins:", error);
    throw new Error("Error fetching user's top coins");
  }
}

export async function updateUserTopCoins(userId: string, topCoins: string[]) {
  try {
    if (topCoins.length > 3) throw new Error("Only 3 coins can be selected");

    await connect();
    const user = await User.findOneAndUpdate(
      { clerkId: userId },
      { topCoins },
      { new: true, projection: { topCoins: 1 } }
    );
    if (!user) throw new Error("User not found");
    return user.topCoins;
  } catch (error) {
    console.error("Error updating user's top coins:", error);
    throw new Error("Error updating user's top coins");
  }
}
