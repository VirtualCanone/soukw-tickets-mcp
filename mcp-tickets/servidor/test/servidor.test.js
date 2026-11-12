// Testes ponta a ponta (contrato v0.2): arranca o mock HTTP e o servidor MCP por stdio, e chama cada ferramenta.
// Os testes partilham o estado do mock e correm por ordem.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { arrancarMock, CHAVE_TESTE, CHAVE_INACTIVO } from './mock.js';

// TICKETSMCP_ENTRADA permite correr os mesmos testes contra um .mcpb desempacotado.
const ENTRADA = process.env.TICKETSMCP_ENTRADA || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.js');
const ACOES = ['quem_sou', 'listar_opcoes', 'listar_tickets', 'ver_ticket', 'comentar', 'mudar_estado', 'atribuir', 'escalar',
  'reclassificar', 'apagar_comentario'];

let mock;
const clientes = [];

async function ligar(env) {
  const stderr = [];
  const transporte = new StdioClientTransport({
    command: process.execPath,
    args: [ENTRADA],
    env: { ...getDefaultEnvironment(), ...env },
    stderr: 'pipe',
  });
  transporte.stderr?.on('data', (b) => stderr.push(String(b)));
  const cliente = new Client({ name: 'teste', version: '0.0.0' });
  await cliente.connect(transporte);
  clientes.push(cliente);
  return { cliente, stderr };
}

const texto = (r) => r.content.map((c) => c.text).join('');
const dados = (r) => { assert.ok(!r.isError, texto(r)); return JSON.parse(texto(r)); };
// O SDK devolve a falha de validação como isError (ou lança, conforme a versão): aceitar as duas.
const chamarTalvezRecusado = (c, name, args) =>
  c.callTool({ name, arguments: args }).catch((e) => ({ isError: true, content: [{ text: e.message }] }));

let c; let stderrPrincipal;
before(async () => {
  mock = await arrancarMock();
  ({ cliente: c, stderr: stderrPrincipal } = await ligar({ TICKETSMCP_URL: mock.url, TICKETSMCP_CHAVE: CHAVE_TESTE }));
});
after(async () => {
  for (const x of clientes) await x.close().catch(() => {});
  await mock.fechar();
});

test('initialize: identifica-se e traz instruções', () => {
  assert.equal(c.getServerVersion().name, 'soukw-tickets');
  assert.match(c.getInstructions() || '', /transicoes/);
});

test('tools/list: uma ferramenta por acção, com schemas e anotações do contrato v0.2', async () => {
  const { tools } = await c.listTools();
  const porNome = Object.fromEntries(tools.map((t) => [t.name, t]));
  assert.deepEqual(Object.keys(porNome).sort(), [...ACOES].sort());
  for (const t of tools) assert.ok(t.description.length > 30, `descrição curta em ${t.name}`);
  const ro = tools.filter((t) => t.annotations.readOnlyHint).map((t) => t.name).sort();
  assert.deepEqual(ro, ['listar_opcoes', 'listar_tickets', 'quem_sou', 'ver_ticket']);

  const ap = porNome.apagar_comentario;
  assert.equal(ap.annotations.destructiveHint, true);
  assert.match(ap.description, /APAGA DE VEZ/);
  assert.match(ap.description, /confirmação/);

  const lt = porNome.listar_tickets.inputSchema.properties;
  assert.equal(lt.por_pagina.maximum, 50);
  assert.deepEqual(lt.separador.enum, ['mc', 'meus', 'todos', 'escalados', 'atribuidos_mim']);
  assert.ok(lt.estado.enum.includes('em_curso') && lt.estado.enum.includes('todos') && lt.estado.enum.includes('PendenteDeInformacao'));
  assert.equal(porNome.mudar_estado.inputSchema.properties.estado.enum.length, 7);
  assert.deepEqual(porNome.escalar.inputSchema.required.sort(), ['motivo', 'ticket_id']);
  assert.equal(porNome.escalar.inputSchema.properties.motivo.maxLength, 500);
  assert.equal(porNome.atribuir.inputSchema.properties.utilizador.type, 'string');
  assert.match(porNome.ver_ticket.description, /transicoes\[\]/);
});

test('leituras: quem_sou, listar_opcoes (com e sem ticket), listar_tickets, ver_ticket', async () => {
  assert.equal(dados(await c.callTool({ name: 'quem_sou', arguments: {} })).user_id, 'u-fict-0001');

  const op = dados(await c.callTool({ name: 'listar_opcoes', arguments: {} }));
  assert.equal(op.estados.length, 7); assert.equal(op.responsaveis, undefined);
  const op2 = dados(await c.callTool({ name: 'listar_opcoes', arguments: { ticket_id: 101, texto: 'outro' } }));
  assert.deepEqual(op2.responsaveis.map((r) => r.id), ['u-fict-0002']);

  const l = dados(await c.callTool({ name: 'listar_tickets', arguments: {} }));
  assert.equal(l.total, 2); assert.equal(l.por_pagina, 20);
  const todos = dados(await c.callTool({ name: 'listar_tickets', arguments: { estado: 'todos', separador: 'meus' } }));
  assert.equal(todos.total, 3);
  const sem = dados(await c.callTool({ name: 'listar_tickets', arguments: { atribuido_a: 'sem' } }));
  assert.deepEqual(sem.tickets.map((t) => t.id), [101]);
  const ref = dados(await c.callTool({ name: 'listar_tickets', arguments: { texto: 'SUP-000102' } }));
  assert.deepEqual(ref.tickets.map((t) => t.referencia), ['SUP-000102']);

  const v = dados(await c.callTool({ name: 'ver_ticket', arguments: { ticket_id: 101 } }));
  assert.ok(v.ticket.transicoes.includes('EmAnalise'));
  assert.equal(typeof v.ticket.pode_escalar, 'boolean');
  assert.deepEqual(v.comentarios.map((x) => x.e_meu), [true, false]);
  assert.equal(v.anexos[0].nome, 'captura.png');
});

test('escritas: comentar, mudar_estado, atribuir, reclassificar, escalar', async () => {
  assert.equal(dados(await c.callTool({ name: 'comentar', arguments: { ticket_id: 101, texto: 'Comentario de teste', interno: true } })).comentario_id, 3);
  const m = dados(await c.callTool({ name: 'mudar_estado', arguments: { ticket_id: 101, estado: 'EmAnalise', comentario: 'a analisar' } }));
  assert.deepEqual(m, { estado: 'EmAnalise', estado_label: 'Em Análise' });
  assert.equal(dados(await c.callTool({ name: 'atribuir', arguments: { ticket_id: 101, utilizador: 'outro@exemplo.invalid' } })).atribuido_a_id, 'u-fict-0002');
  assert.equal(dados(await c.callTool({ name: 'atribuir', arguments: { ticket_id: 101, utilizador: 'u-fict-0001' } })).atribuido_a_nome, 'Utilizadora Ficticia');
  assert.deepEqual(dados(await c.callTool({ name: 'reclassificar', arguments: { ticket_id: 101, prioridade: 'Alta' } })),
    { prioridade: 'Alta', tipo: 'Erro', pool: 'Tecnico' });
  assert.equal(dados(await c.callTool({ name: 'escalar', arguments: { ticket_id: 101, motivo: 'teste' } })).escalado, true);
  const l = dados(await c.callTool({ name: 'listar_tickets', arguments: { separador: 'escalados' } }));
  assert.deepEqual(l.tickets.map((t) => t.id), [101]);
});

test('apagar_comentario: o próprio apaga; de outra pessoa SEM_ACESSO; inexistente NAO_EXISTE', async () => {
  assert.deepEqual(dados(await c.callTool({ name: 'apagar_comentario', arguments: { ticket_id: 101, comentario_id: 1 } })), { apagado: true });
  const v = dados(await c.callTool({ name: 'ver_ticket', arguments: { ticket_id: 101 } }));
  assert.ok(!v.comentarios.some((x) => x.id === 1));
  assert.equal(v.historico[0].para, 'Comentário eliminado');

  let r = await c.callTool({ name: 'apagar_comentario', arguments: { ticket_id: 101, comentario_id: 2 } });
  assert.ok(r.isError); assert.match(texto(r), /^\[SEM_ACESSO\]/);
  r = await c.callTool({ name: 'apagar_comentario', arguments: { ticket_id: 101, comentario_id: 999 } });
  assert.ok(r.isError); assert.match(texto(r), /^\[NAO_EXISTE\]/);
  r = await c.callTool({ name: 'apagar_comentario', arguments: { ticket_id: 102, comentario_id: 2 } });
  assert.ok(r.isError); assert.match(texto(r), /^\[NAO_EXISTE\]/, 'comentário de outro pedido');
});

test('erros de negócio viram isError com código e dica', async () => {
  let r = await c.callTool({ name: 'mudar_estado', arguments: { ticket_id: 104, estado: 'EmAnalise' } });
  assert.ok(r.isError); assert.match(texto(r), /^\[TRANSICAO_INVALIDA\].*transicoes\[\]/);
  r = await c.callTool({ name: 'ver_ticket', arguments: { ticket_id: 999 } });
  assert.ok(r.isError); assert.match(texto(r), /^\[NAO_EXISTE\]/);
  r = await c.callTool({ name: 'ver_ticket', arguments: { ticket_id: 103 } });
  assert.ok(r.isError); assert.match(texto(r), /^\[SEM_ACESSO\]/);
  r = await c.callTool({ name: 'listar_tickets', arguments: { separador: 'atribuidos_mim' } });
  assert.ok(r.isError); assert.match(texto(r), /^\[SEM_ACESSO\]/);

  mock.definir({ erroInterno: true });
  r = await c.callTool({ name: 'comentar', arguments: { ticket_id: 102, texto: 'x' } });
  mock.definir({ erroInterno: false });
  assert.ok(r.isError); assert.match(texto(r), /^\[ERRO_INTERNO\].*ver_ticket/);
});

test('argumentos inválidos são recusados antes de chegar ao SouKW', async () => {
  const casos = [
    ['listar_tickets', { por_pagina: 100 }],
    ['listar_tickets', { por_pagina: 0 }],
    ['listar_tickets', { pagina: 0 }],
    ['listar_tickets', { separador: 'outro' }],
    ['listar_tickets', { estado: 'Fechado' }],
    ['mudar_estado', { ticket_id: 101, estado: 'em_curso' }],
    ['comentar', { ticket_id: 101, texto: '' }],
    ['escalar', { ticket_id: 102 }],
    ['escalar', { ticket_id: 102, motivo: 'x'.repeat(501) }],
    ['apagar_comentario', { ticket_id: 101 }],
  ];
  for (const [nome, args] of casos) {
    const antes = mock.contagem[nome] || 0;
    const r = await chamarTalvezRecusado(c, nome, args);
    assert.ok(r.isError, `${nome} ${JSON.stringify(args).slice(0, 60)} devia ser recusado`);
    assert.equal(mock.contagem[nome] || 0, antes, `${nome} não devia chegar ao SouKW`);
  }
});

test('HTTP 401, 403 e 503 dão mensagens úteis, sem a chave', async () => {
  const { cliente: c401 } = await ligar({ TICKETSMCP_URL: mock.url, TICKETSMCP_CHAVE: 'chave-errada-xyz-segredo' });
  let r = await c401.callTool({ name: 'quem_sou', arguments: {} });
  assert.ok(r.isError); assert.match(texto(r), /^\[NAO_AUTORIZADO\]/); assert.doesNotMatch(texto(r), /segredo/);

  const { cliente: c403 } = await ligar({ TICKETSMCP_URL: mock.url, TICKETSMCP_CHAVE: CHAVE_INACTIVO });
  r = await c403.callTool({ name: 'quem_sou', arguments: {} });
  assert.ok(r.isError); assert.match(texto(r), /^\[PROIBIDO\]/);

  mock.definir({ ativo: false });
  r = await c.callTool({ name: 'quem_sou', arguments: {} });
  mock.definir({ ativo: true });
  assert.ok(r.isError); assert.match(texto(r), /^\[INACTIVO\]/);
});

test('acções que gravam não são repetidas após falha', async () => {
  mock.definir({ falhar500: true });
  const antes = mock.contagem.apagar_comentario;
  const r = await c.callTool({ name: 'apagar_comentario', arguments: { ticket_id: 101, comentario_id: 3 } });
  mock.definir({ falhar500: false });
  assert.ok(r.isError); assert.match(texto(r), /HTTP 500/);
  assert.equal(mock.contagem.apagar_comentario, antes + 1);
});

test('timeout configurável devolve erro claro', async () => {
  const { cliente: cLento } = await ligar({ TICKETSMCP_URL: mock.url, TICKETSMCP_CHAVE: CHAVE_TESTE, TICKETSMCP_TIMEOUT_MS: '300' });
  mock.definir({ atrasoMs: 1000 });
  const r = await cLento.callTool({ name: 'comentar', arguments: { ticket_id: 101, texto: 'lento' } });
  mock.definir({ atrasoMs: 0 });
  assert.ok(r.isError); assert.match(texto(r), /^\[TIMEOUT\].*ver_ticket/);
});

test('sem configuração: erro de configuração, não rebenta', async () => {
  const { cliente: cVazio } = await ligar({ TICKETSMCP_URL: '', TICKETSMCP_CHAVE: '' });
  const r = await cVazio.callTool({ name: 'quem_sou', arguments: {} });
  assert.ok(r.isError); assert.match(texto(r), /^\[CONFIG\]/);
});

test('a chave nunca aparece no stderr', () => {
  assert.ok(stderrPrincipal.join('').length > 0);
  assert.doesNotMatch(stderrPrincipal.join(''), new RegExp(CHAVE_TESTE));
});
