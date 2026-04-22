import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

import { prisma, type UserRole } from "@earnify/db";
import type { AuthUser } from "@earnify/shared";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleCallbackUrl = process.env.GOOGLE_CALLBACK_URL ?? "http://localhost:4000/api/auth/google/callback";

const founderEmails = new Set(
  (process.env.FOUNDER_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

function toAuthUser(user: {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  role: UserRole;
  walletAddress: string | null;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    role: user.role,
    walletAddress: user.walletAddress
  };
}

if (!googleClientId || !googleClientSecret) {
  console.warn("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required to enable Google OAuth");
} else {
  passport.use(
    new GoogleStrategy(
      {
        clientID: googleClientId,
        clientSecret: googleClientSecret,
        callbackURL: googleCallbackUrl
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();

          if (!email) {
            done(new Error("Google account email is required"));
            return;
          }

          const name = profile.displayName || email.split("@")[0] || "Earnify User";
          const avatar = profile.photos?.[0]?.value ?? null;
          const isFounder = founderEmails.has(email);

          const existingUser = await prisma.user.findUnique({
            where: { email }
          });

          const role: UserRole = existingUser
            ? existingUser.role === "FOUNDER" || isFounder
              ? "FOUNDER"
              : "USER"
            : isFounder
              ? "FOUNDER"
              : "USER";

          const user = existingUser
            ? await prisma.user.update({
                where: { id: existingUser.id },
                data: {
                  name,
                  avatar,
                  role
                }
              })
            : await prisma.user.create({
                data: {
                  email,
                  name,
                  avatar,
                  role
                }
              });

          done(null, toAuthUser(user));
        } catch (error) {
          done(error as Error);
        }
      }
    )
  );
}
