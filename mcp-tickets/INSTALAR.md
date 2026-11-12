# Tickets do Suporte no Claude: instalação

Liga o Claude (Desktop ou Code) aos tickets do Suporte do SouKW 2.0 (Production). O Claude passa a poder listar, ler, comentar, mudar o estado, atribuir, escalar e reclassificar tickets, e apagar os seus próprios comentários, **em seu nome**, com o mesmo acesso que tem nos ecrãs do Suporte.

Precisa de duas coisas:
- o ficheiro `dist/soukw-tickets-0.2.0.mcpb`, que está neste repositório;
- a sua **chave pessoal**, que **não está neste repositório**: chega-lhe à parte, por canal privado. É só sua: tudo o que o Claude fizer com ela fica registado em seu nome. Não a cole em chats, emails, documentos, nem em nenhum ficheiro deste repositório.

Endereço do serviço (Production), já preenchido na extensão:
`https://kwportugal.outsystems.app/SouKWLiderancas/rest/TicketsMCP`

## Claude Desktop (recomendado)
1. Feche e volte a abrir o Claude Desktop, para garantir que está actualizado.
2. Faça duplo clique em `dist/soukw-tickets-0.2.0.mcpb` (ou arraste-o para a janela do Claude Desktop, em **Definições > Extensões**).
3. Carregue em **Instalar**.
4. No formulário da extensão:
   - **Endereço do SouKW**: deixe o que vem preenchido;
   - **Chave pessoal**: cole a sua chave (o campo é marcado como sensível e fica guardado pelo Claude Desktop, não em texto no repositório).
5. Confirme que a extensão "SouKW Tickets do Suporte" fica **activa**.
6. Numa conversa nova, peça por exemplo: *"Quem sou eu no Suporte do SouKW?"* ou *"Lista os tickets atribuídos a mim."*

O Claude pede confirmação antes de usar cada ferramenta. Nas que gravam (comentar, mudar estado, atribuir, escalar, reclassificar, apagar comentário), leia o que vai ser enviado antes de aceitar. **Apagar um comentário é definitivo** e escalar não se desfaz. Os dados são reais (Production).

**Actualizar:** instale o `.mcpb` novo por cima; a chave mantém-se.
**Trocar a chave:** Definições > Extensões > SouKW Tickets do Suporte > Configurar.

## Claude Code (alternativa)
Requer Node.js 20 ou superior. O `.mcpb` é um zip que já traz as dependências. Desempacote-o numa pasta sua (PowerShell):

```powershell
$destino = "$env:USERPROFILE\Ferramentas\soukw-tickets"
Copy-Item .\dist\soukw-tickets-0.2.0.mcpb "$env:TEMP\soukw-tickets.zip"
Expand-Archive "$env:TEMP\soukw-tickets.zip" -DestinationPath $destino -Force
```

Registe o servidor, **no seu terminal** (não no chat do Claude, para a chave não passar pela conversa):

```powershell
claude mcp add soukw-tickets --scope user `
  --env TICKETSMCP_URL=https://kwportugal.outsystems.app/SouKWLiderancas/rest/TicketsMCP `
  --env TICKETSMCP_CHAVE=<a sua chave> `
  -- node "$env:USERPROFILE\Ferramentas\soukw-tickets\src\index.js"
```

Confirme com `claude mcp list` (deve aparecer `soukw-tickets` ligado). Atenção: o `claude mcp add` grava a chave em claro na configuração do Claude Code do seu utilizador (`~/.claude.json`). Não partilhe esse ficheiro.

## Problemas comuns
| Mensagem | O que fazer |
|---|---|
| `[NAO_AUTORIZADO]` | A chave está errada ou foi revogada. Peça uma nova à equipa SouKW V2 (Ricardo Rosa). |
| `[PROIBIDO]` | O seu utilizador está inactivo ou sem acesso ao Suporte. |
| `[INACTIVO]` | O serviço está desligado neste ambiente. Fale com a equipa SouKW V2. |
| `[CONFIG]` | Falta o endereço ou a chave na configuração da extensão. |
| `[TIMEOUT]` | O SouKW demorou mais de 30 s. Numa acção que grava, confirme com "ver ticket" antes de repetir. |

Se suspeitar que a sua chave foi exposta, avise logo a equipa SouKW V2 para a revogar e gerar outra.

## Para quem quiser gerar o pacote ou correr os testes
Em `servidor/`:
- `npm ci` instala as dependências;
- `npm test` corre os testes contra um mock local (sem rede, sem chave);
- `npm run pack` gera `dist/soukw-tickets-<versão>.mcpb`;
- `npm run fumo` faz um teste real **só de leitura** (quem sou, opções, lista, um ticket). Lê a chave de `TICKETSMCP_CHAVE` e o endereço de `TICKETSMCP_URL` (omissão: Production).

O contrato da API está em [CONTRATO_TicketsMCP.md](CONTRATO_TicketsMCP.md).
