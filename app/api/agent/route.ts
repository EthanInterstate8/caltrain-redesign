import { askQuestion, runAgent } from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
