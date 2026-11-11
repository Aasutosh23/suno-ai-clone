import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { captcha } from "better-auth/plugins";
import { env } from "~/env";
import { db } from "~/server/db";
import {
  getClientIp,
  getIpBucketKey,
  isDisposableEmail,
  normalizeEmail,
} from "~/lib/abuse-protection";

export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM) {
        throw new Error(
          "Password reset email is not configured. Set RESEND_API_KEY and AUTH_EMAIL_FROM.",
        );
      }

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.AUTH_EMAIL_FROM,
          to: [user.email],
          subject: "Reset your Suno AI Clone password",
          text: `Hello ${user.name},\n\nWe received a request to reset your password. Use the link below to choose a new password. This link expires in one hour.\n\n${url}\n\nIf you did not request a password reset, you can ignore this email.`,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to send password reset email (Resend returned ${response.status}).`,
        );
      }
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM) {
        throw new Error(
          "Authentication email is not configured. Set RESEND_API_KEY and AUTH_EMAIL_FROM.",
        );
      }

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.AUTH_EMAIL_FROM,
          to: [user.email],
          subject: "Verify your Suno AI Clone email",
          text: `Hello ${user.name},\n\nVerify your email address to start creating songs:\n\n${url}\n\nIf you did not create an account, you can ignore this email.`,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to send verification email (Resend returned ${response.status}).`,
        );
      }
    },
  },
  user: {
    additionalFields: {
      normalizedEmail: {
        type: "string",
        required: true,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, context) => {
          let normalizedEmail: string;
          try {
            normalizedEmail = normalizeEmail(user.email);
          } catch {
            throw new APIError("BAD_REQUEST", {
              message: "Enter a valid email address.",
            });
          }

          if (isDisposableEmail(user.email)) {
            throw new APIError("BAD_REQUEST", {
              message: "Temporary email addresses are not allowed.",
            });
          }

          const existingUser = await db.user.findUnique({
            where: { normalizedEmail },
            select: { id: true },
          });
          if (existingUser) {
            throw new APIError("BAD_REQUEST", {
              message: "An account with this email address already exists.",
            });
          }

          const ip = context?.request
            ? getClientIp(context.request.headers)
            : null;
          if (!ip) {
            throw new APIError("BAD_REQUEST", {
              message: "Unable to verify your network address. Please retry.",
            });
          }
          const ipKey = getIpBucketKey(ip);

          await db.$transaction(async (transaction) => {
            await transaction.$queryRaw`
              SELECT pg_advisory_xact_lock(hashtext(${`signup:${ipKey}`}))`;

            const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const recentSignups = await transaction.signupAttempt.count({
              where: { ipKey, createdAt: { gte: since } },
            });
            if (recentSignups >= env.SIGNUPS_PER_IP_PER_24H) {
              throw new APIError("TOO_MANY_REQUESTS", {
                message:
                  "Too many accounts were created from this network recently. Try again later.",
              });
            }

            await transaction.signupAttempt.create({ data: { ipKey } });
            await transaction.signupAttempt.deleteMany({
              where: {
                createdAt: { lt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
              },
            });
          });

          return {
            data: {
              ...user,
              normalizedEmail,
            },
          };
        },
      },
    },
  },
  plugins: [
    captcha({
      provider: "cloudflare-turnstile",
      secretKey: env.TURNSTILE_SECRET_KEY ?? "",
      endpoints: ["/sign-up/email"],
      allowedHostnames: [new URL(env.BETTER_AUTH_URL).hostname],
    }),
  ],
});
