import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { Role } from "@prisma/client";

const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "fleet-secret-key-super-secure-token-32bytes-long-min"
);

const SESSION_COOKIE = "fleet_session_token";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      id: payload.id as string,
      name: payload.name as string,
      email: payload.email as string,
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function setSessionCookie(user: SessionUser) {
  const token = await createSessionToken(user);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Ensures default users exist in MongoDB Atlas:
 * Admin: admin@fleetflow.com / admin123
 * Supervisor: supervisor@fleetflow.com / supervisor123
 */
export async function ensureDefaultUsers() {
  try {
    const adminExists = await prisma.user.findUnique({
      where: { email: "admin@fleetflow.com" },
    });

    if (!adminExists) {
      const passwordHash = await bcrypt.hash("admin123", 10);
      await prisma.user.create({
        data: {
          name: "Fleet Operations Director",
          email: "admin@fleetflow.com",
          passwordHash,
          role: Role.FLEET_MANAGER,
        },
      });
    }

    const supervisorExists = await prisma.user.findUnique({
      where: { email: "supervisor@fleetflow.com" },
    });

    if (!supervisorExists) {
      const passwordHash = await bcrypt.hash("supervisor123", 10);
      await prisma.user.create({
        data: {
          name: "Dispatch Supervisor",
          email: "supervisor@fleetflow.com",
          passwordHash,
          role: Role.DISPATCH_SUPERVISOR,
        },
      });
    }

    // Also ensure initial crew rates
    const driverRate = await prisma.crewRate.findUnique({
      where: { role: "DRIVER" },
    });
    if (!driverRate) {
      await prisma.crewRate.create({
        data: {
          role: "DRIVER",
          baseDailyWage: 65.0,
          commissionPercent: 5.0,
        },
      });
    }

    const conductorRate = await prisma.crewRate.findUnique({
      where: { role: "CONDUCTOR" },
    });
    if (!conductorRate) {
      await prisma.crewRate.create({
        data: {
          role: "CONDUCTOR",
          baseDailyWage: 50.0,
          commissionPercent: 4.0,
        },
      });
    }
  } catch (err) {
    console.error("Error ensuring default users:", err);
  }
}

