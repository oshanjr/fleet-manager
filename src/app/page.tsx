import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import FleetDashboardClient from "./dashboard-client";

export default async function HomePage() {
  const user = await getSessionUser();

  // If not authenticated, immediately redirect to login page
  if (!user) {
    redirect("/login");
  }

  // Once authenticated, render the full Fleet Operations dashboard
  return <FleetDashboardClient initialUser={user} />;
}
