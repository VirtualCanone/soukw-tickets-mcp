# SouKW: tickets do Suporte e Jira no Claude

Duas ligações para trabalhar com o Claude (Desktop ou Code) no SouKW 2.0 da KW Portugal:

1. **Tickets do Suporte** (`mcp-tickets/`): uma extensão MCP que deixa o Claude listar, ler, comentar e gerir os tickets do Suporte do SouKW em Production, **em seu nome** e com o mesmo acesso que tem nos ecrãs do Suporte.
2. **Jira KWTR** (`jira/`): uma skill do Claude Code para ler, **só em leitura**, as User Stories, bugs e comentários do projecto KWTR em `dvtpt.atlassian.net`, com o seu próprio token Atlassian.

Preparado pela equipa SouKW V2 para a Marta e o André.

## O que precisa
- Claude Desktop e/ou Claude Code.
- Node.js 20+ (só para usar os tickets no Claude Code; o Claude Desktop não precisa).
- Python 3 (para o Jira).
- **A sua chave pessoal dos tickets.** Não está neste repositório: **chega-lhe à parte, por canal privado**. É só sua; tudo o que o Claude fizer com ela fica em seu nome.
- **O seu token Atlassian**, que cria você mesmo (ver `jira/GUIA.md`).

## Passos curtos
**Tickets do Suporte**
1. Faça duplo clique em `mcp-tickets/dist/soukw-tickets-0.2.0.mcpb` (Claude Desktop) e carregue em Instalar.
2. Cole a sua chave pessoal no campo "Chave pessoal"; o endereço de Production já vem preenchido.
3. Numa conversa nova: *"Quem sou eu no Suporte do SouKW?"*

Claude Code e problemas comuns: [mcp-tickets/INSTALAR.md](mcp-tickets/INSTALAR.md). Contrato técnico: [mcp-tickets/CONTRATO_TicketsMCP.md](mcp-tickets/CONTRATO_TicketsMCP.md).

**Jira**
1. Crie o seu token em https://id.atlassian.com/manage-profile/security/api-tokens.
2. Copie `jira/skill/jira` para `%USERPROFILE%\.claude\skills\`.
3. No seu terminal: `python "%USERPROFILE%\.claude\skills\jira\jira.py" configurar`, depois `... testar`.

Detalhe: [jira/GUIA.md](jira/GUIA.md).

## Regras de segurança
- **Nunca** ponha chaves, tokens ou passwords neste repositório (o `.gitignore` bloqueia os nomes habituais, mas não é rede de segurança).
- Não cole a chave nem o token no chat do Claude: configure-os no seu terminal ou no formulário da extensão.
- Os tickets são dados reais de Production. O Claude pede confirmação antes de cada acção: leia antes de aceitar, sobretudo ao mudar estado, escalar ou apagar comentários.
- Se uma chave ou token for exposto, avise a equipa SouKW V2 (chave dos tickets) ou revogue-o na Atlassian (token Jira).

## Estrutura
```
mcp-tickets/
  dist/soukw-tickets-0.2.0.mcpb   extensão pronta a instalar
  servidor/                       código do servidor MCP (Node), testes com mock e script de empacotamento
  INSTALAR.md                     instalação no Claude Desktop e no Claude Code
  CONTRATO_TicketsMCP.md          contrato da API TicketsMCP
jira/
  GUIA.md                         criar o token, guardá-lo e instalar a skill
  skill/jira/                     skill pronta a copiar para ~/.claude/skills/ (SKILL.md + jira.py)
```
