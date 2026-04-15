import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alberto War Room - FOS DM Setter Dashboard",
  description:
    "Live pipeline, KPIs, and session logs for Matt Gray / Founder OS Instagram DM setting",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-background text-white font-sans">
        {children}
      </body>
    </html>
  );
}
