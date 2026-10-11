import { repositoryRequest } from "@/services/api-handler";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return repositoryRequest(request, "quiz.answer", await context.params); }
