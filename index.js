/**
 * Group Name Locker Bot - Render Safe Version
 * Developer: Ayush
 */

const login = require("ws3-fca");
const fs = require("fs");
const express = require("express");

// ---------------- GLOBAL ERROR HANDLER ----------------
process.on("unhandledRejection", err => {
  console.error("UNHANDLED REJECTION:", err);
});

process.on("uncaughtException", err => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

// ---------------- COOKIE PARSER ----------------
function parseCookieString(str) {
  return str
    .split(";")
    .map(v => v.trim())
    .filter(Boolean)
    .map(pair => {
      const idx = pair.indexOf("=");
      return {
        key: pair.substring(0, idx),
        value: pair.substring(idx + 1),
        domain: ".facebook.com",
        path: "/",
        httpOnly: true,
        secure: true
      };
    });
}

// ---------------- LOAD COOKIES ----------------
let cookieRaw;

// Priority 1: Render ENV variable
if (process.env.COOKIE) {
  console.log("✅ Using COOKIE from Render ENV");
  cookieRaw = process.env.COOKIE;
}
// Priority 2: cookie.txt file
else {
  try {
    cookieRaw = fs.readFileSync("cookie.txt", "utf8");
    console.log("✅ Using cookie.txt file");
  } catch (e) {
    console.error("❌ No COOKIE provided");
    process.exit(1);
  }
}

const cookies = parseCookieString(cookieRaw);

// ---------------- GROUP CONFIG ----------------
const GROUP_THREAD_ID = "1817176635658370";
const LOCKED_GROUP_NAME = "LOCKED NAME HERE";

// ---------------- STATE ----------------
let lastCheck = 0;
let isProcessing = false;
let resetTimeout = null;

// ---------------- EXPRESS KEEP ALIVE ----------------
const app = express();
app.get("/", (req, res) => res.send("Group Locker Bot Running"));
app.listen(process.env.PORT || 3000);

// ---------------- SAFE TITLE SET ----------------
function safeSetTitle(api, title) {
  api.setTitle(title, GROUP_THREAD_ID, (err) => {
    if (err) {
      console.error("❌ setTitle error:", err);
    } else {
      console.log("✅ Group name locked successfully");
    }
  });
}

// ---------------- CHECK FUNCTION ----------------
function checkAndReset(api, force = false) {
  if (isProcessing) return;

  const now = Date.now();
  if (!force && now - lastCheck < 2000) return;

  lastCheck = now;

  api.getThreadInfo(GROUP_THREAD_ID, (err, info) => {
    if (err || !info) return;

    const current = info.name || info.threadName || "";

    if (current !== LOCKED_GROUP_NAME) {
      console.log("⚠ Name changed, resetting...");

      if (resetTimeout) clearTimeout(resetTimeout);

      resetTimeout = setTimeout(() => {
        isProcessing = true;

        api.getThreadInfo(GROUP_THREAD_ID, (err2, info2) => {
          if (!err2 && info2) {
            const verify = info2.name || info2.threadName || "";
            if (verify !== LOCKED_GROUP_NAME) {
              safeSetTitle(api, LOCKED_GROUP_NAME);
            }
          }
          isProcessing = false;
        });

      }, 2000);
    }
  });
}

// ---------------- EVENT LISTENER ----------------
function startListener(api) {
  api.listenMqtt((err, event) => {
    if (err || !event) return;

    if (event.type === "event" && event.threadID == GROUP_THREAD_ID) {
      if (event.logMessageType &&
          event.logMessageType.includes("thread")) {

        setTimeout(() => checkAndReset(api), 500);
      }
    }
  });
}

// ---------------- LOGIN ----------------
login({ cookies }, (err, api) => {
  if (err) {
    console.error("❌ LOGIN FAILED:", err);
    return;
  }

  console.log("✅ LOGIN SUCCESS");
  console.log("🚀 Group Name Locker Activated");

  checkAndReset(api, true);
  startListener(api);

  setInterval(() => {
    checkAndReset(api);
  }, 30000);
});
