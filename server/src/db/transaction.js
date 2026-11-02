import mongoose from "mongoose";

// Runs `work(session)` as ONE all-or-nothing database transaction.
// MongoDB may run the function again after a temporary conflict, so it must only
// touch the database, and only through the `session` it is given.
export async function runInTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
