# Authentication

OpenRift uses [better-auth](https://www.better-auth.com/) for authentication. The server-side config lives in `apps/api/src/auth.ts` and the client in `apps/web/src/lib/auth-client.ts`.

## Account Creation (Email + Password)

```plaintext
┌──────────┐         ┌─────────┐         ┌───────────┐         ┌──────────┐
│  /signup │         │   API   │         │  /verify  │         │   Home   │
│   form   │         │  server │         │  -email   │         │    /     │
└────┬─────┘         └─────┬───┘         └─────┬─────┘         └─────┬────┘
     │  POST /api/auth/    │                   │                     │
     │  sign-up/email      │                   │                     │
     │  {name, email, pw}  │                   │                     │
     │────────────────────>│                   │                     │
     │                     │ insert users row  │                     │
     │                     │ insert accounts   │                     │
     │                     │  (provider:       │                     │
     │                     │   "credential")   │                     │
     │                     │                   │                     │
     │                     │ send 6-digit OTP  │                     │
     │                     │  via SMTP         │                     │
     │                     │                   │                     │
     │  redirect ─────────────────────────────>│                     │
     │                     │                   │                     │
     │                     │   POST /api/auth/ │                     │
     │                     │   email-otp/      │                     │
     │                     │   verify-email    │                     │
     │                     │   {email, otp}    │                     │
     │                     │<──────────────────│                     │
     │                     │                   │                     │
     │                     │ set email_verified│                     │
     │                     │  = true           │                     │
     │                     │ create session    │                     │
     │                     │  (auto sign-in)   │                     │
     │                     │                   │                     │
     │                     │                   │  redirect ─────────>│
     │                     │                   │                     │
```

1. User fills in name, email, and password on `/signup` (password must be >= 8 characters).
2. The client calls `signUp.email()` which POSTs to `/api/auth/sign-up/email`.
3. better-auth creates a `users` row (with `email_verified = false`) and an `accounts` row (with `provider_id = "credential"` and a hashed password).
4. The email OTP plugin sends a 6-digit verification code to the user's email (expires in 5 minutes).
5. The client redirects to `/verify-email?email=...`.
6. User enters the OTP. The client calls `authClient.emailOtp.verifyEmail()`.
7. better-auth marks the user as verified and auto-creates a session (cookie-based). The user is redirected to `/`.

## Sign In

### Password

1. User enters email and password on `/login`.
2. The client calls `signIn.email()`. If the email isn't verified, the form shows an inline "Resend verification email" link.
3. On success, a session cookie is set and the user is redirected to the page they came from (or `/`).

### Email OTP (Passwordless)

1. User toggles to "Sign in with email code" on `/login`.
2. They enter their email, and the client calls `authClient.emailOtp.sendVerificationOtp()` with `type: "sign-in"`.
3. A 6-digit code is sent via email (expires in 5 minutes).
4. User enters the code, the client calls `authClient.signIn.emailOtp()`.
5. On success, a session is created.

## Password Reset

1. User clicks "Forgot your password?" on the login form, which navigates to `/reset-password`.
2. They enter their email, and the client sends a `"forget-password"` OTP.
3. User enters the OTP plus a new password (>= 8 characters) and confirmation.
4. The client calls `authClient.emailOtp.resetPassword()`.
5. On success, the user is redirected to `/login` with their email pre-filled.

## Session Management

- Sessions are stored in the `sessions` table and represented as HTTP cookies.
- The API middleware (`apps/api/src/index.ts`) extracts the session from request headers on every `/api/*` call and exposes `user` and `session` on the Hono context.
- Protected frontend routes live under `/_authenticated/` and use a `beforeLoad` guard that calls `authClient.getSession()`. If there's no active session the user is redirected to `/login` with a `?redirect=` param so they return to where they were after signing in.

## Profile Management

The `/profile` page (under the `/_authenticated` layout) provides:

- **Display name** — editable, calls `authClient.updateUser()`.
- **Email change** — three-step flow: enter new email, verify current email (OTP), verify new email (OTP). Both emails must be confirmed before the change takes effect.
- **Password change** — requires current password. Revokes all other sessions on success.
- **Account deletion** — requires password confirmation. Permanently deletes the user and all associated data.

## Database Tables

All auth tables are created by migration `003_auth_tables.ts`. See [Data Layer — Auth Tables](data-layer.md#auth-tables) for the full schema. Summary:

| Table           | Purpose                                          |
| --------------- | ------------------------------------------------ |
| `users`         | User identity (email, name, verification status) |
| `sessions`      | Active sessions (token, expiry, IP, user agent)  |
| `accounts`      | Provider links (credential, Google, Discord)     |
| `verifications` | OTP/email verification tokens (auto-cleaned)     |

## Email Delivery

Verification emails are sent via SMTP. The config lives in `apps/api/src/email.ts`. Required environment variables:

| Variable    | Purpose                         |
| ----------- | ------------------------------- |
| `SMTP_USER` | SMTP username                   |
| `SMTP_PASS` | SMTP password                   |
| `SMTP_FROM` | Sender address and display name |

Email templates are inline HTML defined in the `emailOTP` and `emailVerification` callbacks in `apps/api/src/auth.ts`.

## Environment Variables

| Variable             | Purpose                                     |
| -------------------- | ------------------------------------------- |
| `BETTER_AUTH_SECRET` | Secret key for signing sessions and tokens  |
| `BETTER_AUTH_URL`    | Base URL of the app (used in email links)   |
| `CORS_ORIGIN`        | Trusted origins (comma-separated)           |
| `SMTP_HOST`          | SMTP server host (e.g. `smtp.gmail.com`)    |
| `SMTP_PORT`          | SMTP server port (e.g. `587`)               |
| `SMTP_SECURE`        | Use secure connection (true/false)          |
| `SMTP_USER`          | SMTP username                               |
| `SMTP_PASS`          | SMTP password                               |
| `SMTP_FROM`          | Sender address (e.g. `OpenRift <noreply@>`) |

## OAuth (Google & Discord)

Users can sign in with Google or Discord from the `/login` and `/signup` pages. The `accounts` table stores provider tokens alongside credential accounts — no separate migration is needed.

The provider configuration lives in `apps/api/src/auth.ts` under `socialProviders`. For provider-specific options, see the better-auth docs: [Google](https://better-auth.com/docs/authentication/google), [Discord](https://better-auth.com/docs/authentication/discord).

### Per-Instance Setup

OAuth redirect URIs are tied to a specific origin, so credentials must be configured **per instance**. You can register all redirect URIs under a single OAuth app, or create separate apps per environment — either works.

| Instance               | Redirect URI pattern                                        |
| ---------------------- | ----------------------------------------------------------- |
| `localhost:5173`       | `http://localhost:5173/api/auth/callback/<provider>`        |
| `preview.openrift.app` | `https://preview.openrift.app/api/auth/callback/<provider>` |
| `openrift.app`         | `https://openrift.app/api/auth/callback/<provider>`         |

Each instance needs its own set of OAuth environment variables (or shared credentials if all redirect URIs are registered under one OAuth app):

| Variable                | Purpose                     |
| ----------------------- | --------------------------- |
| `GOOGLE_CLIENT_ID`      | Google OAuth client ID      |
| `GOOGLE_CLIENT_SECRET`  | Google OAuth client secret  |
| `DISCORD_CLIENT_ID`     | Discord OAuth client ID     |
| `DISCORD_CLIENT_SECRET` | Discord OAuth client secret |

### Account Linking

When a user signs in with an OAuth provider, better-auth checks if a user with that email already exists. If so, it links the provider to the existing user by inserting a new `accounts` row — so a single user can have both a credential account and one or more OAuth accounts. This only works if the provider confirms the email as verified.
