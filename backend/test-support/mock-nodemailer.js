const fs = require("node:fs");
const Module = require("node:module");

const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
  if (request === "nodemailer") {
    return {
      createTransport() {
        const mode = process.env.TEST_SMTP_MODE;
        return {
          async verify() {
            if (mode === "verify-auth") {
              throw Object.assign(new Error("Invalid login"), {
                code: "EAUTH",
                responseCode: 535,
              });
            }
          },
          async sendMail(mail) {
            const countPath = process.env.TEST_SMTP_SEND_COUNT;
            if (countPath) {
              fs.appendFileSync(countPath, "send\n");
            }
            if (mode === "send-auth") {
              throw Object.assign(new Error("Invalid login"), {
                code: "EAUTH",
                responseCode: 535,
              });
            }
            if (mode === "timeout") {
              throw Object.assign(new Error("SMTP socket timed out"), {
                code: "ETIMEDOUT",
                command: "DATA",
              });
            }
            return { accepted: [mail.to] };
          },
        };
      },
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};
