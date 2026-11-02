import { randomUUID } from "node:crypto";
import mongoose from "mongoose";

const auditSchema = new mongoose.Schema({
  _id: { type: String, default: () => randomUUID() },
  at: { type: Date, default: Date.now, index: true },
  userId: { type: String, default: null },
  username: { type: String, default: null },
  action: { type: String, required: true, index: true },
  entity: { type: String, default: "" },
  entityId: { type: String, default: "" },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  ip: { type: String, default: null },
  requestId: { type: String, default: null },
});

export const AuditLog =
  mongoose.models.AuditLog ?? mongoose.model("AuditLog", auditSchema);
