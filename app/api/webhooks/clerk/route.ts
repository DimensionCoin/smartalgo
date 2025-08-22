// app/api/webhooks/clerk/route.ts
import { Webhook } from "svix";
import { headers } from "next/headers";
import {
  clerkClient as clerkClientOrFactory,
  type WebhookEvent,
} from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createUser, type CreateUserInput } from "@/actions/user.actions";

/** Minimal Clerk client shape we need */
type ClerkUsersAPI = {
  updateUser: (
    userId: string,
    data: { publicMetadata?: Record<string, unknown> }
  ) => Promise<unknown>;
};

type ClerkClientLike = {
  users: ClerkUsersAPI;
};

/**
 * Compatibility helper: works whether `clerkClient` is already a client object
 * or a function returning a client.
 */
async function getClerkClient(): Promise<ClerkClientLike> {
  const maybe = clerkClientOrFactory as unknown;
  if (typeof maybe === "function") {
    // older/alt export shape
    return await (maybe as () => Promise<ClerkClientLike>)();
  }
  // current export shape (client object)
  return maybe as ClerkClientLike;
}

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    throw new Error("Please add WEBHOOK_SECRET to .env.local");
  }

  try {
    const h = await headers();
    const svixId = h.get("svix-id");
    const svixTimestamp = h.get("svix-timestamp");
    const svixSignature = h.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return new Response("Error: Missing Svix headers", { status: 400 });
    }

    const body = await req.text();
    const wh = new Webhook(WEBHOOK_SECRET);

    let evt: WebhookEvent;
    try {
      evt = wh.verify(body, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as WebhookEvent;
    } catch (err) {
      console.error("Webhook verification failed:", err);
      return new Response("Invalid webhook signature", { status: 400 });
    }

    const id = evt.data.id as string;
    const eventType = evt.type;

    if (eventType === "user.created") {
      const { email_addresses, first_name, last_name } = evt.data;

      const email = email_addresses?.[0]?.email_address || null;
      if (!email) {
        return NextResponse.json(
          { error: "No email provided" },
          { status: 400 }
        );
      }

      const payload: CreateUserInput = {
        clerkId: id,
        email,
        firstName: first_name || "",
        lastName: last_name || "",
        subscriptionTier: "free",
        customerId: "",
        // credits omitted so your schema default applies
      };

      const newUser = await createUser(payload);

      // ← FIX: get a real client regardless of export shape
      const client = await getClerkClient();
      await client.users.updateUser(id, {
        publicMetadata: { userId: newUser._id },
      });

      return NextResponse.json({ message: "New user created", user: newUser });
    }

    // Ignore other events
    return new Response("", { status: 200 });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
