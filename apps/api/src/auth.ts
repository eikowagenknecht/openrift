import { apiKey } from "@better-auth/api-key";
import { validateRiotId } from "@openrift/shared/riot-id";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { emailOTP } from "better-auth/plugins/email-otp";
import type { Dialect, Kysely } from "kysely";

import type { createConfig } from "./config.js";
import { isLocalDevOrigin, matchOrigin } from "./cors.js";
import type { Database } from "./db/index.js";
import { sanitizeDisplayName, validateDisplayName } from "./display-name.js";
import type { createEmailSender } from "./email.js";
import { collectionsRepo } from "./modules/collections/repositories/collections.js";
import { adminsRepo } from "./modules/users/repositories/admins.js";

export function createAuth(deps: {
  config: ReturnType<typeof createConfig>;
  db: Kysely<Database>;
  dialect: Dialect;
  sendEmail: ReturnType<typeof createEmailSender>;
}) {
  const { config, db, dialect, sendEmail } = deps;

  const auth = betterAuth({
    database: { dialect, type: "postgres" },
    basePath: "/api/auth",
    secret: config.auth.secret,
    socialProviders: {
      ...(config.auth.google && { google: config.auth.google }),
      ...(config.auth.discord && { discord: config.auth.discord }),
    },
    plugins: [
      emailOTP({
        async sendVerificationOTP({ email, otp, type }) {
          const subjects: Record<string, string> = {
            "sign-in": "Your sign-in code",
            "email-verification": "Verify your email",
            "forget-password": "Reset your password",
            "change-email": "Confirm your email change",
          };
          await sendEmail({
            to: email,
            subject: subjects[type] ?? "Your verification code",
            html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
              <h2 style="margin: 0 0 16px;">Your verification code</h2>
              <p style="font-size: 32px; font-weight: bold; letter-spacing: 0.3em; margin: 16px 0;">${otp}</p>
              <p style="color: #71717a; font-size: 14px;">This code expires in 5 minutes. If you didn't request this, you can safely ignore this email.</p>
            </div>
          `,
          });
        },
        otpLength: 6,
        expiresIn: 300,
        sendVerificationOnSignUp: true,
        changeEmail: {
          enabled: true,
          verifyCurrentEmail: true,
        },
        overrideDefaultEmailVerification: true,
      }),
      apiKey({
        // Resolves a session for the key's owner via `auth.api.getSession`, so
        // requireAuth/requireAdmin work unchanged for script callers.
        enableSessionForAPIKeys: true,
        defaultPrefix: "orift_",
        // Plugin default is 10 requests per day, far too tight for upload scripts.
        rateLimit: {
          enabled: true,
          timeWindow: 60 * 60 * 1000,
          maxRequests: 1000,
        },
        schema: {
          apikey: {
            modelName: "api_keys",
            fields: {
              configId: "config_id",
              referenceId: "reference_id",
              refillInterval: "refill_interval",
              refillAmount: "refill_amount",
              lastRefillAt: "last_refill_at",
              rateLimitEnabled: "rate_limit_enabled",
              rateLimitTimeWindow: "rate_limit_time_window",
              rateLimitMax: "rate_limit_max",
              requestCount: "request_count",
              lastRequest: "last_request",
              expiresAt: "expires_at",
              createdAt: "created_at",
              updatedAt: "updated_at",
            },
          },
        },
      }),
    ],
    emailVerification: {
      autoSignInAfterVerification: true,
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      async onExistingUserSignUp({ user }) {
        if (!user.emailVerified) {
          await auth.api.sendVerificationOTP({
            body: { email: user.email, type: "email-verification" },
          });
        }
      },
    },
    user: {
      changeEmail: {
        enabled: true,
      },
      deleteUser: {
        enabled: true,
      },
      additionalFields: {
        // Self-reported, unverified display data; validated in the update hook below.
        riotId: {
          type: "string",
          required: false,
          input: true,
          fieldName: "riot_id",
        },
      },
      fields: {
        emailVerified: "email_verified",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
      modelName: "users",
    },
    session: {
      expiresIn: 60 * 60 * 24 * 365,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
      fields: {
        userId: "user_id",
        expiresAt: "expires_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
      modelName: "sessions",
    },
    account: {
      accountLinking: {
        // Deliberate: linking requires an existing session, so a differing social-provider
        // email (e.g. a work Gmail) does not create an account-takeover vector.
        allowDifferentEmails: true,
      },
      fields: {
        userId: "user_id",
        accountId: "account_id",
        providerId: "provider_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        idToken: "id_token",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
      modelName: "accounts",
    },
    verification: {
      fields: {
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
      modelName: "verifications",
    },
    databaseHooks: {
      user: {
        create: {
          // oxlint-disable-next-line require-await -- better-auth hook signature requires Promise return
          async before(user) {
            const fallback = typeof user.email === "string" ? user.email.split("@")[0] : "";
            const cleaned = sanitizeDisplayName(user.name, fallback ?? "");
            // An invalid riotId is dropped; signup still succeeds.
            const riot = validateRiotId(user.riotId);
            const riotId = riot.ok ? riot.value : null;
            if (cleaned === user.name && riotId === (user.riotId ?? null)) {
              return;
            }
            return { data: { ...user, name: cleaned, riotId } };
          },
          async after(user) {
            const collections = collectionsRepo(db);
            await collections.ensureInbox(user.id);
            await collections.create({
              userId: user.id,
              groupId: null,
              name: "Binder",
              description: null,
              isInbox: false,
              sortOrder: 1,
            });
            const adminEmail = config.auth.adminEmail;
            if (adminEmail && user.email === adminEmail) {
              await adminsRepo(db).autoPromote(user.id);
            }
          },
        },
        update: {
          // oxlint-disable-next-line require-await -- better-auth hook signature requires Promise return
          async before(user) {
            const updates: { name?: string; riotId?: string | null } = {};
            if (Object.hasOwn(user, "name")) {
              const result = validateDisplayName(user.name);
              if (!result.ok) {
                throw new APIError("BAD_REQUEST", {
                  code: "INVALID_NAME",
                  message: result.reason,
                });
              }
              if (result.value !== user.name) {
                updates.name = result.value;
              }
            }
            if (Object.hasOwn(user, "riotId")) {
              const result = validateRiotId(user.riotId);
              if (!result.ok) {
                throw new APIError("BAD_REQUEST", {
                  code: "INVALID_RIOT_ID",
                  message: result.reason,
                });
              }
              // An empty submission normalizes to null, clearing the field.
              if (result.value !== user.riotId) {
                updates.riotId = result.value;
              }
            }
            if (Object.keys(updates).length === 0) {
              return;
            }
            return { data: { ...user, ...updates } };
          },
        },
      },
    },
    advanced: {
      defaultCookieAttributes: {
        sameSite: "lax",
        secure: !config.isDev,
      },
    },
    trustedOrigins: (request) => {
      const origin = request?.headers.get("origin");
      if (origin && matchOrigin(origin, config.corsOrigin)) {
        return [origin];
      }
      // In dev, trust local devices (LAN IP) so they can sign in without adding their
      // rotating IPs to CORS_ORIGIN.
      if (config.isDev && origin && isLocalDevOrigin(origin)) {
        return [origin];
      }
      return config.corsOrigin?.split(",").map((s) => s.trim()) ?? [];
    },
  });

  return auth;
}
