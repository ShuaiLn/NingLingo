import { repositoryRequest } from "@/services/api-handler";
export const runtime = "nodejs";
export const POST = (request: Request) => repositoryRequest(request);
