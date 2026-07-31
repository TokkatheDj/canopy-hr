import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await db.user.findUnique({
          where: { email },
          include: {
            employee: {
              include: { reports: { select: { id: true } } },
            },
          },
        });
        if (!user) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        const emp = user.employee;
        return {
          id: user.id,
          email: user.email,
          name: emp ? `${emp.firstName} ${emp.lastName}` : user.email,
          image: emp?.photoUrl ?? null,
          role: user.role,
          employeeId: user.employeeId,
          isManager: (emp?.reports.length ?? 0) > 0,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.employeeId = user.employeeId;
        token.isManager = user.isManager;
      }
      return token;
    },
    session({ session, token }) {
      session.user.role = token.role as SessionUser["role"];
      session.user.employeeId = token.employeeId as string | null;
      session.user.isManager = Boolean(token.isManager);
      session.user.id = token.sub ?? "";
      return session;
    },
  },
});

/** Session user for Server Components/Actions; null when not signed in. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  const u = session.user;
  return {
    id: u.id,
    email: u.email ?? "",
    name: u.name ?? "",
    role: u.role,
    employeeId: u.employeeId,
    isManager: u.isManager,
    image: u.image,
  };
}
