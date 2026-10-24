# IDEA Lab contact API

## Email provider

The backend sends contact-form and rental-request messages with the Resend
HTTPS API. It does not use Gmail SMTP. Render may not permit or reliably route
outbound SMTP on ports 465/587; `/health` performs fixed-target DNS and TCP
diagnostics for those ports so the backend's actual network results can be
checked after deployment.

Before deploying:

1. Create a Resend account and verify a domain you control. Add the DNS records
   Resend supplies and wait until the domain status is **Verified**.
2. Create a Resend API key with **Sending access**, restricted to the verified
   sender domain when available.
3. In the Render backend service, set:

   | Variable | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `FRONTEND_ORIGIN` | `https://idealab-3htc.onrender.com` |
   | `RESEND_API_KEY` | The secret API key from Resend |
   | `EMAIL_FROM` | `IDEA Lab <no-reply@your-verified-domain>` |
   | `RECEIVER_EMAIL` | The inbox that should receive IDEA Lab messages |
   | `TRUST_PROXY` | `1` |

   Replace the example sender domain with the exact verified domain. Keep the
   API key in Render's environment settings; never commit it. `PORT` is
   supplied by Render. Do not set `EMAIL_USER` or `EMAIL_PASS` for this setup.

4. Confirm the backend Render service uses `backend` as its Root Directory,
   `npm install` as its Build Command, and `npm start` as its Start Command.
   Save the environment variables and deploy/restart the service.
5. In the Streamlit frontend Render service, confirm
   `IDEA_LAB_CONTACT_API_URL` is set to
   `https://idealab-1-a4hj.onrender.com` (the backend base URL, with no API
   path). Redeploy the frontend to publish its updated timeout guidance.

## Verify after deployment

Open `https://idealab-1-a4hj.onrender.com/health`. The response reports
`emailProvider: "resend"` and changes from `not_configured` to `configured`
once the required environment variables are present. `configured` does not
claim that a provider send has succeeded; the status becomes `ready` after a
confirmed send, or reports an error after a failed send. Health does not make
an API call or stay in `checking`, so a least-privilege Sending access key
works without granting permission to list or manage domains. The
`smtpConnectivity` object reports the backend's DNS result and TCP results
for Gmail ports 465 and 587; SMTP results are diagnostic only and do not affect
HTTPS email delivery.

Submit one test message through the existing contact form, then confirm that
the message appears in the Resend dashboard and reaches `RECEIVER_EMAIL`.
After an HTTP 504, delivery is uncertain: check the Resend dashboard and
Render logs before deciding whether to submit again. The backend never retries
a failed send automatically and uses Resend's `Idempotency-Key` for repeated
requests with the same submission ID.

For local development, copy `.env.example` to `.env`, fill in the same provider
settings, and run `npm install` followed by `npm start` from this directory.
Do not use a real recipient for automated tests; `npm test` uses a mocked
provider.
