import type { Metadata } from "next";
import { AppProvider } from "@/components/app-provider";
import "./globals.css";
import { localDevelopmentMode } from "@/lib/runtime";
export const metadata: Metadata = { title: { default: "NingLingo · Your daily language space", template: "%s · NingLingo" }, description: "A personal space to learn Japanese, Spanish, and Modern Greek. Vocabulary, practice, reading, and progress." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><AppProvider local={localDevelopmentMode()}>{children}</AppProvider></body></html>; }
