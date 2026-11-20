import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font",
});

export const metadata: Metadata = {
  title: "CALTRAIN ONE",
  description: "Search two stations and see the next Caltrain trips, with type and a live countdown.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body className={geist.className}>{children}</body>
    </html>
  );
}
