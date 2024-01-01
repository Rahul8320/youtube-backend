import mongoose, { Schema } from "mongoose";

const subscriptionSchema = new Schema(
  {
    // The user who is subscribed to a channel
    subscriber: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    channel: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

export const Subscription = mongoose.model("Subscription", subscriptionSchema);
