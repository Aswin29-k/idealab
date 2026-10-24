require("dotenv").config({ path: require("node:path").join(__dirname, ".env") });

const cors = require("cors");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const nodemailer = require("nodemailer");

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
const emailUser = (process.env.EMAIL_USER || "").trim();
const emailPassword = (process.env.EMAIL_PASS || "").trim();

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
if (!isEmailAddress(emailUser)) {
  missingEmailConfiguration.push("EMAIL_USER");
}
if (!emailPassword || isPlaceholderSecret(emailPassword)) {
  missingEmailConfiguration.push("EMAIL_PASS");
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
const submissionTtlMs = 30 * 60 * 1000;
let emailTransportStatus = emailConfigured ? "checking" : "not_configured";

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

const transporter = emailConfigured
  ? nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 8000,
      tls: {
        minVersion: "TLSv1.2",
      },
      auth: {
        user: emailUser,
        pass: emailPassword,
      },
    })
  : null;
let emailTransportFailureCode = null;

function logMailTransportFailure(stage, error) {
  const code = typeof error?.code === "string" ? error.code : "unknown";
  const responseCode = Number.isInteger(error?.responseCode)
    ? ` responseCode=${error.responseCode}`
    : "";
  const command =
    typeof error?.command === "string" && /^[A-Z ]{1,24}$/i.test(error.command)
      ? ` command=${error.command}`
      : "";
  let safeMessage = String(error?.message || "Unknown SMTP error")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted-email]");
  for (const secret of new Set([emailPassword, emailUser, receiverEmail])) {
    if (secret) {
      safeMessage = safeMessage.replaceAll(secret, "[redacted]");
    }
  }
  safeMessage = safeMessage.slice(0, 300);
  console.error(
    `Email transport ${stage} failed (code=${code}${responseCode}${command}): ${safeMessage}`,
  );
}

function isEmailAuthenticationFailure(error) {
  return (
    error?.code === "EAUTH" ||
    error?.responseCode === 534 ||
    error?.responseCode === 535
  );
}

function isEmailTimeoutFailure(error) {
  return (
    error?.code === "ETIMEDOUT" ||
    error?.code === "ESOCKET" ||
    (error?.code === "ECONNECTION" &&
      /timed?\s*out|timeout/i.test(String(error?.message || "")))
  );
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

async function sendContactEmail(contact) {
  const timestamp = new Date().toISOString();
  const info = await transporter.sendMail({
    from: emailUser,
    to: receiverEmail,
    replyTo: contact.email,
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

  const accepted = Array.isArray(info.accepted)
    ? info.accepted.some(
        (address) => String(address).toLowerCase() === receiverEmail.toLowerCase(),
      )
    : false;
  if (!accepted) {
    const error = new Error("The recipient was not accepted by the mail server.");
    error.code = "RECIPIENT_NOT_ACCEPTED";
    throw error;
  }
}

async function sendRentalRequestEmail(rentalRequest) {
  const timestamp = new Date().toISOString();
  const info = await transporter.sendMail({
    from: emailUser,
    to: receiverEmail,
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

  const accepted = Array.isArray(info.accepted)
    ? info.accepted.some(
        (address) => String(address).toLowerCase() === receiverEmail.toLowerCase(),
      )
    : false;
  if (!accepted) {
    const error = new Error("The recipient was not accepted by the mail server.");
    error.code = "RECIPIENT_NOT_ACCEPTED";
    throw error;
  }
}

async function sendEmailOnce(submissionId, sendEmail) {
  const now = Date.now();
  pruneSubmissions(now);

  const existing = submissions.get(submissionId);
  if (existing) {
    return existing.promise;
  }

  const promise = sendEmail().catch((error) => {
    if (!isEmailTimeoutFailure(error)) {
      submissions.delete(submissionId);
    }
    throw error;
  });
  submissions.set(submissionId, {
    expiresAt: now + submissionTtlMs,
    promise,
  });
  return promise;
}

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    emailConfigured,
    emailPasswordConfigured: !missingEmailConfiguration.includes("EMAIL_PASS"),
    missingEmailConfiguration,
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    emailTransportStatus,
    emailTransportFailureCode,
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
    await sendEmailOnce(validated.value.submissionId, () =>
      sendContactEmail(validated.value),
    );
    emailTransportStatus = "ready";
    emailTransportFailureCode = null;
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
        ? "The email provider did not confirm the message before timing out. Its delivery status is uncertain; this submission is held temporarily to prevent duplicate emails."
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
    await sendEmailOnce(validated.value.submissionId, () =>
      sendRentalRequestEmail(validated.value),
    );
    emailTransportStatus = "ready";
    emailTransportFailureCode = null;
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
        ? "The email provider did not confirm the request before timing out. Its delivery status is uncertain; this submission is held temporarily to prevent duplicate emails."
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
  if (!emailConfigured) {
    emailTransportStatus = "not_configured";
    console.warn(
      `Email is not configured. Missing or invalid backend variable(s): ${missingEmailConfiguration.join(", ")}.`,
    );
    return;
  }

  transporter.verify().then(
    () => {
      emailTransportStatus = "ready";
      emailTransportFailureCode = null;
      console.log("Email transport verification succeeded.");
    },
    (error) => {
      logMailTransportFailure("verification", error);
      emailTransportStatus = isEmailAuthenticationFailure(error)
        ? "authentication_failed"
        : "unavailable";
      emailTransportFailureCode =
        typeof error?.code === "string" ? error.code : "unknown";
    },
  );
});
