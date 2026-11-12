#!/usr/bin/env node
// Servidor MCP (stdio) dos tickets do Suporte da SouKWLiderancas.
// Config: TICKETSMCP_URL (base .../rest/TicketsMCP) e TICKETSMCP_CHAVE (chave pessoal).
// stdout é do protocolo MCP: os registos vão só para stderr e nunca incluem a chave.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRequire } from 'node:module';
import { criarCliente, lerConfig, ErroTickets } from './cliente.js';
import { FERRAMENTAS } from './ferramentas.js';

const { version } = createRequire(import.meta.url)('../package.json');

function registo(texto) {
  process.stderr.write(`[tickets-mcp] ${new Date().toISOString()} ${texto}\n`);
}

export function criarServidor(cliente) {
  const servidor = new McpServer(
    { name: 'soukw-tickets', version },
    {
      instructions:
        'Ferramentas para gerir os tickets do Suporte do SouKW (KW Portugal). Todas as acções são feitas em nome do ' +
        'utilizador dono da chave configurada, com o mesmo acesso que ele tem nos ecrãs. Comece por quem_sou. ' +
        'Antes de mudar o estado, escalar, atribuir, reclassificar ou apagar um comentário, veja o ticket com ver_ticket ' +
        '(transicoes[] e flags pode_*) e confirme com a pessoa o que vai ser gravado. apagar_comentario é definitivo. ' +
        'Nas respostas, um campo ausente vale o seu valor por omissão: booleanos (interno, escalado, e_meu, ' +
        'sla_incumprido, pode_*) = false, números (total) = 0, listas = vazias.',
    },
  );

  for (const f of FERRAMENTAS) {
    servidor.registerTool(
      f.nome,
      { title: f.titulo, description: f.descricao, inputSchema: f.args, annotations: { title: f.titulo, ...f.anotacoes } },
      async (args) => {
        const inicio = Date.now();
        try {
          const dados = await cliente.chamar(f.nome, args, { grava: Boolean(f.grava) });
          registo(`${f.nome} ok ${Date.now() - inicio} ms`);
          return { content: [{ type: 'text', text: JSON.stringify(dados ?? {}, null, 2) }] };
        } catch (e) {
          const codigo = e instanceof ErroTickets ? e.codigo : 'INTERNO';
          const mensagem = e instanceof ErroTickets ? e.message : 'Erro interno do servidor MCP.';
          registo(`${f.nome} erro ${codigo} ${Date.now() - inicio} ms`);
          return { isError: true, content: [{ type: 'text', text: `[${codigo}] ${mensagem}` }] };
        }
      },
    );
  }
  return servidor;
}

async function principal() {
  const config = lerConfig();
  if (!config.url || !config.chave) {
    registo('aviso: falta TICKETSMCP_URL ou TICKETSMCP_CHAVE; as ferramentas vão devolver erro de configuração');
  }
  const servidor = criarServidor(criarCliente(config));
  await servidor.connect(new StdioServerTransport());
  registo(`v${version} pronto`);
}

principal().catch((e) => {
  registo(`falha ao arrancar: ${e?.message}`);
  process.exit(1);
});
