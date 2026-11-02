import { AuditLog } from "../models/AuditLog.js";

// Records who did what. Never put passwords or tokens in `details`.
// `actor` defaults to the logged-in user; pass `actor: null` for anonymous events.
export async function audit(
  req,
  { action, entity = "", entityId = "", details = {}, actor } = {},
) {
  const who = actor === undefined ? req.user : actor;
  try {
    await AuditLog.create({
      userId: who?._id ?? null,
      username: who?.username ?? null,
      action,
      entity,
      entityId: String(entityId ?? ""),
      details,
      ip: req.ip ?? null,
      requestId: req.id ?? null,
    });
  } catch (err) {
    // A problem with the log should not break the action the user asked for.
    console.error("Could not write the audit log", err);
  }
}
