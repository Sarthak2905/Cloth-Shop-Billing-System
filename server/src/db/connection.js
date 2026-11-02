import mongoose from "mongoose";

// Sales need transactions (all-or-nothing saves), and MongoDB only offers them on a
// replica set. MongoDB Atlas always is one.
export async function assertTransactionsSupported() {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  const supported = Boolean(hello.setName) || hello.msg === "isdbgrid";
  if (!supported) {
    throw new Error(
      "This MongoDB server does not support transactions. Use MongoDB Atlas, or run MongoDB as a replica set.",
    );
  }
}

export async function connectDatabase(uri) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  await assertTransactionsSupported();
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
