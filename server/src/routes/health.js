import { Router } from "express";
import mongoose from "mongoose";

export function healthRouter() {
  const router = Router();
  router.get("/", (req, res) => {
    res.json({
      status: "ok",
      database:
        mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      time: new Date().toISOString(),
    });
  });
  return router;
}
