# IDEA Lab contact API

The Node.js backend sends messages from the CARE College of Engineering IDEA
Lab contact form through the Resend HTTPS API. It exposes `/health` and
`POST /api/contact`.

## Configure email

Create a Resend API key with sending access and verify the sender domain. Set
these variables in the backend environment:

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Secret Resend sending key |
| `EMAIL_FROM` | Sender address on the verified domain |
| `RECEIVER_EMAIL` | Inbox for contact messages |
| `FRONTEND_ORIGIN` | Comma-separated allowed website origins |
| `PORT` | Backend port; supplied by Render in production |
| `TRUST_PROXY` | Set to `1` when running behind a trusted proxy |

Keep the API key in the hosting provider's secret environment settings. Do not
commit real credentials. `EMAIL_USER` and `EMAIL_PASS` are not used.

Configure the backend service with `backend` as its root directory,
`npm install` as its build command, and `npm start` as its start command. Set
`IDEA_LAB_CONTACT_API_URL` on the Streamlit service to the backend base URL
without an API path. The local default is `http://127.0.0.1:10000`.

## Run locally

Copy `.env.example` to `.env`, set the Resend variables, then run:

```powershell
npm.cmd install
npm.cmd start
```

Run the frontend separately from the repository root with
`py -m streamlit run app.py`. Automated tests use a mocked email provider and
do not send real messages; run them with `npm test`.

The `/health` response reports email configuration and transport status. Send a
test message using the existing contact form and confirm delivery in the Resend
dashboard and the configured inbox.
