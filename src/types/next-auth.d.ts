import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: "ADMIN" | "MANAGER" | "EMPLOYEE";
    employeeId: string | null;
    isManager: boolean;
  }
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "MANAGER" | "EMPLOYEE";
      employeeId: string | null;
      isManager: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "ADMIN" | "MANAGER" | "EMPLOYEE";
    employeeId?: string | null;
    isManager?: boolean;
  }
}
