function normalize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreDoc(question, doc) {
  const q = normalize(question);
  const hay = normalize(`${doc.title} ${(doc.tags || []).join(" ")} ${doc.content}`);
  if (!q) return 0;

  const tokens = new Set(q.split(" ").filter((t) => t.length >= 3));
  let score = 0;
  for (const t of tokens) if (hay.includes(t)) score += 1;
  return score;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // 1) read question
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const question = (body.question || "").toString().trim();
  if (!question) return new Response("Missing question", { status: 400 });

  // 2) load your knowledge file from the site
  const url = new URL(request.url);
  const knowledgeUrl = `${url.origin}/knowledge/golf_entries.json`;
  const kRes = await fetch(knowledgeUrl, { headers: { "Cache-Control": "no-cache" } });

  if (!kRes.ok) {
    return new Response(
      "Knowledge file not found. Create golf-site/knowledge/golf_entries.json",
      { status: 500 }
    );
  }

  let docs;
  try {
    docs = await kRes.json();
  } catch {
    return new Response("Knowledge file is not valid JSON.", { status: 500 });
  }

  // 3) retrieve top entries (simple v1)
  const top = docs
    .map((d) => ({ d, s: scoreDoc(question, d) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 6)
    .filter((x) => x.s > 0);

  if (top.length === 0) {
    return Response.json({
      answer:
        "That’s not in Kevin’s golf library yet. Start from the basics (grip, grip pressure, setup/posture, takeaway) or add a new entry for this topic.",
      citations: [],
    });
  }

  const contextText = top
    .map(
      (x) =>
        `---\n${x.d.id}: ${x.d.title}\nTags: ${(x.d.tags || []).join(", ")}\n${x.d.content}\n`
    )
    .join("\n");

  // 4) make sure Workers AI binding exists
  if (!env.AI || typeof env.AI.run !== "function") {
    return new Response(
      "Workers AI binding missing. In Cloudflare Pages → Settings → Bindings, add Workers AI with variable name AI.",
      { status: 500 }
    );
  }

  // 5) call Workers AI model
  const model = env.AI_MODEL || "@cf/meta/llama-3.1-8b-instruct";

  const system = `
You are KY Golf Academy Coach Chat.
Answer ONLY using the provided library context.
If the answer is not contained in the context, say: "Not in Kevin’s golf library yet."
Be practical and concise. Use Kevin’s cues/drills when relevant.
End with: "Used: entry-xxx, entry-yyy".
`.trim();

  const result = await env.AI.run(model, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Question: ${question}\n\nLIBRARY CONTEXT:\n${contextText}` },
    ],
    temperature: 0.2,
    max_tokens: 450,
  });

  const answer =
    (result && (result.response || result.result || result.text)) ??
    JSON.stringify(result);

  return Response.json({
    answer: String(answer).trim(),
    citations: top.map((x) => x.d.id),
  });
}
