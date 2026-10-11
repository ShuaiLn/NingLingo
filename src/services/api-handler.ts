import "server-only";
import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { serverSupabase } from "@/lib/supabase/server";
import { createSupabaseRepositories } from "@/repositories/supabase";
import { VersionConflictError } from "@/repositories/contracts";
import { executeRepositoryOperation } from "./repository-operations";
export async function repositoryRequest(request: Request, fixedOperation?: string, extra: Record<string, unknown> = {}) {
  const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") return respond({ error: "Cross-origin operations are not allowed." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return respond({ error: "A JSON request is required." }, 415);
  try {
    const supabase = await serverSupabase();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (!user || error) return respond({ error: "Your session expired. Please sign in again." }, 401);
    const raw = await request.text();
    if (raw.length > 1500000) return respond({ error: "This request is too large. Import smaller batches." }, 413);
    const body: unknown = JSON.parse(raw);
    const operation = fixedOperation ?? z.object({ operation: z.string().max(100) }).parse(body).operation;
    const args = fixedOperation ? { ...z.record(z.string(), z.unknown()).parse(body), ...extra } : z.object({ args: z.unknown() }).parse(body).args;
    const repos = createSupabaseRepositories(supabase, user);
    return respond({ data: await executeRepositoryOperation(repos, operation, args) });
  } catch (error: unknown) {
    if (error instanceof VersionConflictError) return respond({ error: error.message, latest: error.latest }, 409);
    if (error instanceof ZodError || error instanceof SyntaxError) return respond({ error: "The request contains invalid or missing fields." }, 400);
    return respond({ error: error instanceof Error ? error.message : "The operation could not be completed." }, 400);
  }
}
