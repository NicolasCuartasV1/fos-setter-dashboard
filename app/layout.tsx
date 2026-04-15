import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alberto War Room",
  description:
    "Brand DM operations command center",
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
