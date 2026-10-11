"use client";
import { createBrowserClient } from "@supabase/ssr";
import { publicSupabaseConfig } from "./config";
let client: ReturnType<typeof createBrowserClient> | undefined;
export function browserSupabase() {
  const { url, key } = publicSupabaseConfig();
  client ??= createBrowserClient(url, key);
  return client;
}
