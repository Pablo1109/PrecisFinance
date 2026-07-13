# Precis Finance — Arquitetura (Fase 1)

## Filosofia

O Open Finance é **uma das fontes** de dados — não a verdade absoluta. Toda informação passa por um pipeline determinístico antes de chegar à UI:

```
Origem → Validar → Normalizar → Comparar → Calcular → Aplicar regras → Aplicar overrides do usuário → Salvar
```

Nenhuma tela consulta `pluggy_*` diretamente. Todas as telas consomem serviços que devolvem `ResolvedField<T>` (valor + fonte + confiança + motivo).

## Camadas

```
UI (React)
  └─ Services (CardService, EntryService, DashboardService, ...)
        └─ Engines (DataResolutionEngine, ClassificationEngine, ReconciliationEngine, ConfidenceEngine)
              └─ Repositories (Cards, Entries, Overrides, LearnedCategories, ...)
                    └─ Supabase (RLS + Data API + Realtime)
                          └─ Edge Functions (Deno) que escrevem via service_role
                                └─ Pluggy REST
```

### Engines (`src/engines/`)

| Engine | Responsabilidade |
|---|---|
| `ConfidenceEngine` | Atribui score 0..100 por (source, entity, field). Baseado em observação empírica das falhas do Open Finance. |
| `DataResolutionEngine` | Recebe candidatos `{value, source}` para um campo e escolhe o vencedor. Devolve `ResolvedField<T>`. |
| `ClassificationEngine` | Categoriza uma transação com prioridade: manual → aprendida → keyword → Pluggy → "outros". Também expõe `shouldLearn()`. |
| `ReconciliationEngine` | Gera hash determinístico (dedupe) e detecta candidatos de conciliação manual↔OF. Auto-merge apenas ≥95 score. |

### Services (`src/services/`)

Composição das engines com repositórios. Ex.: `CardService.getResolved(cardId)` monta a lista de candidatos por campo (OF, calculado, override) e devolve `ResolvedCard` pronto para a UI.

### Repositories (`src/repositories/`)

Só falam com Supabase. Nenhuma regra de negócio. RLS aplicada.

## Fontes por campo (exemplo Cartão Nubank)

| Campo | Origem escolhida (padrão) |
|---|---|
| `credit_limit` | Open Finance (95%) — override manual sobrescreve com 100% |
| `available_limit` | Open Finance (80%) ou calculado |
| `used_limit` | Calculado (100%) = `credit_limit - available_limit` |
| `current_bill_amount` | Manual quando existir; senão OF (45%) |
| `due_day`, `closing_day` | Manual sempre que OF vier vazio |

## Overrides por campo

Tabela `precis_field_overrides (user_id, entity, entity_id, field, value, source, confidence, reason)`.

- Chave única `(user_id, entity, entity_id, field)`.
- Toda sincronização respeita overrides — nunca sobrescreve.
- UI exibe `<FieldValue>` com badge de origem e barra de confiança.

## Lançamentos (`precis_entries`)

Coração transversal do sistema. Toda transação (OF, manual, importada) vira uma linha.

- `external_hash` (SHA-1 de `accountId|date|amount|descNormalizada|sourceRef`) garante idempotência.
- `source` marca a origem, `reconciled_with` liga duplicatas conciliadas.
- Dashboard, fluxo de caixa, orçamentos e relatórios devem consumir apenas `precis_entries` (nunca `pluggy_transactions`).

## Painel de revisão (`precis_review_queue`)

Ao final de cada sync, itens que precisam de atenção humana aparecem aqui:

- `card_incomplete` — datas ou limite ausentes.
- `reconcile_candidate` — transação OF com match provável em lançamento manual.
- `category_learned` — nova regra aprendida (auditar).
- `conflict` — valor OF divergente de override.

## Sync incremental

`pluggy_accounts.last_tx_synced_at` guarda o último ciclo. A edge function `pluggy-sync` puxa `/v2/transactions?dateFrom=<since>` (paginação por cursor) e usa `UPSERT` via `external_hash` — zero duplicidade.
