import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const TITLES: Record<string, string> = {
  "/dashboard": "Visão geral",
  "/lancamentos": "Lançamentos",
  "/extrato": "Extrato unificado",
  "/contas": "Contas",
  "/cartoes": "Cartões",
  "/cartoes-of": "Cartões Open Finance",
  "/orcamentos": "Orçamentos",
  "/metas": "Metas",
  "/relatorios": "Relatórios",
  "/automacoes": "Automações",
  "/open-finance": "Open Finance",
  "/correcao/open-finance": "Correção Open Finance",
  "/seguranca": "Segurança",
};

export function PageTitle() {
  const { pathname } = useLocation();
  const title = TITLES[pathname] || "Precis Finance";
  useEffect(() => {
    document.title = `${title} — Precis Finance`;
    const el = document.getElementById("viewTitle");
    if (el) el.textContent = title;
  }, [title]);
  return null;
}
