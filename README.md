# Precis Finance

Aplicativo web de controle financeiro pessoal, inspirado nas categorias de recursos que você descreveu: contas, cartões, lançamentos, orçamentos, metas, relatórios, importações, automações, modo offline e bloqueio local por PIN.

## O que está pronto

- Dashboard com patrimônio, receitas, despesas, saldo do mês e alertas de orçamento.
- Lançamentos manuais com conta, cartão, categoria, subcategoria, tags, local, observação, recorrência e anexo nominal.
- Contas multi-moeda com conversão por taxas editáveis.
- Cartões de crédito com limite, fechamento, vencimento e projeção de fatura.
- Orçamentos por categoria com alertas de 50%, 80% e 100%.
- Metas financeiras com progresso e aportes.
- Relatórios com gráficos em canvas, filtros e exportação CSV/Excel.
- Importação de extrato CSV e leitura de notificações/SMS colados manualmente.
- PWA com service worker para abrir offline depois do primeiro carregamento.
- Bloqueio por PIN com criptografia local via Web Crypto quando ativado.

## Limites honestos da versão estática

Esta versão não conecta bancos reais por Open Finance, não lê SMS automaticamente do celular e não sincroniza dados entre dispositivos em nuvem. Essas partes exigem backend, credenciais regulatórias/fornecedor de Open Finance e app nativo ou wrapper mobile. A interface e a arquitetura de dados já deixam o caminho preparado para plugar esses serviços depois.

## Rodar localmente

```bash
python -m http.server 5173
```

Depois abra:

```text
http://localhost:5173
```

Também dá para abrir o `index.html` direto no navegador, mas o modo offline/PWA precisa de servidor HTTP.

## Publicar no Vercel

1. Envie estes arquivos para um repositório no GitHub.
2. No Vercel, importe o repositório.
3. Use o preset `Other`.
4. Deixe o diretório de saída como a raiz do projeto.
5. Publique.

O arquivo `vercel.json` já inclui URLs limpas e redirecionamentos básicos.
