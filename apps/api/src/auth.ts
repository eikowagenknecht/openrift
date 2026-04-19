import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins/email-otp";
import type { Kysely } from "kysely";
import type { PostgresJSDialect } from "kysely-postgres-js";

import type { createConfig } from "./config.js";
import { matchOrigin } from "./cors.js";
import type { Database } from "./db/index.js";
import type { createEmailSender } from "./email.js";
import { adminsRepo } from "./repositories/admins.js";
import { collectionsRepo } from "./repositories/collections.js";

export function createAuth(deps: {
  config: ReturnType<typeof createConfig>;
  db: Kysely<Database>;
  dialect: PostgresJSDialect;
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
            "sign-in": "Your sign-in code — OpenRift",
            "email-verification": "Verify your email — OpenRift",
            "forget-password": "Reset your password — OpenRift",
            "change-email": "Confirm your email change — OpenRift",
          };
          await sendEmail({
            to: email,
            subject: subjects[type] ?? "Your verification code — OpenRift",
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
        // Intentional: users may sign up with email then link a social provider
        // whose email differs (e.g. personal Gmail vs work email). The user must
        // already be authenticated to link an account, so this does not create an
        // account-takeover vector.
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
          async after(user) {
            const collections = collectionsRepo(db);
            await collections.ensureInbox(user.id);
            await collections.create({
              userId: user.id,
              name: "Binder",
              description: null,
              availableForDeckbuilding: true,
              isInbox: false,
              sortOrder: 1,
            });
            const adminEmail = config.auth.adminEmail;
            if (adminEmail && user.email === adminEmail) {
              await adminsRepo(db).autoPromote(user.id);
            }
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
      return config.corsOrigin?.split(",").map((s) => s.trim()) ?? [];
    },
  });

  return auth;
}
