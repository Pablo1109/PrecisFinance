# Precis Finance

Aplicativo web de controle financeiro pessoal com login em nuvem: contas, cartões, lançamentos, orçamentos, metas, relatórios, importações, automações, modo offline e sincronização por usuário.

## O que está pronto

- Dashboard com patrimônio, receitas, despesas, saldo do mês e alertas de orçamento.
- Lançamentos manuais com conta, cartão, categoria, subcategoria, tags, local, observação, recorrência e anexo nominal.
- Contas multi-moeda com conversão por taxas editáveis.
- Cartões de crédito com limite, fechamento, vencimento e projeção de fatura.
- Orçamentos por categoria com alertas de 50%, 80% e 100%.
- Metas financeiras com progresso e aportes.
- Relatórios com gráficos em canvas, filtros e exportação CSV/Excel.
- Importação de extrato CSV e leitura de notificações/SMS colados manualmente.
- Login por e-mail/senha via Supabase Auth.
- Dados separados por usuário e sincronizados em nuvem pela tabela `finance_states`.
- PWA com service worker para abrir offline depois do primeiro carregamento.

## Configurar login em nuvem

1. Crie um projeto no Supabase.
2. No Supabase, abra o SQL Editor e rode o arquivo `database/supabase.sql`.
3. Em Authentication, deixe Email/Password ativo.
4. No Vercel, configure as variáveis de ambiente:

```text
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua-chave-anon-public
```

5. Faça um novo deploy. O build gera `public/src/env.js` com essas variáveis.

## Limites honestos da versão atual

Esta versão já sincroniza os dados financeiros por usuário em nuvem. Ela ainda não conecta bancos reais por Open Finance e não lê SMS automaticamente do celular. Essas partes exigem credenciais regulatórias/fornecedor de Open Finance e app nativo ou wrapper mobile.

## Rodar localmente

```bash
python -m http.server 5173
```

Depois abra:

```text
http://localhost:5173
```

Para testar login em nuvem localmente, edite `src/env.js` com suas chaves públicas do Supabase. Não coloque chaves secretas nesse arquivo.

## Publicar no Vercel

1. Envie estes arquivos para um repositório no GitHub.
2. No Vercel, importe o repositório.
3. Use o preset `Other`.
4. Configure `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
5. Publique.

O arquivo `vercel.json` já aponta a saída para `public`, criada pelo script de build.
