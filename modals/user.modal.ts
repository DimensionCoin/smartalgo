// modals/user.modal.ts
import mongoose, { Schema } from "mongoose";

// ---- Subdocument schema (no generics here) ----
const CreditHistorySchema = new Schema(
  {
    coin: { type: String, required: true }, // e.g. "SOL"
    strategy: { type: String, required: true }, // e.g. "rsi_macd_bb_v1"
    creditsUsed: { type: Number, required: true, min: 1 },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: true }
);

// Infer the TS type from the schema (prevents complex union explosions)
export type CreditHistoryEntry = mongoose.InferSchemaType<
  typeof CreditHistorySchema
>;

// ---- Parent schema (also no generics) ----
const UserSchema = new Schema(
  {
    clerkId: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },

    subscriptionTier: {
      type: String,
      enum: ["free", "basic"],
      default: "free",
    },
    customerId: { type: String, default: "" },
    credits: { type: Number, required: true, default: 10 },
    topCoins: { type: [String], default: [] },

    // Important: default [] so it's always a DocumentArray
    creditHistory: { type: [CreditHistorySchema], default: [] },
  },
  { timestamps: true }
);

// Helpful indexes
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ clerkId: 1 }, { unique: true });
UserSchema.index({ "creditHistory.timestamp": -1 });

export type IUser = mongoose.InferSchemaType<typeof UserSchema>;

// Model bootstrap without extra generics (avoids TS churn)
let User: mongoose.Model<IUser>;
try {
  User = mongoose.model<IUser>("User");
} catch {
  User = mongoose.model<IUser>("User", UserSchema);
}

export default User;
