// Reclassifica em lote entries com confidence baixa (< 60) usando Lovable AI Gateway.
// Requer secret LOVABLE_API_KEY. Se ausente, retorna 501 gracefully.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AI_KEY       = Deno.env.get("LOVABLE_API_KEY");
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  const cors = {
    "access-control-allow-origin": req.headers.get("origin") ?? "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "content-type": "application/json",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  if (!AI_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurado" }), { status: 501, headers: cors });
  }

  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });

  const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${auth}` } },
  });
  const { data: u } = await anon.auth.getUser();
  const userId = u.user?.id;
  if (!userId) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });

  const { data: pending } = await admin
    .from("precis_entries")
    .select("id, description, merchant, amount, direction")
    .eq("user_id", userId)
    .lt("confidence", 60)
    .is("category_id", null)
    .limit(50);

  const items = pending ?? [];
  if (!items.length) return new Response(JSON.stringify({ updated: 0 }), { headers: cors });

  const prompt = `Categorize cada lançamento financeiro abaixo em uma das categorias:
[Moradia, Alimentação, Transporte, Saúde, Lazer, Assinaturas, Educação, Cartões, Outros].
Responda APENAS um JSON array com { "id": "...", "category": "..." }.

Lançamentos:
${items.map((i) => `- id=${i.id} desc="${i.description}" merchant="${i.merchant ?? ""}" amount=${i.amount} dir=${i.direction}`).join("\n")}`;

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${AI_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    }),
  });
  if (!aiResp.ok) return new Response(JSON.stringify({ error: `gateway: ${aiResp.status}` }), { status: 502, headers: cors });
  const aiJson = await aiResp.json();
  const text = aiJson?.choices?.[0]?.message?.content ?? "[]";
  const match = text.match(/\[[\s\S]*\]/);
  const parsed: Array<{ id: string; category: string }> = match ? JSON.parse(match[0]) : [];

  let updated = 0;
  for (const p of parsed) {
    const { error } = await admin
      .from("precis_entries")
      .update({ category_id: p.category, confidence: 80, updated_at: new Date().toISOString() })
      .eq("id", p.id)
      .eq("user_id", userId);
    if (!error) updated++;
  }

  return new Response(JSON.stringify({ updated, total: items.length }), { headers: cors });
});
