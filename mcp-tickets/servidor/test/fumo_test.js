// Teste de fumo REAL contra o endpoint TicketsMCP, através do servidor MCP por stdio.
// Só leituras (quem_sou, listar_opcoes, listar_tickets, ver_ticket). Lê a chave e o URL das variáveis de ambiente
// TICKETSMCP_CHAVE e TICKETSMCP_URL (omissão: Production) e nunca os escreve. Mostra só códigos, contagens e nomes
// de campos (sem dados pessoais).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

const URL_PROD = 'https://kwportugal.outsystems.app/SouKWLiderancas/rest/TicketsMCP';
const chave = (process.env.TICKETSMCP_CHAVE || '').trim();
if (!chave) {
  console.error('FALTA: defina TICKETSMCP_CHAVE (a sua chave pessoal) antes de correr o teste de fumo.');
  process.exit(2);
}
const url = process.env.TICKETSMCP_URL || URL_PROD;

const transporte = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.js')],
  env: { ...getDefaultEnvironment(), TICKETSMCP_URL: url, TICKETSMCP_CHAVE: chave },
  stderr: 'ignore',
});
const cliente = new Client({ name: 'fumo', version: '0.0.0' });
await cliente.connect(transporte);

let falhas = 0;
async function passo(nome, args = {}) {
  const r = await cliente.callTool({ name: nome, arguments: args });
  const texto = r.content.map((c) => c.text).join('');
  if (r.isError) {
    falhas++;
    console.log(`FALHA ${nome}: ${texto.split(']')[0]}]`);
    return null;
  }
  const d = JSON.parse(texto);
  const forma = Array.isArray(d) ? `lista(${d.length})` : Object.entries(d || {}).map(([k, v]) => (Array.isArray(v) ? `${k}[${v.length}]` : k)).join(', ');
  console.log(`OK    ${nome}: ${forma}`);
  return d;
}

console.log(`Endpoint: ${url}`);
const { tools } = await cliente.listTools();
console.log(`OK    tools/list: ${tools.length} ferramentas`);
await passo('quem_sou');
await passo('listar_opcoes');
const lista = await passo('listar_tickets', { por_pagina: 1 });
const primeiro = lista?.tickets?.[0];
const id = primeiro?.id ?? primeiro?.ticket_id;
if (id) await passo('ver_ticket', { ticket_id: id });
else console.log('NOTA  ver_ticket não testado (lista vazia ou sem campo id/ticket_id)');
const r = await cliente.callTool({ name: 'ver_ticket', arguments: { ticket_id: 999999999 } });
console.log(`${r.isError ? 'OK   ' : 'NOTA '} ver_ticket inexistente: ${r.content[0].text.split(']')[0]}]`);

await cliente.close();
console.log(falhas ? `\n${falhas} falha(s).` : '\nFumo OK.');
process.exit(falhas ? 1 : 0);
