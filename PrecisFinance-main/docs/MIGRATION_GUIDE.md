# Guia de migração da UI antiga (`src/app.js`) para v2

O `src/app.js` monolítico (135KB) deve ser desmontado por domínio conforme abaixo.
**Fase 1** já entrega a infraestrutura. **Fase 2+** migra as telas.

| Bloco em `app.js` | Nova localização |
|---|---|
| Fetch e formatação de cartões | `CardService.listResolved()` + `<FieldValue>` |
| Cálculo de limite utilizado / disponível | **remover** — feito pelo `DataResolutionEngine` |
| Regras de categorização inline | `ClassificationEngine` + `LearnedCategoriesRepository` |
| Dedupe manual de transações | `ReconciliationEngine.hash()` + UPSERT em `precis_entries` |
| Estado global de sync | `precis_sync_runs` + Supabase Realtime |
| Overrides ad-hoc no `finance_states` | migrar chave-a-chave para `precis_field_overrides` |

### Regra de ouro

> Se você está prestes a escrever `card.credit_data?.limit ?? overrideMap[id]?.limit`, pare. Use `CardService.getResolved(id).creditLimit.value`.

## Contrato de origem visível

Todo campo mostrado ao usuário deve renderizar via `<FieldValue field={...}/>` — assim a badge (`OF`, `Calc`, `Manual`, `Infer`) e a confiança aparecem automaticamente.

## Próximas fases (recomendado)

- **Fase 2** — Módulos de Dashboard, Fluxo de Caixa e Extrato consumindo `precis_entries`.
- **Fase 3** — Painel de revisão pós-sync + auto-classificação com aprendizado.
- **Fase 4** — Investimentos, empréstimos, orçamentos, metas.
- **Fase 5** — Multi-provider (adaptador para Belvo/Klavi/outros além do Pluggy).
