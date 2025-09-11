import "./../styles/globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GIWA Intent Bridge — Sepolia ⇄ GIWA",
  description: "Intent-centric ETH bridging demo on OP Stack (Sepolia ↔ GIWA)"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
