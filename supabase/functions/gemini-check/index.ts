// POST /functions/v1/gemini-check   (deploy with --no-verify-jwt)
// Confirms GEMINI_API_KEY works by sending Gemini a one-word test, without needing a video.
// Answers only whether the key is set and Gemini's HTTP status (or, with {"list": true}, the model
// names the key can use, or with {"model": "..."} a test of that model); never the key itself.
// Protected by the same Vault secret as the cleanup job (see the 20261105 migration).
import { adminClient } from "../_shared/server.ts";
import { DEFAULT_MODEL, parseResult, responseSchema } from "../_shared/gemini.ts";

const MODEL = Deno.env.get("GEMINI_MODEL") ?? DEFAULT_MODEL;

Deno.serve(async (req) => {
  const admin = adminClient();
  const { data: ok } = await admin.rpc("cleanup_secret_ok", { p_secret: req.headers.get("x-cron-secret") ?? "" });
  if (ok !== true) return new Response("Forbidden", { status: 403 });

  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return Response.json({ key_set: false, model: MODEL });
  const body = await req.json().catch(() => ({}));
  // {"list": true} → the models this key can call, to pick GEMINI_MODEL when Google retires one.
  if (body?.list) {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(30_000),
    });
    const listed = await res.json().catch(() => ({}));
    const models = (listed.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m: { name: string }) => m.name.replace(/^models\//, ""));
    return Response.json({ status: res.status, models });
  }
  // {"model": "..."} → try a different model than GEMINI_MODEL.
  const model = typeof body?.model === "string" && /^[a-z0-9.-]{3,60}$/.test(body.model) ? body.model : MODEL;
  // {"schema": true} → ask in the exact JSON shape video checks use (with words standing in for a
  // video) and check the answer parses, so a model change can't silently send everything to review.
  const schema = body?.schema === true;
  const claimed = ["lift", "ramp_entry"];
  const ask = schema
    ? {
      contents: [{ parts: [{ text: "Describe this scene as if it were a video: a passenger lift with an open door on a railway platform, a station name board reading KALYAN, no people. The traveller says it was recorded at Kalyan station and shows: lift, ramp_entry." }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: responseSchema(claimed), maxOutputTokens: 8192 },
    }
    : { contents: [{ parts: [{ text: "Reply with the single word OK." }] }], generationConfig: { temperature: 0 } };
  let status = 0, error = "", parsed: unknown = undefined;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(ask),
      signal: AbortSignal.timeout(schema ? 90_000 : 30_000),
    });
    status = res.status;
    const json = await res.json().catch(() => null);
    if (!res.ok) error = json?.error?.status ?? "";
    else if (schema) {
      const text = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
      parsed = parseResult(text, claimed) ?? `unparseable (${json?.candidates?.[0]?.finishReason ?? "no answer"})`;
    }
  } catch (e) {
    error = (e as Error).name;
  }
  return Response.json({ key_set: true, model, gemini_status: status, error, ...(schema ? { parsed } : {}) });
});
