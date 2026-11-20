import { connection } from "next/server";
import { askQuestion, runAgent } from "@/lib/agent";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function POST(request: Request) {
  await connection();
  const body = (await request.json().catch(() => ({}))) as {
    question?: string;
    action?: string;
    fromId?: string;
    toId?: string;
    when?: string;
    time?: string;
    date?: string;
    tripId?: string;
  };
  const result = body.question?.trim() ? await askQuestion(body.question, body) : await runAgent(body);
  return Response.json(result);
}
