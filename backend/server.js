require("dotenv").config({ path: require("node:path").join(__dirname, ".env") });

const cors = require("cors");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const dns = require("node:dns");
const net = require("node:net");

const app = express();
const port = Number(process.env.PORT || 5000);
const isProduction =
  ["production", "prod"].includes(
    (process.env.NODE_ENV || "").trim().toLowerCase(),
  ) ||
  (process.env.RENDER || "").trim().toLowerCase() === "true" ||
  ["production", "prod"].includes(
    (process.env.APP_ENV || "").trim().toLowerCase(),
  );
const receiverEmail = (process.env.RECEIVER_EMAIL || "").trim();
const resendApiKey = (process.env.RESEND_API_KEY || "").trim();
const emailFrom = (process.env.EMAIL_FROM || "").trim();

function isEmailAddress(value) {
  return (
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) &&
    !/^(your|replace|change|insert)/i.test(value) &&
    !/@example\.(com|org|net)$/i.test(value)
  );
}

function isPlaceholderSecret(value) {
  return /^(replace|change|insert|your)[-_ ]/i.test(value);
}

const missingEmailConfiguration = [];
if (!resendApiKey || isPlaceholderSecret(resendApiKey)) {
  missingEmailConfiguration.push("RESEND_API_KEY");
}
const emailFromAddress = emailFrom.match(/<([^<>]+)>/)?.[1] || emailFrom;
if (!isEmailAddress(emailFromAddress)) {
  missingEmailConfiguration.push("EMAIL_FROM");
}
if (!isEmailAddress(receiverEmail)) {
  missingEmailConfiguration.push("RECEIVER_EMAIL");
}
const emailConfigured = missingEmailConfiguration.length === 0;
const allowedOrigins = process.env.FRONTEND_ORIGIN
  ? process.env.FRONTEND_ORIGIN.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : isProduction
    ? []
    : ["http://localhost:8501"];
const submissions = new Map();
const submissionTtlMs = 24 * 60 * 60 * 1000;
let emailTransportStatus = emailConfigured ? "configured" : "not_configured";
let emailTransportFailureCode = null;
let emailTransportFailureStage = null;
const smtpConnectivity = {
  dns: { status: "checking" },
  port465: { status: "checking" },
  port587: { status: "checking" },
};

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("PORT must be an integer between 1 and 65535.");
  process.exit(1);
}

if (isProduction && allowedOrigins.length === 0) {
  console.error("FRONTEND_ORIGIN must be configured in production.");
  process.exit(1);
}

if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

function logMailTransportFailure(stage, error) {
  const code = typeof error?.code === "string" ? error.code : "unknown";
  const category = isEmailAuthenticationFailure(error)
    ? "authentication"
    : isEmailTimeoutFailure(error)
      ? "timeout"
      : code === "ECONNECTION" || code === "EDNS"
        ? "connection"
        : "provider";
  console.error(
    `Email provider ${stage} failed (provider=resend category=${category} code=${code}).`,
  );
}

function isEmailAuthenticationFailure(error) {
  return error?.code === "EAUTH";
}

function isEmailTimeoutFailure(error) {
  return error?.code === "ETIMEDOUT";
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      redirect: "error",
      signal: controller.signal,
    });
    let body;
    try {
      body = await response.json();
    } catch {
      const responseError = new Error("Email provider returned invalid JSON.");
      responseError.code = "INVALID_PROVIDER_RESPONSE";
      throw responseError;
    }
    return { response, body };
  } catch (error) {
    if (controller.signal.aborted) {
      const timeoutError = new Error("Email provider request timed out.");
      timeoutError.code = "ETIMEDOUT";
      throw timeoutError;
    }
    if (typeof error?.code === "string") {
      throw error;
    }
    const connectionError = new Error("Email provider connection failed.");
    connectionError.code = "ECONNECTION";
    throw connectionError;
  } finally {
    clearTimeout(timer);
  }
}

function probeSmtpPort(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "smtp.gmail.com", port });
    const timer = setTimeout(() => {
      finish({ status: "timeout", code: "ETIMEDOUT" });
    }, 3000);
    let settled = false;

    function finish(result) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    }

    socket.once("connect", () => finish({ status: "connected" }));
    socket.once("error", (error) =>
      finish({
        status: "failed",
        code: typeof error.code === "string" ? error.code : "unknown",
      }),
    );
  });
}

function checkSmtpConnectivity() {
  const dnsTimer = setTimeout(() => {
    smtpConnectivity.dns = { status: "timeout" };
  }, 3000);
  dns.lookup("smtp.gmail.com", { all: true }, (error, addresses) => {
    clearTimeout(dnsTimer);
    if (error) {
      smtpConnectivity.dns = {
        status: "failed",
        code: typeof error.code === "string" ? error.code : "unknown",
      };
      return;
    }
    smtpConnectivity.dns = {
      status: "resolved",
      addressCount: addresses.length,
    };
  });

  probeSmtpPort(465).then((result) => {
    smtpConnectivity.port465 = result;
  });
  probeSmtpPort(587).then((result) => {
    smtpConnectivity.port587 = result;
  });
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS origin denied"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    optionsSuccessStatus: 204,
  }),
);
app.use(express.json({ limit: "10kb" }));

const contactRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    ok: false,
    message: "Too many messages were submitted. Please try again later.",
  },
});

function cleanText(value, maxLength, required = false, multiline = false) {
  if (value === undefined || value === null) {
    return required ? null : "";
  }
  if (typeof value !== "string") {
    return null;
  }

  const withoutControls = value
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n");
  const cleaned = multiline
    ? withoutControls.trim()
    : withoutControls.replace(/\s+/g, " ").trim();

  if (cleaned.length > maxLength || (required && cleaned.length === 0)) {
    return null;
  }
  return cleaned;
}

function validateContact(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "A JSON object is required." };
  }

  const submissionId =
    typeof body.submissionId === "string" &&
    /^[a-f0-9]{32}$/i.test(body.submissionId)
      ? body.submissionId
      : null;
  const name = cleanText(body.name, 120, true);
  const email = cleanText(body.email, 254, true);
  const phone = cleanText(body.phone, 40);
  const organization = cleanText(body.organization, 160);
  const subject = cleanText(body.subject, 160, true);
  const message = cleanText(body.message, 5000, true, true);

  if (!submissionId) {
    return { error: "A valid submission identifier is required." };
  }
  if (!name || !email || !subject || !message) {
    return { error: "Name, email, subject, and message are required." };
  }
  if (phone === null || organization === null) {
    return { error: "Phone or organization exceeds the allowed length." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }

  return {
    value: { submissionId, name, email, phone, organization, subject, message },
  };
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateRentalRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "A JSON object is required." };
  }

  const submissionId =
    typeof body.submissionId === "string" &&
    /^[a-f0-9]{32}$/i.test(body.submissionId)
      ? body.submissionId
      : null;
  const name = cleanText(body.name, 120, true);
  const department = cleanText(body.department, 160, true);
  const contact = cleanText(body.contact, 254, true);
  const item = cleanText(body.item, 160, true);
  const purpose = cleanText(body.purpose, 3000, true, true);

  if (!submissionId) {
    return { error: "A valid submission identifier is required." };
  }
  if (!name || !department || !contact || !item || !purpose) {
    return {
      error:
        "Name, department, contact details, requested component, and purpose are required.",
    };
  }
  if (
    typeof body.quantity !== "number" ||
    !Number.isInteger(body.quantity) ||
    body.quantity < 1 ||
    body.quantity > 1000
  ) {
    return { error: "Quantity must be a whole number between 1 and 1000." };
  }
  if (!isIsoDate(body.requiredDate) || !isIsoDate(body.returnDate)) {
    return { error: "Enter valid required and return dates." };
  }
  if (body.returnDate <= body.requiredDate) {
    return { error: "The return date must be later than the required date." };
  }

  return {
    value: {
      submissionId,
      name,
      department,
      contact,
      item,
      quantity: body.quantity,
      requiredDate: body.requiredDate,
      returnDate: body.returnDate,
      purpose,
    },
  };
}

function pruneSubmissions(now) {
  for (const [id, entry] of submissions) {
    if (entry.expiresAt <= now) {
      submissions.delete(id);
    }
  }
}

async function sendProviderEmail(idempotencyKey, email) {
  const { response, body } = await fetchWithTimeout(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(email),
    },
    8000,
  );
  if (response.status === 401 || response.status === 403) {
    const error = new Error("Email provider authentication failed.");
    error.code = "EAUTH";
    error.deliveryUncertain = false;
    throw error;
  }
  if (!response.ok) {
    const error = new Error("Email provider rejected the message.");
    error.code = `HTTP_${response.status}`;
    error.deliveryUncertain =
      response.status < 500 &&
      response.status !== 408 &&
      response.status !== 409;
    throw error;
  }
  if (typeof body?.id !== "string" || !body.id) {
    const error = new Error("Email provider did not confirm message acceptance.");
    error.code = "INVALID_PROVIDER_RESPONSE";
    throw error;
  }
}

async function sendContactEmail(contact, submissionId) {
  const timestamp = new Date().toISOString();
  await sendProviderEmail(`contact/${submissionId}`, {
    from: emailFrom,
    to: [receiverEmail],
    reply_to: contact.email,
    subject: `IDEA Lab contact: ${contact.subject}`,
    text: [
      "A new message was submitted through the IDEA Lab contact form.",
      "",
      `Timestamp: ${timestamp}`,
      `Name: ${contact.name}`,
      `Email: ${contact.email}`,
      `Phone: ${contact.phone || "Not provided"}`,
      `Organization: ${contact.organization || "Not provided"}`,
      `Subject: ${contact.subject}`,
      "",
      "Message:",
      contact.message,
    ].join("\n"),
  });
}

async function sendRentalRequestEmail(rentalRequest, submissionId) {
  const timestamp = new Date().toISOString();
  await sendProviderEmail(`rental-request/${submissionId}`, {
    from: emailFrom,
    to: [receiverEmail],
    subject: `IDEA Lab rental request: ${rentalRequest.item}`,
    text: [
      "A component or machine rental request was submitted through the IDEA Lab website.",
      "",
      `Timestamp: ${timestamp}`,
      `Name: ${rentalRequest.name}`,
      `Department: ${rentalRequest.department}`,
      `Contact details: ${rentalRequest.contact}`,
      `Component or machine: ${rentalRequest.item}`,
      `Quantity requested: ${rentalRequest.quantity}`,
      `Required date: ${rentalRequest.requiredDate}`,
      `Return date: ${rentalRequest.returnDate}`,
      "",
      "Purpose:",
      rentalRequest.purpose,
      "",
      "This request is pending administrator confirmation. Availability is not confirmed.",
    ].join("\n"),
  });
}

async function sendEmailOnce(submissionKey, sendEmail) {
  const now = Date.now();
  pruneSubmissions(now);

  const existing = submissions.get(submissionKey);
  if (existing) {
    return existing.promise;
  }

  const promise = sendEmail().catch((error) => {
    if (error?.deliveryUncertain === false) {
      submissions.delete(submissionKey);
    }
    throw error;
  });
  submissions.set(submissionKey, {
    expiresAt: now + submissionTtlMs,
    promise,
  });
  return promise;
}

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    emailConfigured,
    emailApiKeyConfigured: !missingEmailConfiguration.includes("RESEND_API_KEY"),
    missingEmailConfiguration,
    emailProvider: "resend",
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    smtpConnectivity,
    emailTransportStatus,
    emailTransportFailureCode,
    emailTransportFailureStage,
  });
});

app.post("/api/contact", contactRateLimit, async (request, response) => {
  const validated = validateContact(request.body);
  if (validated.error) {
    response.status(400).json({ ok: false, message: validated.error });
    return;
  }
  if (!emailConfigured) {
    response.status(503).json({
      ok: false,
      message: `Contact email is unavailable. Configure valid backend variable(s): ${missingEmailConfiguration.join(", ")}.`,
      missingConfiguration: missingEmailConfiguration,
    });
    return;
  }
  if (emailTransportStatus === "authentication_failed") {
    response.status(503).json({
      ok: false,
      message:
        "The email provider rejected the server credentials. The site administrator must update the backend email settings.",
    });
    return;
  }

  try {
    await sendEmailOnce(
      `contact/${validated.value.submissionId}`,
      () =>
        sendContactEmail(
          validated.value,
          validated.value.submissionId,
        ),
    );
    emailTransportStatus = "ready";
    emailTransportFailureCode = null;
    emailTransportFailureStage = null;
    response.status(200).json({
      ok: true,
      message: "Your message was accepted for sending.",
    });
  } catch (error) {
    logMailTransportFailure("send", error);
    emailTransportStatus = isEmailAuthenticationFailure(error)
      ? "authentication_failed"
      : "unavailable";
    emailTransportFailureCode =
      typeof error?.code === "string" ? error.code : "unknown";
    emailTransportFailureStage = "send";
    if (isEmailAuthenticationFailure(error)) {
      response.status(503).json({
        ok: false,
        message:
          "The email provider rejected the server credentials. The site administrator must update the backend email settings.",
      });
      return;
    }
    const timedOut = isEmailTimeoutFailure(error);
    response.status(timedOut ? 504 : 502).json({
      ok: false,
      message: timedOut
        ? "The email provider did not confirm the message before timing out. Delivery is uncertain, so this submission will not be retried automatically. Check the Resend dashboard and Render backend logs before deciding whether to submit again."
        : "The email provider could not accept the message. Please try again later.",
    });
  }
});

app.post("/api/rental-request", contactRateLimit, async (request, response) => {
  const validated = validateRentalRequest(request.body);
  if (validated.error) {
    response.status(400).json({ ok: false, message: validated.error });
    return;
  }
  if (!emailConfigured) {
    response.status(503).json({
      ok: false,
      message: `Rental request email is unavailable. Configure valid backend variable(s): ${missingEmailConfiguration.join(", ")}.`,
      missingConfiguration: missingEmailConfiguration,
    });
    return;
  }
  if (emailTransportStatus === "authentication_failed") {
    response.status(503).json({
      ok: false,
      message:
        "The email provider rejected the server credentials. The site administrator must update the backend email settings.",
    });
    return;
  }

  try {
    await sendEmailOnce(
      `rental-request/${validated.value.submissionId}`,
      () =>
        sendRentalRequestEmail(
          validated.value,
          validated.value.submissionId,
        ),
    );
    emailTransportStatus = "ready";
    emailTransportFailureCode = null;
    emailTransportFailureStage = null;
    response.status(200).json({
      ok: true,
      message:
        "Your request email was accepted by the email provider. The request is pending administrator confirmation; availability is not confirmed.",
    });
  } catch (error) {
    logMailTransportFailure("rental request send", error);
    emailTransportStatus = isEmailAuthenticationFailure(error)
      ? "authentication_failed"
      : "unavailable";
    emailTransportFailureCode =
      typeof error?.code === "string" ? error.code : "unknown";
    emailTransportFailureStage = "send";
    if (isEmailAuthenticationFailure(error)) {
      response.status(503).json({
        ok: false,
        message:
          "The email provider rejected the server credentials. The site administrator must update the backend email settings.",
      });
      return;
    }
    const timedOut = isEmailTimeoutFailure(error);
    response.status(timedOut ? 504 : 502).json({
      ok: false,
      message: timedOut
        ? "The email provider did not confirm the request before timing out. Delivery is uncertain, so this submission will not be retried automatically. Check the Resend dashboard and Render backend logs before deciding whether to submit again."
        : "The email provider could not accept the request. Please try again later.",
    });
  }
});

app.use((_request, response) => {
  response.status(404).json({ ok: false, message: "Endpoint not found." });
});

app.use((error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  if (error.type === "entity.too.large") {
    response.status(413).json({ ok: false, message: "Request body is too large." });
    return;
  }
  if (error.type === "entity.parse.failed") {
    response.status(400).json({ ok: false, message: "Request body must be valid JSON." });
    return;
  }
  if (error.message === "CORS origin denied") {
    response.status(403).json({ ok: false, message: "Origin is not allowed." });
    return;
  }

  console.error(
    "Unhandled API request error:",
    error instanceof Error ? error.name : "UnknownError",
  );
  response.status(500).json({ ok: false, message: "An unexpected server error occurred." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`IDEA Lab contact API listening on port ${port}.`);
  checkSmtpConnectivity();
  if (!emailConfigured) {
    console.warn(
      `Email is not configured. Missing or invalid backend variable(s): ${missingEmailConfiguration.join(", ")}.`,
    );
    return;
  }
});
