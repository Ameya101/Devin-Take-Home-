import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Acme Internal Tools",
  description: "Internal tools built on the shared kit",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
