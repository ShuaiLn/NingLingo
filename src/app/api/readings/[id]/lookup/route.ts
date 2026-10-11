import { repositoryRequest } from "@/services/api-handler";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { const { id } = await context.params; return repositoryRequest(request, "reading.lookup", { readingId: id }); }
