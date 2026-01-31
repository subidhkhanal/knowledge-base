import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // Store GitHub user ID in the token
      if (account && profile) {
        token.userId = profile.id?.toString() || account.providerAccountId;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose the user ID to the client session
      session.userId = token.userId as string;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
