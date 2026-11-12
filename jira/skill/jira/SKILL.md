---
name: jira
description: >
  Ler as User Stories, bugs e comentários do Jira da KW Portugal (projecto KWTR, dvtpt.atlassian.net)
  com o token pessoal de quem está a trabalhar. Usar sempre que for preciso confirmar o que uma US
  diz (regras, permissões por perfil, critérios de aceitação), saber o estado de um ticket, procurar
  US sobre um tema ou ler os comentários da Devoteam. Usar também para distinguir bug de US por fazer.
  Cobre a configuração inicial: como cada pessoa cria o seu token e o guarda sem o expor. Só leitura.
---

# Jira KWTR: ler User Stories

## A ideia

Cada pessoa usa o **seu próprio token** da Atlassian. Não há um token partilhado. O token vem das
variáveis de ambiente `JIRA_EMAIL` e `JIRA_API_TOKEN` ou, se não existirem, do ficheiro
`~/.jira-kwtr/credenciais.json` (Windows: `%USERPROFILE%\.jira-kwtr\credenciais.json`), fora de
qualquer repositório. O script só faz pedidos GET: **nunca comenta, transita nem edita** issues.
Publicar no Jira é sempre trabalho da pessoa.

## Primeira vez: criar e guardar o token (a pessoa faz isto, não o agente)

1. Entrar em https://id.atlassian.com/manage-profile/security/api-tokens com a conta que tem
   acesso ao Jira `dvtpt.atlassian.net`.
2. **Create API token**: dar-lhe um nome (ex. `Claude Code`) e uma validade. Copiar o token.
3. Correr no **seu terminal**, fora do chat do Claude, para o token não passar pela conversa:
   ```
   python "%USERPROFILE%\.claude\skills\jira\jira.py" configurar
   ```
   O script pede o email e o token (sem eco), valida-os contra o Jira e grava-os.

O agente **nunca pede o token no chat** e nunca o escreve em ficheiros de projecto, `CLAUDE.md`
ou scripts. Se faltar token, diz à pessoa para fazer os passos acima.

Para revogar um token (por exemplo, se foi exposto), apagá-lo na mesma página da Atlassian e
correr `configurar` com um novo.

## Comandos

```bash
J="$HOME/.claude/skills/jira/jira.py"    # bash; em PowerShell: $J="$env:USERPROFILE\.claude\skills\jira\jira.py"
python "$J" testar                        # confirma o token e o acesso ao KWTR
python "$J" ler KWTR-14                   # US completa: estado, ligações, anexos, descrição, comentários
python "$J" ler 14 147 665                # várias de uma vez; sem prefixo assume KWTR
python "$J" ler KWTR-14 --sem-comentarios
python "$J" procurar "propriet*"          # pesquisa de texto no KWTR
python "$J" procurar "visita" --jql "status = Done AND issuetype = Story" --max 100
python "$J" procurar --jql "updated >= -7d"
python "$J" anexos KWTR-14 --pasta <pasta-temporária>   # descarrega mockups/diagramas para os ver
```

## Como ler bem uma US

- **A pesquisa de texto é sensível aos acentos.** `text ~ "proprietário"` pode vir vazio quando
  `"propriet*"` encontra 20. Usar radicais com `*` e repetir com sinónimos.
- **As regras de permissões estão espalhadas.** Ex.: o detalhe do imóvel é a KWTR-14, mas as
  permissões por perfil (Região / Market Center / Consultor) estão na KWTR-147. Seguir as
  `Ligação` que o `ler` mostra e procurar por "permiss*" e pelo perfil.
- **Os comentários contam.** As decisões fecham-se muitas vezes nos comentários, que alteram a
  descrição.
- **Os mockups vêm nos anexos.** Descarregá-los com `anexos` para uma pasta temporária e abri-los.
  Não os copiar para repositórios.
- **Bug vs. US por fazer:** uma divergência só é bug se contradiz uma US em estado **Done**. Se a
  US está To Do/New ou não tem critérios de aceitação, o comportamento ainda não está especificado.
- Ao citar uma US numa resposta, indicar a chave, o estado e o link `https://dvtpt.atlassian.net/browse/KWTR-N`.

## Erros

| Mensagem | O que fazer |
|---|---|
| `Sem token do Jira` | A pessoa corre `configurar` (secção acima). |
| `401` | Token revogado ou caducado: criar um novo e correr `configurar`. |
| `404` | A issue não existe ou a conta não tem acesso ao projecto. |

Requisitos: Python 3, só biblioteca padrão.
