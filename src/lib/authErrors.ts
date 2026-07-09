import type { AuthError } from "@supabase/supabase-js";

export function authErrorMessage(err: unknown): string {
  const e = err as AuthError & { code?: string };
  const code = e?.code || "";

  const map: Record<string, string> = {
    invalid_credentials:
      "E-mail ou senha incorretos — ou essa conta ainda não existe no Supabase. Use «Criar conta» se for a primeira vez.",
    email_not_confirmed:
      "Confirme seu e-mail antes de entrar. Verifique a caixa de entrada (e spam).",
    user_already_registered: "Este e-mail já está cadastrado. Use «Entrar».",
    weak_password: "Senha fraca — use pelo menos 6 caracteres.",
    over_request_rate_limit: "Muitas tentativas. Aguarde um minuto e tente de novo.",
  };

  if (code && map[code]) return map[code];
  return e?.message || "Erro ao autenticar.";
}
