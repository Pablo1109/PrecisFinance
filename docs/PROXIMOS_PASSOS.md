# Próximos passos — Motor de Tratamento (handoff)

> Documento para quem vai pegar o repo agora.  
> O Precis Finance deixou de ser um espelho do Pluggy e passou a ter um **motor próprio** que normaliza, valida, corrige e preserva edições do usuário.

---

## Resumo em uma frase

**Open Finance é só a entrada. Tudo que a UI mostra passa por `precis_cards` / `precis_entries`, resolvidos pelo Data Resolution Engine (DRE).**

---

## Arquitetura atual

```
Banco → Pluggy → Motor de Tratamento → Precis Finance
                      │
                      ├─ precis_cards        (cartões normalizados)
                      ├─ precis_entries      (lançamentos unificados)
                      ├─ precis_field_overrides (correções manuais por campo)
                      └─ precis_review_queue  (conflitos, conciliação, incompletos)
                      │
                      ▼
              CardService / EntryService → React UI
```

**Regra de ouro:** nenhuma tela nova deve ler `pluggy_*` diretamente. Sempre passar por Services.

---

## O que já está pronto

### Backend (Edge Functions)

| Arquivo | O que faz |
|---------|-----------|
| `supabase/functions/_shared/precis-projection.ts` | Motor principal: projeta Pluggy → Precis |
| `supabase/functions/_shared/classification.ts` | Classificação na ingestão (learned → keyword → Pluggy) |
| `supabase/functions/_shared/reconciliation-match.ts` | Conciliação manual ↔ OF |
| `supabase/functions/pluggy-sync/index.ts` | Sync por item (usa o motor) |
| `supabase/functions/pluggy-webhook/index.ts` | Webhook + projeção Precis |

**Comportamentos implementados:**

- **Cartões:** cada campo (limite, fatura, vencimento etc.) tem origem própria via DRE
- **Heurística Nubank:** se fatura atual ≈ limite utilizado, descarta o valor (força revisão/manual)
- **Overrides:** campos corrigidos pelo usuário **não são sobrescritos** na sync
- **Conflitos:** quando OF muda e existe override → entra na `precis_review_queue`
- **Lançamentos:** UPSERT por `external_hash` (nunca duplica)
- **Classificação automática:** regras aprendidas + keywords na ingestão
- **Conciliação:** score ≥ 95 auto-merge; 70–94 sugere na fila de revisão
- **1ª conexão:** `pluggy-sync` cria o `pluggy_items` se ainda não existir
- **Segurança:** valida se o `item_id` pertence ao usuário (exceto bootstrap inicial)

### Frontend (React)

| Rota | Tela |
|------|------|
| `/cartoes` | Lista de cartões resolvidos (badges de origem) |
| `/cartoes/:cardId` | Detalhe com sincronizado / manual / final + correção + reverter |
| `/lancamentos` | Dashboard de lançamentos (`precis_entries`) |
| `/correcao/open-finance` | Fila de revisão + cartões com dados fracos |

### Engines + Services

- `src/engines/` — DRE, Classificação, Conciliação, Confiança (lógica pronta)
- `src/services/CardService.ts` — padrão a seguir para outros domínios
- `src/services/EntryService.ts` — lançamentos + aprendizado de categoria
- `src/repositories/ReviewQueueRepository.ts` — fila pós-sync

### Outros

- `.gitignore` adicionado (`.env`, `node_modules/`, `dist/`)
- `env.example` com placeholders do Supabase
- `pluggy.js` corrigido: envia `item_id` + `itemId` para o sync

---

## O que você precisa fazer agora (checklist)

### 1. Banco — rodar migrations (se ainda não rodou)

No **SQL Editor do Supabase**, em ordem:

```
database/pluggy.sql
database/pluggy_v2.sql
database/pluggy_owner_label.sql
database/supabase.sql
database/migrations/003_data_resolution.sql
```

Todas são idempotentes (pode rodar de novo sem quebrar).

### 2. Secrets no Supabase

```bash
supabase secrets set \
  PLUGGY_CLIENT_ID=... \
  PLUGGY_CLIENT_SECRET=... \
  PLUGGY_WEBHOOK_SECRET=... \
  SUPABASE_ANON_KEY=...
```

> `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já vêm por padrão no Supabase.

### 3. Deploy das Edge Functions

```bash
supabase functions deploy pluggy-connect-token
supabase functions deploy pluggy-list-items
supabase functions deploy pluggy-sync
supabase functions deploy pluggy-sync-all
supabase functions deploy pluggy-webhook --no-verify-jwt
```

> O `--no-verify-jwt` no webhook é obrigatório — o Pluggy chama sem JWT de usuário.  
> Configure `PLUGGY_WEBHOOK_SECRET` para proteger o endpoint.

### 4. Backfill — popular precis_* com dados existentes

Se já tinha contas conectadas antes do motor, rode um sync completo:

```bash
curl -X POST https://<projeto>.supabase.co/functions/v1/pluggy-sync-all \
  -H "Authorization: Bearer <access_token_do_usuario>"
```

Ou reconecte/sincronize cada banco pelo app.

### 5. Frontend — Vercel

Variáveis:

```
VITE_SUPABASE_URL=https://<projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Build: `npm run build` → output `dist/`

### 6. Testar o fluxo completo

- [ ] Conectar um banco via Pluggy Connect
- [ ] Ver cartões em `/cartoes` com badges (OF / Calc / Manual)
- [ ] Corrigir fatura de um Nubank em `/cartoes/:id` → valor manual deve prevalecer
- [ ] Rodar sync de novo → correção **não** deve sumir
- [ ] Ver lançamentos em `/lancamentos`
- [ ] Ver fila em `/correcao/open-finance` (incompletos, conflitos, conciliação)
- [ ] Criar lançamento manual parecido com um do OF → deve sugerir conciliação

---

## Exemplo real: cartão Nubank

| Campo | Open Finance | Manual | Valor final |
|-------|-------------|--------|-------------|
| Limite total | R$ 15.000 | — | R$ 15.000 (OF) |
| Limite utilizado | — | — | R$ 3.200 (Calculado) |
| Fatura atual | R$ 12.000 ❌ | R$ 4.400 | **R$ 4.400 (Manual)** |
| Vencimento | — | dia 10 | **dia 10 (Manual)** |

O valor sincronizado errado fica guardado no `precis_cards`. O override fica em `precis_field_overrides`. O DRE escolhe o manual na leitura.

---

## Tabelas importantes

| Tabela | Função |
|--------|--------|
| `pluggy_*` | Raw do Pluggy (só backend/sync escreve) |
| `precis_cards` | Snapshot OF dos cartões (campos dedicados) |
| `precis_entries` | Lançamentos unificados (coração do dashboard) |
| `precis_field_overrides` | Correção manual por campo |
| `precis_field_history` | Auditoria de alterações |
| `precis_learned_categories` | Categorias aprendidas (iFood → Alimentação) |
| `precis_review_queue` | Fila pós-sync (revisar/conciliar) |
| `precis_sync_runs` | Log de cada sync |

---

## O que ainda NÃO está feito (Fase 2)

Prioridade sugerida:

1. **Tela de conectar banco no React** — hoje `openfinance.js` / `pluggy.js` existem mas não estão no app React (`main.tsx`). Precisa de uma rota tipo `/open-finance` reutilizando `openPluggyConnect()`.

2. **Edição de categoria nos lançamentos** — `EntryService.setCategory()` existe, falta UI inline em `/lancamentos`.

3. **Migrar dashboard legado** — `src/app.js` (135KB) ainda lê `pluggy_*` direto. Não está no build atual, mas é o app antigo. Migrar fluxo de caixa, orçamentos, metas para consumir `precis_entries` via services.

4. **Investimentos e empréstimos com override** — mesma receita do `CardService` (campos dedicados + DRE).

5. **Otimizar webhook** — hoje roda sync Pluggy + projeção Precis (busca transações 2x). Unificar em um único path.

6. **Testes automatizados** — engines (`DRE`, `Classification`, `Reconciliation`) são funções puras, fáceis de testar.

---

## Padrão para criar novos domínios

Copiar o que `CardService` faz:

```
Repository (lê tabela precis_*)
    → monta candidatos [openfinance, calculated, manual]
    → DataResolutionEngine.resolve()
    → ResolvedField<T> para a UI
```

Override manual:

```
OverridesRepository.upsert() → precis_field_overrides
Sync respeita overrides → precis-projection.ts
```

---

## Arquivos legados (não usar em código novo)

| Arquivo | Status |
|---------|--------|
| `src/app.js` | App monolítico antigo, fora do build |
| `src/openfinance.js` | UI de conexão, fora do build |
| `src/pluggy.js` | Helpers Pluggy (reutilizar no React) |

O build atual entra por `src/main.tsx` → React Router.

---

## Docs de referência

- `docs/ARCHITECTURE.md` — modelo mental completo
- `docs/DEPLOY.md` — deploy passo a passo
- `docs/MIGRATION_GUIDE.md` — migração do modelo antigo
- `README.md` — visão geral do projeto

---

## Dúvidas frequentes

**Posso commitar `.env`?**  
Não. Só `env.example` com placeholders. O `.gitignore` já bloqueia `.env`.

**A anon key do Supabase pode ir no frontend?**  
Sim, é pública por design. Segurança vem do RLS no Postgres.

**Onde ficam as credenciais do Pluggy?**  
Só nos secrets do Supabase (`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`). Nunca no frontend.

**Sync não popula cartões?**  
Verifique se a migration 003 rodou e se o deploy do `pluggy-sync` está atualizado. Rode o backfill (passo 4).
