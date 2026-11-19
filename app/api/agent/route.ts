import { runAgent } from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    fromId?: string;
    toId?: string;
    when?: string;
    time?: string;
    date?: string;
    tripId?: string;
  };
  const result = await runAgent(body);
  return Response.json(result);
}
