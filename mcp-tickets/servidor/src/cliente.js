// Cliente HTTP do endpoint TicketsMCP da SouKWLiderancas (contrato: mcp_tickets/CONTRATO_TicketsMCP.md).
// Um único método REST: POST <base>/acao com { acao, args }.
// A chave nunca é escrita em logs nem devolvida em mensagens de erro.

const TIMEOUT_OMISSAO_MS = 30_000;

export class ErroTickets extends Error {
  constructor(codigo, mensagem) {
    super(mensagem);
    this.codigo = codigo;
  }
}

// Dicas para o modelo, por código de erro de negócio do contrato.
const DICAS = {
  SEM_ACESSO: 'O utilizador dono da chave não tem acesso a este ticket ou a esta operação (as mesmas regras dos ecrãs do Suporte).',
  NAO_EXISTE: 'O ticket ou o registo indicado não existe. Confirme o identificador com listar_tickets ou ver_ticket.',
  TRANSICAO_INVALIDA: 'Esta mudança de estado não é permitida a partir do estado actual. Veja as transições possíveis em transicoes[] de ver_ticket.',
  ARGS_INVALIDOS: 'Os argumentos foram recusados pelo servidor. Use listar_opcoes para ver os valores aceites.',
  ACAO_DESCONHECIDA: 'O servidor não conhece esta acção. A versão do endpoint pode ser anterior à desta extensão.',
  ERRO_INTERNO: 'Erro inesperado no SouKW (o detalhe fica no log do servidor). Numa acção que grava, confirme com ver_ticket antes de repetir.',
};

export function lerConfig(env = process.env) {
  const url = (env.TICKETSMCP_URL || '').trim().replace(/\/+$/, '');
  const chave = (env.TICKETSMCP_CHAVE || '').trim();
  const timeoutMs = Number(env.TICKETSMCP_TIMEOUT_MS) > 0 ? Number(env.TICKETSMCP_TIMEOUT_MS) : TIMEOUT_OMISSAO_MS;
  return { url, chave, timeoutMs };
}

function urlAcao(base) {
  return base.endsWith('/acao') ? base : `${base}/acao`;
}

function semChave(texto, chave) {
  if (!chave || !texto) return texto;
  return String(texto).split(chave).join('***');
}

export function criarCliente(config) {
  const { url, chave, timeoutMs } = config;

  /**
   * Chama uma acção do contrato.
   * @param {string} acao
   * @param {object} args
   * @param {{grava?: boolean}} opcoes  grava=true desliga a nova tentativa em falhas de rede.
   * @returns {Promise<any>} o campo `dados` da resposta.
   */
  async function chamar(acao, args = {}, { grava = false } = {}) {
    if (!url) throw new ErroTickets('CONFIG', 'Falta configurar o URL do endpoint (TICKETSMCP_URL).');
    if (!/^https?:\/\//i.test(url)) throw new ErroTickets('CONFIG', 'O TICKETSMCP_URL tem de começar por https://.');
    if (!chave) throw new ErroTickets('CONFIG', 'Falta configurar a chave pessoal (TICKETSMCP_CHAVE).');

    const corpo = JSON.stringify({ acao, args: limparArgs(args) });
    // Leituras: uma nova tentativa só em falha de rede. Acções que gravam: nunca.
    const tentativas = grava ? 1 : 2;
    let ultimoErro;
    for (let i = 0; i < tentativas; i++) {
      let resp;
      try {
        resp = await fetch(urlAcao(url), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-TicketsMCP-Chave': chave,
          },
          body: corpo,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
          throw new ErroTickets('TIMEOUT', `O SouKW não respondeu em ${Math.round(timeoutMs / 1000)} s.` +
            (grava ? ' A acção pode ter sido gravada ou não: confirme com ver_ticket antes de repetir.' : ' Tente de novo dentro de momentos.'));
        }
        ultimoErro = new ErroTickets('REDE', `Não foi possível contactar o SouKW (${semChave(e?.cause?.code || e?.message, chave)}).` +
          (grava ? ' Confirme com ver_ticket antes de repetir.' : ''));
        continue;
      }
      return await interpretar(resp);
    }
    throw ultimoErro;
  }

  async function interpretar(resp) {
    const texto = await resp.text();
    let json;
    try { json = texto ? JSON.parse(texto) : undefined; } catch { json = undefined; }

    if (resp.status === 401) {
      throw new ErroTickets('NAO_AUTORIZADO', 'Chave recusada (HTTP 401): a chave pessoal não está registada neste ambiente ou foi revogada. Peça uma chave nova à equipa SouKW.');
    }
    if (resp.status === 403) {
      throw new ErroTickets('PROIBIDO', 'Acesso recusado (HTTP 403): o utilizador dono da chave está inactivo ou sem permissões no Suporte.');
    }
    if (resp.status === 503) {
      throw new ErroTickets('INACTIVO', 'O acesso por MCP aos tickets está desligado neste ambiente (HTTP 503). Fale com a equipa SouKW.');
    }
    if (!resp.ok) {
      const msg = json?.erro?.mensagem || json?.Errors?.[0] || '';
      throw new ErroTickets('HTTP', `O SouKW devolveu HTTP ${resp.status}${msg ? `: ${semChave(msg, chave)}` : ''}.`);
    }
    if (!json || typeof json !== 'object') {
      throw new ErroTickets('RESPOSTA', 'Resposta do SouKW em formato inesperado (não é JSON).');
    }
    // A REST da Liderancas não envia valores por omissão: um erro pode vir só com `erro` (sem ok:false).
    if (json.ok === false || (json.ok !== true && json.erro)) {
      const codigo = json.erro?.codigo || 'ERRO';
      const mensagem = semChave(json.erro?.mensagem || '', chave);
      const dica = DICAS[codigo];
      throw new ErroTickets(codigo, [mensagem, dica].filter(Boolean).join(' '));
    }
    if (json.ok !== true) {
      throw new ErroTickets('RESPOSTA', 'Resposta do SouKW sem o campo "ok".');
    }
    return json.dados ?? null;
  }

  return { chamar };
}

function limparArgs(args) {
  const out = {};
  for (const [k, v] of Object.entries(args || {})) {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}
