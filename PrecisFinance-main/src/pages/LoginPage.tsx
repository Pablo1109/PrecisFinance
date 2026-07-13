import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { authErrorMessage } from "@/lib/authErrors";
import { supabaseConfig } from "@/lib/supabase";

export function LoginPage() {
  const { signIn, signUp, configured } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    const name = String(fd.get("name") || "");
    setBusy(true);
    setError("");
    try {
      if (mode === "in") await signIn(email, password);
      else await signUp(email, password, name);
      navigate("/dashboard");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <section className="lock-screen">
        <section className="lock-panel auth-panel">
          <img src="/assets/icon.svg" alt="" />
          <h2>Configurar Supabase</h2>
          {supabaseConfig.issues.map((issue) => (
            <p key={issue} className="muted">{issue}</p>
          ))}
          <pre className="setup-code" style={{ textAlign: "left", fontSize: 12 }}>
{`VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...`}
          </pre>
          <p className="muted">Pegue em Supabase → Settings → API. Reinicie o Vite após editar o .env.</p>
          <button type="button" className="secondary-action" onClick={() => navigate("/dashboard")}>
            Continuar sem nuvem
          </button>
        </section>
      </section>
    );
  }

  return (
    <section className="lock-screen">
      <form className="lock-panel auth-panel" onSubmit={onSubmit}>
        <img src="/assets/icon.svg" alt="" />
        <h2>Precis Finance</h2>
        <p>Entre para sincronizar suas finanças em qualquer dispositivo.</p>
        {mode === "up" && (
          <label className="field">Nome<input name="name" autoComplete="name" /></label>
        )}
        <label className="field">E-mail<input name="email" type="email" required autoComplete="email" /></label>
        <label className="field">Senha<input name="password" type="password" required minLength={6} autoComplete="current-password" /></label>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <button type="submit" className="primary-action" disabled={busy}>
          {busy ? "Aguarde…" : mode === "in" ? "Entrar" : "Criar conta"}
        </button>
        <button type="button" className="secondary-action" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Criar conta" : "Já tenho conta"}
        </button>
        <button type="button" className="ghost-action" onClick={() => navigate("/dashboard")}>
          Pular login (local)
        </button>
      </form>
    </section>
  );
}
