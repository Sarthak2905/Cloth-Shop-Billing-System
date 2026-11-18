import mongoose from "mongoose";

const counterSchema = new mongoose.Schema({
  _id: { type: String },
  seq: { type: Number, default: 0 },
});

export const Counter =
  mongoose.models.Counter ?? mongoose.model("Counter", counterSchema);

// The next number in a named series. Call it inside a transaction: if the
// transaction fails, the number is not used up.
export async function nextSequence(name, session) {
  const counter = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true, session },
  );
  return counter.seq;
}
