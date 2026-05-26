import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VenaSight — Cardiovascular Screening",
  description:
    "Pemindaian kardiovaskular berbasis rPPG. Ukur detak jantung dan HRV Anda dalam 10 detik menggunakan kamera webcam.",
  keywords: ["rPPG", "BPM", "HRV", "cardiovascular", "heart rate", "webcam"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="grain">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

