// modals/user.modal.ts
import mongoose, { Schema } from "mongoose";

// Subdocument schema
const CreditHistorySchema = new Schema(
  {
    coin: { type: String, required: true }, // e.g. "SOL"
    strategy: { type: String, required: true }, // e.g. "rsi_macd_bb_v1"
    creditsUsed: { type: Number, required: true, min: 1 },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: true }
);

export type CreditHistoryEntry = mongoose.InferSchemaType<
  typeof CreditHistorySchema
>;

const UserSchema = new Schema(
  {
    clerkId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, index: true },
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },

    subscriptionTier: {
      type: String,
      enum: ["free", "basic"],
      default: "free",
    },
    customerId: { type: String, default: "" },

    // Starter credits live here (default = 10)
    credits: { type: Number, required: true, default: 10 },

    topCoins: { type: [String], default: [] },
    creditHistory: { type: [CreditHistorySchema], default: [] },
  },
  { timestamps: true }
);

// Helpful indexes
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ clerkId: 1 }, { unique: true });
UserSchema.index({ "creditHistory.timestamp": -1 });

export type IUser = mongoose.InferSchemaType<typeof UserSchema>;

// Bootstrap model safely for hot reload/dev
let User: mongoose.Model<IUser>;
try {
  User = mongoose.model<IUser>("User");
} catch {
  User = mongoose.model<IUser>("User", UserSchema);
}

export default User;
