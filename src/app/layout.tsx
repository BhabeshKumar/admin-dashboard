import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Site Management Admin",
  description: "Admin dashboard for timesheets",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="app-root">{children}</body>
    </html>
  );
}

