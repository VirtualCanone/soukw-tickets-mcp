// Servidor HTTP falso que segue o contrato TicketsMCP v0.2. Dados totalmente fictícios.
// Uso isolado: node test/mock.js [porta]  (chave de teste: MOCK_CHAVE ou CHAVE_TESTE abaixo)
import http from 'node:http';
import { pathToFileURL } from 'node:url';

export const CHAVE_TESTE = 'chave-de-teste-ficticia-0123456789abcdef';
export const CHAVE_INACTIVO = 'chave-de-utilizador-inactivo-fict-000000';

const ESTADOS = {
  Pendente: ['Pendente', true], EmAnalise: ['Em Análise', true], PendenteDeInformacao: ['Pendente de Informação', true],
  EmResolucao: ['Em Resolução', true], Resolvido: ['Resolvido', false], Cancelado: ['Cancelado', false], Arquivado: ['Arquivado', false],
};
// Transições do contrato (sem a distinção de quem; o mock age como Staff MC autor).
const TRANSICOES = {
  Pendente: ['EmAnalise', 'Resolvido', 'PendenteDeInformacao', 'Cancelado'],
  EmAnalise: ['EmResolucao', 'Resolvido', 'PendenteDeInformacao', 'Cancelado'],
  PendenteDeInformacao: ['EmAnalise', 'Cancelado'],
  EmResolucao: ['Resolvido', 'PendenteDeInformacao', 'Cancelado'],
  Resolvido: ['Arquivado'], Cancelado: ['Arquivado'], Arquivado: [],
};
const PRIORIDADES = [{ id: 'Baixa', label: 'Baixa' }, { id: 'Media', label: 'Média' }, { id: 'Alta', label: 'Alta' }, { id: 'Urgente', label: 'Urgente' }];
const POOLS = [{ id: 'Tecnico', label: 'Técnico' }, { id: 'Operacional', label: 'Operacional' }];
const TIPOS = [{ id: 'Erro', label: 'Erro', pool: 'Tecnico' }, { id: 'Acesso', label: 'Acesso', pool: 'Operacional' }];

const EU = 'u-fict-0001';
const OUTRO = 'u-fict-0002';

function dadosIniciais() {
  const t = (id, titulo, estado, extra = {}) => ({
    id, referencia: `SUP-${String(id).padStart(6, '0')}`, titulo, estado, prioridade: 'Media', tipo: 'Erro', pool: 'Tecnico',
    mc: 7001, mc_nome: 'MC Ficticio', aberto_por_id: EU, aberto_por_nome: 'Utilizadora Ficticia', atribuido_a_id: null,
    escalado: false, motivo_escalamento: null, descricao: 'Descricao ficticia.', comentarios: [], historico: [],
    anexos: [], ...extra,
  });
  return {
    eu: { user_id: EU, nome: 'Utilizadora Ficticia', email: 'ficticia@exemplo.invalid', perfil: 'MarketCenter', mc: 7001, mc_nome: 'MC Ficticio' },
    responsaveis: [
      { id: EU, nome: 'Utilizadora Ficticia', email: 'ficticia@exemplo.invalid', regiao: false },
      { id: OUTRO, nome: 'Outro Ficticio', email: 'outro@exemplo.invalid', regiao: false },
    ],
    proxComentario: 3,
    tickets: [
      t(101, 'Erro ficticio na listagem', 'Pendente', {
        anexos: [{ id: 1, nome: 'captura.png', tamanho: 1024 }],
        comentarios: [
          { id: 1, autor_id: EU, autor_nome: 'Utilizadora Ficticia', texto: 'Comentario meu ficticio', interno: false },
          { id: 2, autor_id: OUTRO, autor_nome: 'Outro Ficticio', texto: 'Comentario de outro ficticio', interno: false },
        ],
      }),
      t(102, 'Pedido ficticio de acesso', 'EmAnalise', { atribuido_a_id: EU, tipo: 'Acesso', pool: 'Operacional' }),
      t(103, 'Ticket ficticio de outro MC', 'Pendente', { mc: 7002, mc_nome: 'Outro MC', semAcesso: true }),
      t(104, 'Ticket ficticio resolvido', 'Resolvido'),
    ],
  };
}

export async function arrancarMock(opcoes = {}) {
  const estado = { ativo: true, atrasoMs: 0, falhar500: false, erroInterno: false, ...opcoes, dados: dadosIniciais() };
  const contagem = {};

  const servidor = http.createServer(async (req, res) => {
    const responder = (status, obj) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(obj === undefined ? '' : JSON.stringify(obj));
    };
    if (req.method !== 'POST' || !req.url.endsWith('/rest/TicketsMCP/acao')) return responder(404, { Errors: ['Not found'] });

    let corpo = '';
    for await (const parte of req) corpo += parte;
    let pedido;
    try { pedido = JSON.parse(corpo); } catch { return responder(400, { Errors: ['JSON invalido'] }); }
    contagem[pedido.acao] = (contagem[pedido.acao] || 0) + 1;

    if (estado.atrasoMs) await new Promise((r) => setTimeout(r, estado.atrasoMs));
    const chave = req.headers['x-ticketsmcp-chave'];
    if (chave === CHAVE_INACTIVO) return responder(403);
    if (chave !== (process.env.MOCK_CHAVE || CHAVE_TESTE)) return responder(401);
    if (!estado.ativo) return responder(503, { ok: false, erro: { codigo: 'INACTIVO', mensagem: 'Sup_MCP_Ativo = False' } });
    if (estado.falhar500) return responder(500, { Errors: ['Erro interno ficticio'] });
    if (estado.erroInterno) return responder(200, erro('ERRO_INTERNO', 'Excepcao ficticia.'));

    responder(200, tratar(estado.dados, pedido.acao, pedido.args || {}));
  });

  await new Promise((r) => servidor.listen(opcoes.porta || 0, '127.0.0.1', r));
  const { port } = servidor.address();
  return {
    url: `http://127.0.0.1:${port}/SouKWLiderancas/rest/TicketsMCP`,
    contagem,
    definir: (novo) => Object.assign(estado, novo),
    fechar: () => new Promise((r) => { servidor.closeAllConnections?.(); servidor.close(r); }),
  };
}

const erro = (codigo, mensagem) => ({ erro: { codigo, mensagem } }) // como a REST real: sem ok:false (não envia valores por omissão);
const ok = (dados) => ({ ok: true, dados });
const nomeDe = (d, id) => d.responsaveis.find((r) => r.id === id)?.nome ?? null;
const emCurso = (t) => ESTADOS[t.estado][1];

function linha(d, t) {
  return {
    id: t.id, referencia: t.referencia, titulo: t.titulo, estado: t.estado, estado_label: ESTADOS[t.estado][0],
    prioridade: t.prioridade, prioridade_label: PRIORIDADES.find((p) => p.id === t.prioridade)?.label,
    tipo_label: TIPOS.find((x) => x.id === t.tipo)?.label, pool_label: POOLS.find((x) => x.id === t.pool)?.label,
    mc: t.mc, mc_nome: t.mc_nome, aberto_por_nome: t.aberto_por_nome, atribuido_a_id: t.atribuido_a_id,
    atribuido_a_nome: nomeDe(d, t.atribuido_a_id), escalado: t.escalado, sla_incumprido: false,
    criado_em: '2026-11-01T10:00:00Z', actualizado_em: '2026-11-09T10:00:00Z',
  };
}

function tratar(d, acao, a) {
  const obterTicket = () => {
    const t = d.tickets.find((x) => x.id === Number(a.ticket_id));
    if (!t) return { e: erro('NAO_EXISTE', `Pedido ${a.ticket_id} nao existe.`) };
    if (t.semAcesso) return { e: erro('SEM_ACESSO', 'Sem acesso ao pedido.') };
    return { t };
  };
  const historico = (t, campo, de, para) => t.historico.unshift({ campo, de, para, por_nome: d.eu.nome, em: '2026-11-09T12:00:00Z' });

  switch (acao) {
    case 'quem_sou': return ok(d.eu);
    case 'listar_opcoes': {
      const r = {
        estados: Object.entries(ESTADOS).map(([id, [label, em_curso]]) => ({ id, label, em_curso })),
        prioridades: PRIORIDADES, tipos: TIPOS, pools: POOLS,
      };
      if (a.ticket_id) {
        const { e } = obterTicket(); if (e) return e;
        r.responsaveis = d.responsaveis
          .filter((x) => !a.texto || x.nome.toLowerCase().includes(String(a.texto).toLowerCase()))
          .map(({ id, nome, regiao }) => ({ id, nome, regiao }));
      }
      return ok(r);
    }
    case 'listar_tickets': {
      const porPagina = a.por_pagina || 20;
      if (porPagina > 50) return erro('ARGS_INVALIDOS', 'por_pagina > 50');
      if (a.separador === 'atribuidos_mim') return erro('SEM_ACESSO', 'Separador so para a Regiao.');
      let lista = d.tickets.filter((t) => !t.semAcesso);
      const est = a.estado || 'em_curso';
      if (est === 'em_curso') lista = lista.filter(emCurso);
      else if (est !== 'todos') lista = lista.filter((t) => t.estado === est);
      if (a.separador === 'escalados') lista = lista.filter((t) => t.escalado);
      if (a.separador === 'meus') lista = lista.filter((t) => t.aberto_por_id === d.eu.user_id || t.atribuido_a_id === d.eu.user_id);
      if (a.atribuido_a === 'sem') lista = lista.filter((t) => !t.atribuido_a_id);
      else if (a.atribuido_a) {
        const r = d.responsaveis.find((x) => x.id === a.atribuido_a || x.email === a.atribuido_a);
        lista = lista.filter((t) => r && t.atribuido_a_id === r.id);
      }
      if (a.texto) {
        const q = String(a.texto).toLowerCase();
        lista = lista.filter((t) => t.titulo.toLowerCase().includes(q) || t.referencia.toLowerCase().includes(q));
      }
      const pagina = a.pagina || 1;
      return ok({ total: lista.length, pagina, por_pagina: porPagina, tickets: lista.slice((pagina - 1) * porPagina, pagina * porPagina).map((t) => linha(d, t)) });
    }
    case 'ver_ticket': {
      const { t, e } = obterTicket(); if (e) return e;
      const ativo = emCurso(t);
      return ok({
        ticket: {
          ...linha(d, t), descricao: t.descricao, aberto_por_id: t.aberto_por_id, escalado_em: null,
          motivo_escalamento: t.motivo_escalamento, resolvido_em: null, pode_escrever: true, transicoes: TRANSICOES[t.estado],
          pode_escalar: ativo && !t.escalado, pode_atribuir: !['Cancelado', 'Arquivado'].includes(t.estado), pode_reclassificar: ativo,
        },
        comentarios: t.comentarios.map((c) => ({ ...c, criado_em: '2026-11-09T11:00:00Z', e_meu: c.autor_id === d.eu.user_id })),
        historico: t.historico,
        anexos: t.anexos,
      });
    }
    case 'comentar': {
      const { t, e } = obterTicket(); if (e) return e;
      if (!a.texto) return erro('ARGS_INVALIDOS', 'texto em falta');
      const c = { id: d.proxComentario++, autor_id: d.eu.user_id, autor_nome: d.eu.nome, texto: a.texto, interno: Boolean(a.interno) };
      t.comentarios.unshift(c); historico(t, 'Comentário', null, 'Comentário');
      return ok({ comentario_id: c.id });
    }
    case 'mudar_estado': {
      const { t, e } = obterTicket(); if (e) return e;
      if (!(a.estado in ESTADOS)) return erro('ARGS_INVALIDOS', `Estado desconhecido: ${a.estado}`);
      if (!TRANSICOES[t.estado].includes(a.estado)) return erro('TRANSICAO_INVALIDA', `De ${t.estado} para ${a.estado} nao e permitido.`);
      historico(t, 'Estado', t.estado, a.estado); t.estado = a.estado;
      if (a.comentario) t.comentarios.unshift({ id: d.proxComentario++, autor_id: d.eu.user_id, autor_nome: d.eu.nome, texto: a.comentario, interno: false });
      return ok({ estado: t.estado, estado_label: ESTADOS[t.estado][0] });
    }
    case 'atribuir': {
      const { t, e } = obterTicket(); if (e) return e;
      if (['Cancelado', 'Arquivado'].includes(t.estado)) return erro('SEM_ACESSO', 'Pedido fechado.');
      const r = d.responsaveis.find((x) => x.id === a.utilizador || x.email === a.utilizador);
      if (!r) return erro('ARGS_INVALIDOS', 'Responsavel nao encontrado.');
      t.atribuido_a_id = r.id; return ok({ atribuido_a_id: r.id, atribuido_a_nome: r.nome });
    }
    case 'escalar': {
      const { t, e } = obterTicket(); if (e) return e;
      if (!a.motivo || String(a.motivo).length > 500) return erro('ARGS_INVALIDOS', 'motivo obrigatorio (<= 500).');
      if (t.escalado || !emCurso(t)) return erro('SEM_ACESSO', 'Nao pode escalar este pedido.');
      t.escalado = true; t.motivo_escalamento = a.motivo; return ok({ escalado: true });
    }
    case 'reclassificar': {
      const { t, e } = obterTicket(); if (e) return e;
      if (!emCurso(t)) return erro('SEM_ACESSO', 'Pedido nao esta em curso.');
      if (a.prioridade && !PRIORIDADES.some((p) => p.id === a.prioridade)) return erro('ARGS_INVALIDOS', 'prioridade desconhecida');
      if (a.tipo && !TIPOS.some((p) => p.id === a.tipo)) return erro('ARGS_INVALIDOS', 'tipo desconhecido');
      if (a.pool && !POOLS.some((p) => p.id === a.pool)) return erro('ARGS_INVALIDOS', 'pool desconhecida');
      Object.assign(t, Object.fromEntries(['prioridade', 'tipo', 'pool'].filter((k) => a[k]).map((k) => [k, a[k]])));
      return ok({ prioridade: t.prioridade, tipo: t.tipo, pool: t.pool });
    }
    case 'apagar_comentario': {
      const { t, e } = obterTicket(); if (e) return e;
      const i = t.comentarios.findIndex((c) => c.id === Number(a.comentario_id));
      if (i < 0) return erro('NAO_EXISTE', 'Comentario nao existe neste pedido.');
      if (t.comentarios[i].autor_id !== d.eu.user_id) return erro('SEM_ACESSO', 'So o autor pode apagar o comentario.');
      t.comentarios.splice(i, 1); historico(t, 'Comentário', 'Comentário', 'Comentário eliminado');
      return ok({ apagado: true });
    }
    default: return erro('ACAO_DESCONHECIDA', `Acao desconhecida: ${acao}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const m = await arrancarMock({ porta: Number(process.argv[2]) || 8799 });
  process.stdout.write(`Mock TicketsMCP em ${m.url}\n`);
}
