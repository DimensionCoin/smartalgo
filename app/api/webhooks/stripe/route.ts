// app/api/webhooks/stripe/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { connect } from "@/db";
import User from "@/modals/user.modal";

export const runtime = "nodejs";

// You’re intentionally on the preview API version
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2025-07-30.basil",
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET as string;

/* ------------------------- Plan mapping ------------------------- */

function tierForPrice(
  priceId?: string | null
): { tier: "free" | "basic"; credits: number } | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_BASIC) {
    return { tier: "basic", credits: 200 };
  }
  return null;
}

/* ------------------ Safe extractors (no `any`) ------------------ */

/** Get `customerId` from an object that may have `customer` as string or object */
function customerIdFromUnknown(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const maybe = obj as Record<string, unknown>;
  const c = maybe["customer"];
  if (!c) return null;
  if (typeof c === "string") return c;
  if (typeof c === "object" && c !== null) {
    const id = (c as Record<string, unknown>)["id"];
    return typeof id === "string" ? id : null;
  }
  return null;
}

/** From Checkout Session (expanded), read first line item’s price id */
function priceIdFromSessionUnknown(session: unknown): string | null {
  if (!session || typeof session !== "object") return null;
  const s = session as Record<string, unknown>;
  const lineItems = s["line_items"];
  if (!lineItems || typeof lineItems !== "object") return null;

  const data = (lineItems as Record<string, unknown>)["data"];
  if (!Array.isArray(data) || data.length === 0) return null;

  const first = data[0] as unknown;
  if (!first || typeof first !== "object") return null;

  const firstObj = first as Record<string, unknown>;
  const price = firstObj["price"];
  if (price && typeof price === "object") {
    const id = (price as Record<string, unknown>)["id"];
    if (typeof id === "string") return id;
  }

  // legacy fallback: plan.id
  const plan = firstObj["plan"];
  if (plan && typeof plan === "object") {
    const id = (plan as Record<string, unknown>)["id"];
    if (typeof id === "string") return id;
  }

  return null;
}

/** From Invoice lines (expanded by Stripe in webhook), read first line’s price id */
function priceIdFromInvoiceUnknown(invoice: unknown): string | null {
  if (!invoice || typeof invoice !== "object") return null;
  const inv = invoice as Record<string, unknown>;
  const lines = inv["lines"];
  if (!lines || typeof lines !== "object") return null;

  const data = (lines as Record<string, unknown>)["data"];
  if (!Array.isArray(data) || data.length === 0) return null;

  const first = data[0] as unknown;
  if (!first || typeof first !== "object") return null;

  const firstObj = first as Record<string, unknown>;
  const price = firstObj["price"];
  if (price && typeof price === "object") {
    const id = (price as Record<string, unknown>)["id"];
    if (typeof id === "string") return id;
  }

  // legacy fallback: plan.id
  const plan = firstObj["plan"];
  if (plan && typeof plan === "object") {
    const id = (plan as Record<string, unknown>)["id"];
    if (typeof id === "string") return id;
  }

  return null;
}

/**
 * Subscription id from invoice:
 *  - preview shape: invoice.subscription_details.subscription
 *  - classic shape: invoice.subscription (string or object with id)
 */
function subscriptionIdFromInvoiceUnknown(invoice: unknown): string | null {
  if (!invoice || typeof invoice !== "object") return null;
  const inv = invoice as Record<string, unknown>;

  // Preview field
  const subscriptionDetails = inv["subscription_details"];
  if (subscriptionDetails && typeof subscriptionDetails === "object") {
    const sub = (subscriptionDetails as Record<string, unknown>)[
      "subscription"
    ];
    if (typeof sub === "string" && sub) return sub;
  }

  // Classic `subscription`
  const sub = inv["subscription"];
  if (typeof sub === "string") return sub;
  if (sub && typeof sub === "object") {
    const id = (sub as Record<string, unknown>)["id"];
    if (typeof id === "string") return id;
  }

  return null;
}

/* ----------------------------- Handler ----------------------------- */

export async function POST(req: NextRequest) {
  try {
    await connect();

    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return NextResponse.json(
        { error: "Missing Stripe signature" },
        { status: 400 }
      );
    }

    // Node runtime + App Router: raw text
    const rawBody = await req.text();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Unknown signature error";
      console.error("❌ Webhook signature verification failed:", msg);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    switch (event.type) {
      /* ------------------------ checkout completed ------------------------ */
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // Re-retrieve with expansion for line_items.price
        const full = (await stripe.checkout.sessions.retrieve(session.id, {
          expand: ["line_items.data.price", "customer"],
        })) as unknown;

        const customerId = customerIdFromUnknown(full);
        const priceId = priceIdFromSessionUnknown(full);
        const userId = (session.metadata?.userId as string | undefined) ?? null;

        if (!customerId || !priceId || !userId) {
          console.error("❌ Missing required checkout data", {
            customerId,
            priceId,
            userId,
          });
          return NextResponse.json(
            { error: "Missing required data" },
            { status: 400 }
          );
        }

        const plan = tierForPrice(priceId);
        if (!plan) {
          console.error("❌ Unknown price id in checkout:", priceId);
          return NextResponse.json(
            { error: "Unknown price id" },
            { status: 400 }
          );
        }

        const updated = await User.findOneAndUpdate(
          { clerkId: userId },
          { subscriptionTier: plan.tier, customerId, credits: plan.credits },
          { new: true }
        );

        if (!updated) {
          return NextResponse.json(
            { error: "User not found" },
            { status: 400 }
          );
        }

        console.log(
          `✅ Upgraded ${updated.email} to ${plan.tier} (${plan.credits} credits)`
        );
        break;
      }

      /* ----------------------- invoice paid (renewal) ---------------------- */
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;

        // Try to get price directly from invoice lines
        let priceId = priceIdFromInvoiceUnknown(invoice);

        // Fallback: pull from subscription if not present on lines
        if (!priceId) {
          const subId = subscriptionIdFromInvoiceUnknown(invoice);
          if (subId) {
            const sub = await stripe.subscriptions.retrieve(subId, {
              expand: ["items.data.price"],
            });
            const items = sub.items?.data ?? [];
            const first = items[0];
            const maybeId =
              (first?.price as Stripe.Price | undefined)?.id ??
              // defensive legacy fallback:
              (first?.plan as unknown as { id?: string } | undefined)?.id ??
              null;
            priceId = maybeId ?? null;
          }
        }

        const customerId = customerIdFromUnknown(invoice);
        if (!priceId || !customerId) {
          console.error(
            "❌ Missing price/customer on invoice.payment_succeeded",
            {
              priceId,
              customerId,
            }
          );
          return NextResponse.json(
            { error: "Missing price/customer" },
            { status: 400 }
          );
        }

        const plan = tierForPrice(priceId);
        if (!plan) {
          console.error("❌ Unknown price id on renewal:", priceId);
          return NextResponse.json(
            { error: "Unknown price id" },
            { status: 400 }
          );
        }

        const updated = await User.findOneAndUpdate(
          { customerId },
          { subscriptionTier: plan.tier, credits: plan.credits },
          { new: true }
        );

        if (!updated) {
          return NextResponse.json(
            { error: "User not found" },
            { status: 400 }
          );
        }

        console.log(
          `✅ Renewed ${updated.email} on ${plan.tier} (${plan.credits} credits)`
        );
        break;
      }

      /* ------------------ subscription canceled (downgrade) ---------------- */
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id;

        const updated = await User.findOneAndUpdate(
          { customerId },
          { subscriptionTier: "free", credits: 10 },
          { new: true }
        );

        if (!updated) {
          return NextResponse.json(
            { error: "User not found" },
            { status: 400 }
          );
        }

        console.log(`✅ Downgraded ${updated.email} to free tier`);
        break;
      }

      /* ------------------------ payment failed (mark free) ----------------- */
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = customerIdFromUnknown(invoice);
        if (!customerId) break;

        const updated = await User.findOneAndUpdate(
          { customerId },
          { subscriptionTier: "free" }, // keep or reset credits as you prefer
          { new: true }
        );

        if (!updated) {
          console.error("❌ User not found for failed payment:", customerId);
          return NextResponse.json(
            { error: "User not found" },
            { status: 400 }
          );
        }

        console.log(
          `⚠️ Payment failed; ${updated.email} set to free (credits kept: ${updated.credits})`
        );
        break;
      }

      // Optional: useful during development, no state change
      case "invoice.created":
      case "customer.subscription.created":
        break;

      default:
        // other events ignored
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("❌ Webhook error:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
