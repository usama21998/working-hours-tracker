import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hours Tracker",
  description: "Monthly attendance balance from Decibel timesheets",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
