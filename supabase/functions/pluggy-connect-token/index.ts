// Gera um connectToken para o widget Pluggy Connect abrir no frontend.
// Requer usuário autenticado (JWT do Supabase).
import {
  corsHeaders,
  getApiKey,
  getUser,
  json,
  PLUGGY_API,
} from "../_shared/pluggy.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Não autenticado" }, 401);

    // itemId opcional: quando presente, abre o widget em modo "atualizar conexão".
    let itemId: string | undefined;
    try {
      const body = await req.json();
      itemId = body?.itemId;
    } catch (_e) { /* sem body */ }

    const apiKey = await getApiKey();

    const projectRef = Deno.env.get("SUPABASE_URL")!;
    const webhookSecret = Deno.env.get("PLUGGY_WEBHOOK_SECRET");
    const webhookUrl =
      `${projectRef}/functions/v1/pluggy-webhook` +
      (webhookSecret ? `?secret=${webhookSecret}` : "");

    const res = await fetch(`${PLUGGY_API}/connect_token`, {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(itemId ? { itemId } : {}),
        options: {
          clientUserId: user.id, // amarra o item ao usuário
          webhookUrl,
        },
      }),
    });

    if (!res.ok) {
      return json(
        { error: `Pluggy /connect_token [${res.status}]: ${await res.text()}` },
        502,
      );
    }

    const data = await res.json();
    return json({ accessToken: data.accessToken });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});