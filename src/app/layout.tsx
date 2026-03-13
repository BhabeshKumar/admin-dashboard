import type { Metadata } from "next";

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
      <body
        style={{
          margin: 0,
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
          background: "#0b1020",
          color: "#e8eaf0",
        }}
      >
        {children}
      </body>
    </html>
  );
}

