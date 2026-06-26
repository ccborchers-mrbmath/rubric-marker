// Server-only helper to call the Lovable AI Gateway via raw fetch.
// Used for multimodal prompts (PDFs / images / docs) where AI SDK file-part
// support is limited. Keep on server: never expose LOVABLE_API_KEY to browser.

export type GatewayContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export type GatewayMessage = {
  role: "system" | "user" | "assistant";
  content: string | GatewayContentBlock[];
};

export async function callGateway(opts: {
  model: string;
  messages: GatewayMessage[];
  apiKey: string;
}): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": opts.apiKey,
      "X-Lovable-AIG-SDK": "raw-fetch",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("Rate limited. Try again shortly.");
    if (res.status === 402) throw new Error("Out of AI credits. Add credits in workspace settings.");
    throw new Error(`AI gateway ${res.status}: ${body}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content ?? "";
}
