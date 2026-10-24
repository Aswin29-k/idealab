const fs = require("node:fs");

global.fetch = async (url, options = {}) => {
  const requestUrl = new URL(url);
  const mode = process.env.TEST_PROVIDER_MODE;
  const sendCountPath = process.env.TEST_PROVIDER_SEND_COUNT;

  if (requestUrl.pathname === "/emails" && options.method === "POST") {
    const request = {
      body: JSON.parse(options.body),
      idempotencyKey: new Headers(options.headers).get("Idempotency-Key"),
    };
    if (sendCountPath) {
      fs.appendFileSync(sendCountPath, `${JSON.stringify(request)}\n`);
    }
    if (mode === "send-auth") {
      return new Response("{}", { status: 401 });
    }
    if (mode === "timeout") {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => reject(new Error("Mock provider request aborted.")),
          { once: true },
        );
      });
    }
    return new Response(JSON.stringify({ id: "mock-email-id" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  throw new Error("Unexpected email provider request.");
};
