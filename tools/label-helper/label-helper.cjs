"use strict";
// Label printer helper. Runs on the shop laptop. The Clothing POS app sends it a label job
// (TSPL commands) and it hands the job to the Windows printer as RAW data, so the Windows
// driver's paper size and orientation do not matter.
//
// Start:  node label-helper.cjs        (or double-click start-label-helper.bat)
// Check:  http://127.0.0.1:9101/health

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");

const PORT = Number(process.env.PORT || 9101);
const DEFAULT_PRINTER = process.env.PRINTER_NAME || "TSC TTP-244 Pro";
// Websites that may use the helper. Add yours with ALLOWED_ORIGINS=https://a.example,https://b.example
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  "http://localhost:5173,http://localhost:5174,https://dhokatecollection-billing-system.onrender.com"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_BODY = 4 * 1024 * 1024;
const SCRIPT = path.join(__dirname, "send-raw.ps1");
const HOSTS = [`127.0.0.1:${PORT}`, `localhost:${PORT}`];

function reply(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

// A browser always sends its Origin. Only the listed websites may use the helper.
function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true; // a tool on this computer (not a website)
    const isLocalApp = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{2,5})?$/.test(
      origin,
    );
    if (!isLocalApp && !ALLOWED_ORIGINS.includes(origin)) return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Access-Control-Max-Age", "600");
  return true;
}

function powershell(args, timeout) {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", ...args],
      { timeout, windowsHide: true },
      (error, stdout, stderr) => {
        if (!error) return resolve(String(stdout));
        const detail =
          String(stderr || error.message)
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find(Boolean) || "Unknown error";
        reject(new Error(detail));
      },
    );
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(
          Object.assign(new Error("The label job is too big"), { status: 413 }),
        );
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const looksLikeLabelJob = (buffer) =>
  buffer.length > 8 && buffer.subarray(0, 5).toString("latin1") === "SIZE ";

const server = http.createServer(async (req, res) => {
  try {
    // Only this computer may talk to the helper by name (protects against DNS tricks).
    if (!HOSTS.includes(String(req.headers.host || "").toLowerCase())) {
      return reply(res, 403, { ok: false, error: "Not allowed" });
    }
    if (!applyCors(req, res)) {
      return reply(res, 403, {
        ok: false,
        error: "This website is not allowed to use the label helper",
      });
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/health") {
      return reply(res, 200, {
        ok: true,
        name: "label-helper",
        printer: DEFAULT_PRINTER,
      });
    }

    if (req.method === "GET" && url.pathname === "/printers") {
      const out = await powershell(
        ["-Command", "Get-Printer | Select-Object -ExpandProperty Name"],
        15000,
      );
      const printers = out
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      return reply(res, 200, { ok: true, printers });
    }

    if (req.method === "POST" && url.pathname === "/print") {
      const printer = (
        url.searchParams.get("printer") || DEFAULT_PRINTER
      ).trim();
      if (!printer || printer.length > 120 || /[\u0000-\u001f]/.test(printer)) {
        return reply(res, 400, {
          ok: false,
          error: "The printer name is not valid",
        });
      }
      const body = await readBody(req);
      if (!looksLikeLabelJob(body)) {
        return reply(res, 400, { ok: false, error: "This is not a label job" });
      }

      const file = path.join(os.tmpdir(), `label-${crypto.randomUUID()}.bin`);
      fs.writeFileSync(file, body);
      try {
        await powershell(
          ["-File", SCRIPT, "-PrinterName", printer, "-FilePath", file],
          30000,
        );
      } finally {
        fs.rmSync(file, { force: true });
      }
      console.log(
        new Date().toLocaleTimeString(),
        `sent ${body.length} bytes to "${printer}"`,
      );
      return reply(res, 200, { ok: true, bytes: body.length, printer });
    }

    return reply(res, 404, { ok: false, error: "Not found" });
  } catch (err) {
    console.error(new Date().toLocaleTimeString(), err.message);
    return reply(res, err.status || 500, { ok: false, error: err.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Label helper running on http://127.0.0.1:${PORT}`);
  console.log(`Printer: ${DEFAULT_PRINTER}`);
  console.log(`Allowed websites: ${ALLOWED_ORIGINS.join(", ")}`);
  console.log("Leave this window open while you print labels.");
});

process.on("uncaughtException", (err) =>
  console.error("Unexpected problem:", err.message),
);
