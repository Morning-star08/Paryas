const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { createClient } = require("@supabase/supabase-js");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const ROOT_INDEX = path.join(ROOT, "prayas (1).html");
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "waitlist.json");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY);

const supabase = USE_SUPABASE
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]", "utf8");
  }
}

function readWaitlist() {
  ensureDataFile();

  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeWaitlist(entries) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), "utf8");
}

async function getWaitlistCount() {
  if (!USE_SUPABASE) {
    return readWaitlist().length;
  }

  const { count, error } = await supabase
    .from("waitlist_entries")
    .select("*", { count: "exact", head: true });

  if (error) {
    throw error;
  }

  return count || 0;
}

async function findDuplicateEntry(email, whatsapp) {
  if (!USE_SUPABASE) {
    const entries = readWaitlist();
    return entries.find((entry) =>
      (email && entry.email === email) || (whatsapp && entry.whatsapp === whatsapp)
    ) || null;
  }

  const filters = [];

  if (email) {
    filters.push(`email.eq.${email}`);
  }

  if (whatsapp) {
    filters.push(`whatsapp.eq.${whatsapp}`);
  }

  if (filters.length === 0) {
    return null;
  }

  const { data, error } = await supabase
    .from("waitlist_entries")
    .select("id,email,whatsapp")
    .or(filters.join(","))
    .limit(1)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  return data || null;
}

async function createWaitlistEntry(record) {
  if (!USE_SUPABASE) {
    const entries = readWaitlist();
    const localRecord = {
      id: `prayas_${Date.now()}`,
      ...record,
      createdAt: new Date().toISOString()
    };

    entries.push(localRecord);
    writeWaitlist(entries);
    return entries.length;
  }

  const payload = {
    name: record.name,
    email: record.email || null,
    whatsapp: record.whatsapp || null,
    preferred_contact: record.preferredContact,
    source: record.source
  };

  const { error } = await supabase
    .from("waitlist_entries")
    .insert(payload);

  if (error) {
    throw error;
  }

  return getWaitlistCount();
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  response.end(JSON.stringify(payload));
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}

function sendFile(response, filePath) {
  fs.readFile(filePath, (error, file) => {
    if (error) {
      sendJson(response, 500, { error: "Could not load the requested file." });
      return;
    }

    response.writeHead(200, { "Content-Type": getContentType(filePath) });
    response.end(file);
  });
}

function tryServeStatic(urlPath, response) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const requestedPath = safePath === path.sep ? "" : safePath.replace(/^[/\\]/, "");
  const filePath = path.join(PUBLIC_DIR, requestedPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(response, 403, { error: "Forbidden." });
    return true;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }

  sendFile(response, filePath);
  return true;
}

function normalizePhone(value) {
  return String(value || "").replace(/[^\d+]/g, "").trim();
}

function collectBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Payload too large"));
        request.destroy();
      }
    });

    request.on("end", () => resolve(raw));
    request.on("error", reject);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    sendFile(response, ROOT_INDEX);
    return;
  }

  if (request.method === "GET" && tryServeStatic(url.pathname, response)) {
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/waitlist/count") {
    try {
      const count = await getWaitlistCount();
      sendJson(response, 200, { count, mode: USE_SUPABASE ? "supabase" : "local" });
    } catch (error) {
      console.error("Waitlist count error:", error);
      sendJson(response, 500, { error: "Could not load the waitlist count." });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/waitlist") {
    try {
      const rawBody = await collectBody(request);
      const body = rawBody ? JSON.parse(rawBody) : {};

      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const whatsapp = normalizePhone(body.whatsapp);
      const preferredContact = String(body.preferredContact || "email").trim().toLowerCase();

      if (!name) {
        sendJson(response, 400, { error: "Name is required." });
        return;
      }

      if (!email && !whatsapp) {
        sendJson(response, 400, { error: "Please provide an email address or WhatsApp number." });
        return;
      }

      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        sendJson(response, 400, { error: "Email address is not valid." });
        return;
      }

      if (whatsapp && !/^\+?\d{8,15}$/.test(whatsapp)) {
        sendJson(response, 400, { error: "WhatsApp number should be 8 to 15 digits." });
        return;
      }

      if (!["email", "whatsapp", "both"].includes(preferredContact)) {
        sendJson(response, 400, { error: "Preferred contact method is not valid." });
        return;
      }

      if ((preferredContact === "email" || preferredContact === "both") && !email) {
        sendJson(response, 400, { error: "Email is required for the selected contact preference." });
        return;
      }

      if ((preferredContact === "whatsapp" || preferredContact === "both") && !whatsapp) {
        sendJson(response, 400, { error: "WhatsApp number is required for the selected contact preference." });
        return;
      }

      const duplicate = await findDuplicateEntry(email, whatsapp);

      if (duplicate) {
        const count = await getWaitlistCount();
        sendJson(response, 409, { error: "This email or WhatsApp number is already on the waitlist.", count });
        return;
      }

      const record = {
        name,
        email,
        whatsapp,
        preferredContact,
        source: "landing-page"
      };

      const count = await createWaitlistEntry(record);

      sendJson(response, 201, {
        message: "Waitlist entry created.",
        count,
        mode: USE_SUPABASE ? "supabase" : "local"
      });
    } catch (error) {
      console.error("Waitlist save error:", error);
      sendJson(response, 500, { error: "Could not save the waitlist entry." });
    }
    return;
  }

  sendJson(response, 404, { error: "Not found." });
});

server.listen(PORT, () => {
  if (!USE_SUPABASE) {
    ensureDataFile();
  }

  console.log(
    `Prayas server running at http://localhost:${PORT} using ${USE_SUPABASE ? "Supabase" : "local JSON"} storage`
  );
});
