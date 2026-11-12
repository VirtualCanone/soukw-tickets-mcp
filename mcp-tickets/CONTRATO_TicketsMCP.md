# Contrato TicketsMCP v0.2 (2026-11-09)

> Documento técnico de referência: o que o servidor MCP envia e recebe do SouKW. Para instalar, basta o `INSTALAR.md`.

Pedido do Ricardo (2026-11-09): MCP para gestão de tickets do Suporte, ligado ao Claude, para 3 pessoas da KW Portugal; ler, responder e toda a gestão. "O mais rapidamente possível".

## Arquitectura
```
Claude Desktop / Claude Code (3 pessoas)
  └─ servidor MCP local (Node, stdio, extensão .mcpb)   ← mcp_tickets/servidor/
       └─ HTTPS POST /SouKWLiderancas/rest/TicketsMCP/acao   (1 método REST = 1 AO)
            └─ SouKWLiderancas: Sup_MCP_* → mesmas regras dos ecrãs do Suporte, agindo como o dono da chave
```
- Sem OAuth: só Claude Desktop/Code. Remoto (claude.ai web/telemóvel) fica para depois, por cima disto.
- Nenhuma entidade nova (sem AO a mais). Chaves na Setting `Sup_MCP_Chaves`.

## Autenticação
- Cabeçalho `X-TicketsMCP-Chave: <chave pessoal>` (≥ 32 bytes aleatórios, base64url).
- Setting `Sup_MCP_Chaves` (por stage, Portal/API), **Secret**, formato `email=chave;email=chave` (máx. 2000). **Mudança face à v0.1:** não há SHA-256 na app nem nas dependências (inventário do Mentor, 2026-11-09) e uma External Library obrigaria a criar um asset no Portal. A Setting é secreta (cifrada, não se relê no Portal), como a `ImportReScoreChave`. A chave nunca vai para ficheiros do projecto nem para o git.
- `OnAuthentication`: procura a chave na Setting; sem par → 401. Com par → resolve o `UserId` do SouKW pelo email (`Associate_Associate.EmailKW`); associado inactivo ou sem perfil → 403.
- Setting `Sup_MCP_Ativo` (Boolean, False por omissão) → 503 `INACTIVO` quando False.
- Todas as acções correm **como esse UserId**: o mesmo acesso que ele tem nos ecrãs (MC Staff / Região / Dev Team), e o Histórico/comentários ficam em nome dele.

## Pedido e resposta
POST, corpo JSON:
```json
{ "acao": "listar_tickets", "args": { ... } }
```
Resposta 200:
```json
{ "ok": true, "dados": { ... } }
```
Erro de negócio (200): `{ "ok": false, "erro": { "codigo": "SEM_ACESSO|NAO_EXISTE|TRANSICAO_INVALIDA|ARGS_INVALIDOS|ACAO_DESCONHECIDA|ERRO_INTERNO", "mensagem": "..." } }`.
HTTP: 401 sem chave ou chave inválida; 403 utilizador inactivo; 503 `INACTIVO` com `Sup_MCP_Ativo` = False. `ERRO_INTERNO` é novo (excepção não prevista; detalhe só no log).

## Acções (nomes finais; campos ajustados pelo agente do Studio ao modelo real — ver §Campos)
| acao | args | faz |
|---|---|---|
| `listar_tickets` | `separador?` (todos/escalados/atribuidos_mim/...), `estado?`, `mc?`, `atribuido_a?`, `texto?`, `pagina?`, `por_pagina?` (≤ 50) | como os separadores/filtros do ecrã |
| `ver_ticket` | `ticket_id` | detalhe + Histórico + comentários + anexos (só nome/tamanho) |
| `comentar` | `ticket_id`, `texto`, `interno?` | como o ecrã |
| `mudar_estado` | `ticket_id`, `estado`, `comentario?` | só transições válidas (`Sup_InvalidStageTransition` → `TRANSICAO_INVALIDA`) |
| `atribuir` | `ticket_id`, `utilizador` (id ou email) | como o ecrã |
| `escalar` | `ticket_id`, `motivo?` | como o ecrã |
| `listar_opcoes` | `ticket_id?`, `texto?` | estados, prioridades, tipos, pools; com `ticket_id`, os possíveis responsáveis desse pedido (como o ecrã) |
| `quem_sou` | — | nome, email, perfil, MC (para o Claude saber o contexto) |
| `reclassificar` | `ticket_id`, `prioridade?`, `tipo?`, `pool?` | **nova** (existe no ecrã: `Sup_TicketReclassify`); o que não vier fica como está. Só Staff MC/Região, estado em curso |
| `apagar_comentario` | `ticket_id`, `comentario_id` | **nova**, pedido do Ricardo (2026-11-09). **Só o autor** (mais estrito que o ecrã, onde Staff MC/Região também apagam). Comentário de outro → `SEM_ACESSO`; inexistente ou de outro pedido → `NAO_EXISTE`. Reutiliza `Sup_TicketCommentDelete`: apaga de vez e deixa no Histórico "Comentário" → "Comentário eliminado" (o modelo não tem atributo de apagado) |

Fora desta versão: criar ticket e anexar ficheiros (o ecrã tem; ficam para depois). "Fechar" = `mudar_estado` para `Resolvido`/`Cancelado`/`Arquivado`; não há "reabrir" no ecrã.

## Regras
- Reutilizar a lógica `Sup_` existente; se ela depender de `GetUserId()`/sessão (`Sup_GetSessionAccessContext`, `Sup_CanSessionAccessTicket`, `Sup_CanSessionWriteTicket`), extrair a versão com `UserId` como input e pôr os ecrãs a chamar essa (sem duplicar lógica; regras_build.md).
- Notificações e emails: o mesmo comportamento que o ecrã (os emails do Suporte estão desligados em Prod; não ligar).
- Respostas sem NIF, morada, data de nascimento. Nomes e emails só dos intervenientes no ticket.
- Log `Support.MCP` por pedido: acao, UserId, ticket_id, resultado (sem corpo).

## Campos

### Identificadores
- `ticket_id`: inteiro (`Sup_Ticket.Id`). A referência visível é `referencia` (`SUP-000098`).
- Utilizadores (`aberto_por_id`, `atribuido_a_id`, `autor_id`, `user_id`, arg `utilizador`, arg `atribuido_a`): **texto** (o `UserId` do ODC, igual ao `Associate_General.UserId`), **não inteiro**. `utilizador` em `atribuir` aceita esse id ou o email KW.
- `comentario_id`: inteiro (`Sup_TicketComment.Id`).
- `mc`: inteiro (`MarketCenterId`).
- Datas: texto ISO 8601 UTC (`2026-11-09T15:40:00Z`).

### Estados (`Sup_TicketStatus`, Static; o arg `estado` aceita o Id, sem acentos)
| Id | Label | em curso |
|---|---|---|
| `Pendente` | Pendente | sim |
| `EmAnalise` | Em Análise | sim |
| `PendenteDeInformacao` | Pendente de Informação | sim |
| `EmResolucao` | Em Resolução | sim |
| `Resolvido` | Resolvido | não |
| `Cancelado` | Cancelado | não |
| `Arquivado` | Arquivado (final) | não |

### `mudar_estado`: transições (as mesmas funções `Sup_TicketCan*` dos botões, mais `Sup_TicketCanWrite`)
| de → `estado` | quem | action |
|---|---|---|
| Pendente → `EmAnalise` | responsável, Staff MC ou Região | `Sup_TicketStartAnalysis` |
| EmAnalise → `EmResolucao` | quem pode Resolver | `Sup_TicketStartResolution` |
| Pendente/EmAnalise/EmResolucao → `Resolvido` | responsável, Staff MC ou Região | `Sup_TicketResolveTicket` |
| Pendente/EmAnalise/EmResolucao → `PendenteDeInformacao` | idem | `Sup_TicketRequestMoreInfo` |
| PendenteDeInformacao → `EmAnalise` | autor ou Região | `Sup_TicketProvideInfoandResumeAnalysis` |
| Pendente/EmAnalise/PendenteDeInformacao/EmResolucao → `Cancelado` | só o autor | `Sup_TicketCancelTicket` |
| Resolvido/Cancelado → `Arquivado` | autor, Staff MC ou Região | `Sup_TicketArchiveTicket` |

Pedido escalado: só escreve a Região ou o Staff do MC do pedido. Fora da tabela → `TRANSICAO_INVALIDA`; sem permissão de escrita → `SEM_ACESSO`. `comentario?` grava-se como comentário público depois da transição.

### Outras regras (iguais ao ecrã)
- `comentar`: quem pode escrever no pedido; `interno` só conta para Staff MC/Região (consultor → sempre público).
- `atribuir`: só Staff MC/Região, pedido não Cancelado/Arquivado; o responsável tem de ser do MC do pedido (a Região pode ainda atribuir a associados Região activos).
- `escalar`: só Staff MC do MC do pedido, não escalado, estado em curso; `motivo` **obrigatório** (≤ 500). Irreversível; avisa a Região.
- `prioridade`/`tipo`/`pool`: Ids (texto) das Static `Sup_TicketPriority` (4), `Sup_TicketType` (11, cada uma com `pool`), `Sup_TicketPool` (6); lista em `listar_opcoes`.

### `listar_tickets`
- `separador`: `mc` (todos do meu MC, só Staff MC), `meus` (abertos por mim ou atribuídos a mim), `todos`, `escalados`, `atribuidos_mim` (só Região). Omissão: `mc` para Staff MC, `todos` para Região, `meus` para os outros. Separador sem acesso → `SEM_ACESSO`.
- `estado`: Id, `em_curso` (omissão: os 4 em curso) ou `todos`. `mc` (inteiro, só Região). `atribuido_a`: id, email ou `sem`. `texto`: na referência e no título. `pagina` (1..), `por_pagina` (1..50, omissão 20). Ordem: `actualizado_em` desc.
- dados: `{ "total", "pagina", "por_pagina", "tickets": [ { "id", "referencia", "titulo", "estado", "estado_label", "prioridade", "prioridade_label", "tipo_label", "pool_label", "mc", "mc_nome", "aberto_por_nome", "atribuido_a_id", "atribuido_a_nome", "escalado", "sla_incumprido", "criado_em", "actualizado_em" } ] }`

### `ver_ticket`
dados: `{ "ticket": { …campos da lista…, "descricao", "aberto_por_id", "escalado_em", "motivo_escalamento", "resolvido_em", "pode_escrever", "transicoes": ["EmAnalise", …], "pode_escalar", "pode_atribuir", "pode_reclassificar" }, "comentarios": [ { "id", "autor_id", "autor_nome", "texto", "interno", "criado_em", "e_meu" } ], "historico": [ { "campo", "de", "para", "por_nome", "em" } ], "anexos": [ { "id", "nome", "tamanho" } ] }`. Internos só para Staff MC/Região (como no ecrã). Máx. 200 comentários e 200 linhas de Histórico, mais recentes primeiro.

### Outras respostas
- `comentar` → `{ "comentario_id" }`; `mudar_estado` → `{ "estado", "estado_label" }`; `atribuir` → `{ "atribuido_a_id", "atribuido_a_nome" }`; `escalar` → `{ "escalado": true }`; `reclassificar` → `{ "prioridade", "tipo", "pool" }`; `apagar_comentario` → `{ "apagado": true }`.
- `listar_opcoes` → `{ "estados": [ {id,label,em_curso} ], "prioridades": [ {id,label} ], "tipos": [ {id,label,pool} ], "pools": [ {id,label} ], "responsaveis": [ {id,nome,regiao} ] }` (`responsaveis` só com `ticket_id`; máx. 50, mais 50 Região para a Região; `texto` filtra pelo nome).
- `quem_sou` → `{ "user_id", "nome", "email", "perfil": "Regiao|MarketCenter|Proprio", "mc", "mc_nome" }`.

### Log
`LogMessage` com Category `Support.MCP`: `acao=… user=… ticket=… resultado=ok|<codigo>` (sem corpo nem texto de comentários).
