import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins/email-otp";

import { matchOrigin } from "./cors.js";
import { db, dialect } from "./db.js";
import { sendEmail } from "./email.js";

export const auth = betterAuth({
  database: { dialect, type: "postgres" },
  basePath: "/api/auth",
  secret: process.env.BETTER_AUTH_SECRET,
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
    },
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
          const adminEmail = process.env.ADMIN_EMAIL;
          if (adminEmail && user.email === adminEmail) {
            await db
              .insertInto("admins")
              .values({ user_id: user.id })
              .onConflict((oc) => oc.column("user_id").doNothing())
              .execute();
          }
        },
      },
    },
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: true,
    },
  },
  trustedOrigins: (request) => {
    const origin = request?.headers.get("origin");
    if (origin && matchOrigin(origin, process.env.CORS_ORIGIN)) {
      return [origin];
    }
    return process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()) ?? [];
  },
});
