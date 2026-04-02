import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alberto — FOS DM Setter Dashboard",
  description: "Live pipeline, KPIs, and session logs for Matt Gray / Founder OS Instagram DM setting",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
