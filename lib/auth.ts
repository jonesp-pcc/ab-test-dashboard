import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

export const { handlers, auth } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.ENTRA_CLIENT_ID!,
      clientSecret: process.env.ENTRA_CLIENT_SECRET!,
      issuer: process.env.ENTRA_ISSUER!,
    }),
  ],
});

// middleware.ts needs a plain `auth` export (used directly as the
// middleware function itself). Route handlers use this same function
// under a clearer name — it was previously exported ONLY as
// `getServerSession`, which middleware.ts's `{ auth as middleware }`
// import couldn't resolve. Both names now point at the same function.
export const getServerSession = auth;