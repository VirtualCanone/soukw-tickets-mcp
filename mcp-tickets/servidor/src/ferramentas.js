// Uma ferramenta MCP por `acao` do contrato TicketsMCP v0.2 (mcp_tickets/CONTRATO_TicketsMCP.md, secção Campos).
// Para acrescentar uma acção: primeiro no contrato, depois uma entrada em FERRAMENTAS.
import { z } from 'zod';

export const ESTADOS = ['Pendente', 'EmAnalise', 'PendenteDeInformacao', 'EmResolucao', 'Resolvido', 'Cancelado', 'Arquivado'];
export const SEPARADORES = ['mc', 'meus', 'todos', 'escalados', 'atribuidos_mim'];

const idTicket = z.coerce.number().int().positive()
  .describe('Id numérico do ticket (campo "id" de listar_tickets; não é a referência SUP-000000).');
const idComentario = z.coerce.number().int().positive()
  .describe('Id numérico do comentário (campo "id" em comentarios[] de ver_ticket).');
// Utilizadores: UserId do ODC (texto) ou o email KW.
const idOuEmail = z.string().trim().min(1).max(200);
const idEstatico = z.string().trim().min(1).max(60);
const textoCurto = (max) => z.string().trim().min(1).max(max);

const LEITURA = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const ESCRITA = (destrutiva, idempotente) => ({
  readOnlyHint: false, destructiveHint: destrutiva, idempotentHint: idempotente, openWorldHint: false,
});

export const FERRAMENTAS = [
  {
    nome: 'quem_sou',
    titulo: 'Quem sou',
    descricao: 'Devolve o utilizador do SouKW dono da chave configurada: user_id, nome, email, perfil (Regiao, MarketCenter ou Proprio) e MC. ' +
      'Chame no início da conversa: todas as acções são feitas em nome deste utilizador e com o acesso dele nos ecrãs do Suporte.',
    args: {},
    anotacoes: LEITURA,
  },
  {
    nome: 'listar_opcoes',
    titulo: 'Listar opções',
    descricao: 'Devolve os valores válidos (ids e rótulos) de estados, prioridades, tipos (cada um com a sua pool) e pools. ' +
      'Com ticket_id devolve também os possíveis responsáveis desse ticket (para atribuir); texto filtra os responsáveis pelo nome. ' +
      'Use os ids devolvidos em listar_tickets, atribuir e reclassificar.',
    args: {
      ticket_id: idTicket.optional().describe('Ticket para o qual se querem os possíveis responsáveis.'),
      texto: textoCurto(100).optional().describe('Filtra os responsáveis pelo nome (só com ticket_id).'),
    },
    anotacoes: LEITURA,
  },
  {
    nome: 'listar_tickets',
    titulo: 'Listar tickets',
    descricao: 'Lista os tickets do Suporte que o utilizador pode ver, com os separadores e filtros do ecrã, do mais recentemente actualizado para o mais antigo. ' +
      'Por omissão mostra só os tickets em curso (Pendente, EmAnalise, PendenteDeInformacao, EmResolucao); use estado="todos" para incluir os fechados. ' +
      'Devolve { total, pagina, por_pagina, tickets[] }. Para o detalhe, comentários e transições possíveis use ver_ticket.',
    args: {
      separador: z.enum(SEPARADORES).optional().describe(
        'mc = todos do meu MC (só Staff MC); meus = abertos por mim ou atribuídos a mim; todos; escalados; atribuidos_mim (só Região). ' +
        'Sem valor, o SouKW escolhe conforme o perfil. Um separador sem acesso devolve SEM_ACESSO.'),
      estado: z.enum([...ESTADOS, 'em_curso', 'todos']).optional().describe('Id do estado, "em_curso" (omissão) ou "todos".'),
      mc: z.number().int().positive().optional().describe('Id do Market Center (só para a Região).'),
      atribuido_a: idOuEmail.optional().describe('Responsável: user_id, email KW, ou "sem" para os tickets sem responsável.'),
      texto: textoCurto(200).optional().describe('Pesquisa na referência (SUP-...) e no título.'),
      pagina: z.number().int().min(1).optional().describe('Página, a começar em 1.'),
      por_pagina: z.number().int().min(1).max(50).optional().describe('Resultados por página, de 1 a 50 (omissão 20).'),
    },
    anotacoes: LEITURA,
  },
  {
    nome: 'ver_ticket',
    titulo: 'Ver ticket',
    descricao: 'Devolve o detalhe de um ticket: dados, descrição, comentarios[] (com e_meu = escrito por mim), historico[] e anexos[] (só nome e tamanho). ' +
      'Traz também o que o utilizador pode fazer: transicoes[] (estados para onde pode mudar agora), pode_escrever, pode_escalar, pode_atribuir e pode_reclassificar. ' +
      'Consulte sempre estes campos antes de mudar_estado, escalar, atribuir, reclassificar ou apagar_comentario.',
    args: { ticket_id: idTicket },
    anotacoes: LEITURA,
  },
  {
    nome: 'comentar',
    titulo: 'Comentar ticket',
    descricao: 'Acrescenta um comentário ao ticket, em nome do utilizador dono da chave. interno=true torna-o visível só ao Staff MC e à Região ' +
      '(para consultores fica sempre público). Mostre o texto à pessoa e confirme antes de enviar.',
    args: {
      ticket_id: idTicket,
      texto: textoCurto(4000).describe('Texto do comentário.'),
      interno: z.boolean().optional().describe('true para nota interna (só Staff MC e Região).'),
    },
    anotacoes: ESCRITA(false, false),
    grava: true,
  },
  {
    nome: 'mudar_estado',
    titulo: 'Mudar estado',
    descricao: 'Muda o estado do ticket. Só são aceites os estados que aparecem em transicoes[] de ver_ticket; consulte-o antes. ' +
      'Para fechar use Resolvido, Cancelado (só o autor) ou Arquivado (final, a partir de Resolvido ou Cancelado). ' +
      'Uma transição fora das permitidas devolve TRANSICAO_INVALIDA. O comentario opcional fica como comentário público. Confirme com a pessoa antes.',
    args: {
      ticket_id: idTicket,
      estado: z.enum(ESTADOS).describe('Estado de destino (id, sem acentos).'),
      comentario: textoCurto(4000).optional().describe('Comentário público a registar depois da mudança.'),
    },
    anotacoes: ESCRITA(true, true),
    grava: true,
  },
  {
    nome: 'atribuir',
    titulo: 'Atribuir ticket',
    descricao: 'Atribui o ticket a um responsável, substituindo o actual. Só Staff MC e Região, e só em tickets não Cancelados nem Arquivados. ' +
      'O responsável tem de constar de listar_opcoes com este ticket_id. Confirme com a pessoa antes.',
    args: {
      ticket_id: idTicket,
      utilizador: idOuEmail.describe('Responsável: user_id (texto) ou email KW.'),
    },
    anotacoes: ESCRITA(true, true),
    grava: true,
  },
  {
    nome: 'escalar',
    titulo: 'Escalar ticket',
    descricao: 'Escala o ticket para a Região. É IRREVERSÍVEL e avisa a Região. Só Staff MC do MC do ticket, em tickets em curso e ainda não escalados ' +
      '(ver pode_escalar em ver_ticket). Exige um motivo. Confirme com a pessoa antes.',
    args: {
      ticket_id: idTicket,
      motivo: textoCurto(500).describe('Motivo do escalamento (obrigatório, até 500 caracteres).'),
    },
    anotacoes: ESCRITA(false, false),
    grava: true,
  },
  {
    nome: 'reclassificar',
    titulo: 'Reclassificar ticket',
    descricao: 'Muda a prioridade, o tipo e/ou a pool do ticket; o que não for indicado fica como está. Só Staff MC e Região, em tickets em curso ' +
      '(ver pode_reclassificar em ver_ticket). Use os ids de listar_opcoes. Confirme com a pessoa antes.',
    args: {
      ticket_id: idTicket,
      prioridade: idEstatico.optional().describe('Id da prioridade (listar_opcoes).'),
      tipo: idEstatico.optional().describe('Id do tipo (listar_opcoes).'),
      pool: idEstatico.optional().describe('Id da pool (listar_opcoes).'),
    },
    anotacoes: ESCRITA(true, true),
    grava: true,
  },
  {
    nome: 'apagar_comentario',
    titulo: 'Apagar comentário',
    descricao: 'APAGA DE VEZ um comentário do ticket; não há forma de o recuperar (fica só a linha "Comentário eliminado" no Histórico). ' +
      'Só o autor pode apagar (comentarios[].e_meu = true em ver_ticket); o de outra pessoa devolve SEM_ACESSO. ' +
      'Antes de chamar, mostre o texto do comentário à pessoa e peça confirmação explícita.',
    args: { ticket_id: idTicket, comentario_id: idComentario },
    anotacoes: ESCRITA(true, true),
    grava: true,
  },
];
