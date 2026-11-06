import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import FleetDashboardClient from "./dashboard-client";

// Opt out of instant UI validation for this authenticated root route
export const instant = false;

async function DashboardGate() {
  const user = await getSessionUser();

  // If not authenticated, redirect to login page
  if (!user) {
    redirect("/login");
  }

  // Once authenticated, render the full Fleet Operations dashboard
  return <FleetDashboardClient initialUser={user} />;
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            <span className="text-sm">Loading FleetFlow...</span>
          </div>
        </div>
      }
    >
      <DashboardGate />
    </Suspense>
  );
}
