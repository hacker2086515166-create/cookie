/**
 * Group Name Locker Bot (Cookie Login Version)
 * Developer: Ayush
 * Fast reset + spam prevention + instant event detect
 */

const login = require("ws3-fca");
const fs = require("fs");
const express = require("express");

// ---------------- COOKIE PARSER ----------------
function parseCookieString(str) {
  return str
    .split(";")
    .map(v => v.trim())
    .filter(Boolean)
    .map(pair => {
      const idx = pair.indexOf("=");
      return {
        key: pair.substr(0, idx),
        value: pair.substr(idx + 1),
        domain: ".facebook.com",
        path: "/",
        httpOnly: true,
        secure: true
      };
    });
}

// ---------------- LOAD COOKIES ----------------
let cookies;
try {
  const raw = fs.readFileSync("cookie.txt", "utf8");
  cookies = parseCookieString(raw);
  console.log("✅ Cookies loaded");
} catch (e) {
  console.error("❌ cookie.txt missing");
  process.exit(1);
}

// ---------------- GROUP CONFIG ----------------
const GROUP_THREAD_ID = "1817176635658370";
const LOCKED_GROUP_NAME = "LOCKED NAME HERE";

// ---------------- STATE VARS ----------------
let lastTitleCheck = {};
let resetTimeout = null;
let isProcessing = false;

// ---------------- EXPRESS KEEP ALIVE ----------------
const app = express();
app.get("/", (req, res) => res.send("Group Locker Bot Alive"));
app.listen(process.env.PORT || 3000);

// ---------------- SAFE SET TITLE ----------------
function safeSetTitle(api, title, threadID, cb) {
  api.setTitle(title, threadID, (err) => {
    if (err) {
      console.error("❌ setTitle error:", err);
      if (cb) cb(err);
    } else {
      console.log("✅ Title set:", title);
      if (cb) cb(null);
    }
  });
}

// ---------------- CHECK + RESET ----------------
function checkAndResetTitle(api, forceCheck = false) {
  if (isProcessing) return;

  const now = Date.now();

  if (!forceCheck && lastTitleCheck[GROUP_THREAD_ID]) {
    if (now - lastTitleCheck[GROUP_THREAD_ID] < 2000) return;
  }

  lastTitleCheck[GROUP_THREAD_ID] = now;

  api.getThreadInfo(GROUP_THREAD_ID, (err, info) => {
    if (err) return;

    const currentName = info?.name || info?.threadName || "";

    if (currentName !== LOCKED_GROUP_NAME) {
      if (resetTimeout) clearTimeout(resetTimeout);

      resetTimeout = setTimeout(() => {
        isProcessing = true;

        api.getThreadInfo(GROUP_THREAD_ID, (err2, info2) => {
          if (err2) {
            isProcessing = false;
            return;
          }

          const verified = info2?.name || info2?.threadName || "";

          if (verified !== LOCKED_GROUP_NAME) {
            safeSetTitle(api, LOCKED_GROUP_NAME, GROUP_THREAD_ID, () => {
              isProcessing = false;
            });
          } else {
            isProcessing = false;
          }
        });

      }, 2000);
    }
  });
}

// ---------------- POLLING FALLBACK ----------------
function startPollingFallback(api, interval = 30000) {
  function loop() {
    checkAndResetTitle(api);
    setTimeout(loop, interval);
  }
  loop();
}

// ---------------- EVENT LISTENER ----------------
function startEventListener(api) {
  api.listenMqtt((err, event) => {
    if (err || !event) return;

    if (event.type === "event" && event.logMessageType) {
      const t = event.logMessageType.toString();

      const nameChange =
        t.includes("thread") &&
        (t.includes("name") || t.includes("title"));

      if (nameChange && event.threadID == GROUP_THREAD_ID) {
        setTimeout(() => checkAndResetTitle(api), 500);
      }
    }
  });
}

// ---------------- LOGIN ----------------
login({ cookies }, (err, api) => {
  if (err) {
    console.error("❌ Login failed:", err);
    return;
  }

  console.log("✅ Cookie login success");

  // save fresh appstate backup
  api.getAppState((err, state) => {
    if (!err) {
      fs.writeFileSync("appstate.json", JSON.stringify(state, null, 2));
      console.log("✅ Backup appstate saved");
    }
  });

  // start bot
  checkAndResetTitle(api, true);
  startEventListener(api);
  startPollingFallback(api, 30000);
});
