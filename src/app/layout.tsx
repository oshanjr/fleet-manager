import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FleetFlow - Bus Fleet & Dispatch Operations",
  description: "Enterprise Bus Fleet Management, Route Logs, Maintenance & Crew Payroll",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased font-sans"
      suppressHydrationWarning
    >
      <body
        className="min-h-full flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-amber-500 selection:text-slate-950"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
