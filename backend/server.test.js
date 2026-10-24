const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { test } = require("node:test");

const backendDirectory = __dirname;
const serverPath = path.join(backendDirectory, "server.js");
const mockPath = path.join(
  backendDirectory,
  "test-support",
  "mock-email-provider.js",
);

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function startBackend(mode) {
  const port = await unusedPort();
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "idealab-contact-api-test-"),
  );
  const sendCountPath = path.join(temporaryDirectory, "send-count.txt");
  const child = spawn(process.execPath, ["--require", mockPath, serverPath], {
    cwd: backendDirectory,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      RENDER: "false",
      APP_ENV: "test",
      FRONTEND_ORIGIN: "http://localhost:8501",
      RESEND_API_KEY: "re_test-key",
      EMAIL_FROM: "IDEA Lab <sender@mock.test>",
      RECEIVER_EMAIL: "test-receiver@mock.test",
      TEST_PROVIDER_MODE: mode,
      TEST_PROVIDER_SEND_COUNT: sendCountPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => (output += chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk) => (output += chunk));
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 10000;

  try {
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`Backend exited early:\n${output}`);
      }
      try {
        const response = await fetch(`${baseUrl}/health`);
        const health = await response.json();
        const expectedStatus = "configured";
        if (response.ok && health.emailTransportStatus === expectedStatus) {
          return {
            baseUrl,
            child,
            sendCountPath,
            get output() {
              return output;
            },
            async close() {
              child.kill();
              await new Promise((resolve) => child.once("exit", resolve));
              fs.rmSync(temporaryDirectory, { recursive: true, force: true });
            },
          };
        }
      } catch {}
      await delay(100);
    }
    throw new Error(`Backend did not become ready:\n${output}`);
  } catch (error) {
    child.kill();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

function contactPayload(submissionId = "1234567890abcdef1234567890abcdef") {
  return {
    submissionId,
    name: "Test Sender",
    email: "sender@mock.test",
    phone: "",
    organization: "Test Organization",
    subject: "Automated contact test",
    message: "This message is sent only to a mocked SMTP transport.",
  };
}

async function postContact(baseUrl, payload = contactPayload()) {
  const response = await fetch(`${baseUrl}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json() };
}

test("health endpoint returns immediately without claiming an unverified provider is ready", async () => {
  const backend = await startBackend("success");
  try {
    const response = await fetch(`${backend.baseUrl}/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/json/);
    assert.equal(body.ok, true);
    assert.equal(body.emailProvider, "resend");
    assert.equal(body.emailTransportStatus, "configured");
    assert.equal(body.emailTransportFailureCode, null);
    assert.equal(body.emailTransportFailureStage, null);
    assert.deepEqual(Object.keys(body.smtpConnectivity).sort(), [
      "dns",
      "port465",
      "port587",
    ]);
  } finally {
    await backend.close();
  }
});

test("contact endpoint preserves email content and uses provider idempotency", async () => {
  const backend = await startBackend("success");
  try {
    const result = await postContact(backend.baseUrl);
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    const sent = JSON.parse(
      fs.readFileSync(backend.sendCountPath, "utf8").trim(),
    );
    assert.equal(sent.idempotencyKey, "contact/1234567890abcdef1234567890abcdef");
    assert.equal(sent.body.from, "IDEA Lab <sender@mock.test>");
    assert.deepEqual(sent.body.to, ["test-receiver@mock.test"]);
    assert.equal(sent.body.reply_to, "sender@mock.test");
    assert.equal(sent.body.subject, "IDEA Lab contact: Automated contact test");
    assert.match(sent.body.text, /This message is sent only to a mocked SMTP transport\./);
  } finally {
    await backend.close();
  }
});

test("rental requests retain their email content and use a distinct idempotency key", async () => {
  const backend = await startBackend("success");
  try {
    const response = await fetch(`${backend.baseUrl}/api/rental-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        submissionId: "abcdef1234567890abcdef1234567890",
        name: "Test Renter",
        department: "Engineering",
        contact: "renter@mock.test",
        item: "Oscilloscope",
        quantity: 2,
        requiredDate: "2030-01-10",
        returnDate: "2030-01-12",
        purpose: "Test rental request message.",
      }),
    });
    assert.equal(response.status, 200);
    const sent = JSON.parse(
      fs.readFileSync(backend.sendCountPath, "utf8").trim(),
    );
    assert.equal(
      sent.idempotencyKey,
      "rental-request/abcdef1234567890abcdef1234567890",
    );
    assert.equal(sent.body.subject, "IDEA Lab rental request: Oscilloscope");
    assert.match(sent.body.text, /Test rental request message\./);
    assert.match(sent.body.text, /pending administrator confirmation/);
  } finally {
    await backend.close();
  }
});

test("provider send authentication failure returns a JSON 503", async () => {
  const backend = await startBackend("send-auth");
  try {
    const result = await postContact(backend.baseUrl);
    assert.equal(result.status, 503);
    assert.equal(result.body.ok, false);
    assert.match(result.body.message, /rejected the server credentials/);
    const sent = JSON.parse(
      fs.readFileSync(backend.sendCountPath, "utf8").trim(),
    );
    assert.equal(sent.idempotencyKey, "contact/1234567890abcdef1234567890abcdef");
    await delay(50);
    assert.match(backend.output, /category=authentication/);
    assert.match(backend.output, /Email provider send failed/);
    assert.doesNotMatch(backend.output, /re_test-key/);
    assert.doesNotMatch(backend.output, /Automated contact test/);
    assert.doesNotMatch(backend.output, /mocked SMTP transport/);

    const healthResponse = await fetch(`${backend.baseUrl}/health`);
    const health = await healthResponse.json();
    assert.equal(health.emailTransportFailureCode, "EAUTH");
    assert.equal(health.emailTransportFailureStage, "send");
  } finally {
    await backend.close();
  }
});

test("provider timeout returns JSON 504 and retrying the same ID does not resend", async () => {
  const backend = await startBackend("timeout");
  try {
    const payload = contactPayload();
    const first = await postContact(backend.baseUrl, payload);
    const second = await postContact(backend.baseUrl, payload);
    assert.equal(first.status, 504);
    assert.equal(first.body.ok, false);
    assert.match(first.body.message, /Resend dashboard/);
    assert.equal(second.status, 504);
    assert.equal(
      fs.readFileSync(backend.sendCountPath, "utf8").trim().split("\n").length,
      1,
    );
    const healthResponse = await fetch(`${backend.baseUrl}/health`);
    const health = await healthResponse.json();
    assert.equal(health.emailTransportFailureCode, "ETIMEDOUT");
    assert.equal(health.emailTransportFailureStage, "send");
  } finally {
    await backend.close();
  }
});

test("invalid JSON and unknown routes return JSON errors", async () => {
  const backend = await startBackend("success");
  try {
    const malformed = await fetch(`${backend.baseUrl}/api/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).ok, false);

    const missing = await fetch(`${backend.baseUrl}/not-a-route`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).ok, false);
  } finally {
    await backend.close();
  }
});
