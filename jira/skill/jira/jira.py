"""Acesso de leitura ao Jira da KW Portugal (projecto KWTR, dvtpt.atlassian.net).

Cada pessoa usa o seu próprio token. Por ordem de prioridade:
  1) variáveis de ambiente JIRA_EMAIL e JIRA_API_TOKEN (e, opcional, JIRA_SITE);
  2) ficheiro no perfil do utilizador, fora de qualquer repositório:
     ~/.jira-kwtr/credenciais.json  (Windows: %USERPROFILE%\\.jira-kwtr\\credenciais.json)
     O caminho pode mudar-se com a variável JIRA_CRED_FILE.

  python jira.py configurar            pede email + token (sem eco) e grava-os
  python jira.py testar                confirma que o token funciona
  python jira.py ler KWTR-14           descrição + comentários em texto simples
  python jira.py procurar "proprietário" [--jql "status = Done"] [--max 50]
  python jira.py anexos KWTR-14 --pasta <dir>

Só leitura: o script só faz pedidos GET. Comentar ou alterar issues é sempre feito
pela pessoa, no Jira.
"""
import base64
import getpass
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

SITE = 'dvtpt.atlassian.net'
PROJECTO = 'KWTR'
CRED = os.environ.get('JIRA_CRED_FILE') or os.path.join(os.path.expanduser('~'), '.jira-kwtr', 'credenciais.json')
CRIAR_TOKEN = 'https://id.atlassian.com/manage-profile/security/api-tokens'

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, 'reconfigure'):
        _s.reconfigure(encoding='utf-8')


def le_cred():
    if os.environ.get('JIRA_EMAIL') and os.environ.get('JIRA_API_TOKEN'):
        return {'email': os.environ['JIRA_EMAIL'], 'token': os.environ['JIRA_API_TOKEN'],
                'site': os.environ.get('JIRA_SITE', SITE)}
    try:
        with open(CRED, encoding='utf-8') as f:
            j = json.load(f).get('jira')
    except FileNotFoundError:
        j = None
    if not j or not j.get('token'):
        sys.exit(f'Sem token do Jira. Corre no teu terminal: python "{os.path.abspath(__file__)}" configurar')
    return {'site': SITE, **j}


def pedido(caminho, cred=None, params=None, binario=False):
    cred = cred or le_cred()
    url = caminho if caminho.startswith('http') else f"https://{cred['site']}{caminho}"
    if params:
        url += '?' + urllib.parse.urlencode(params)
    auth = base64.b64encode(f"{cred['email']}:{cred['token']}".encode()).decode()
    req = urllib.request.Request(url, headers={'Authorization': 'Basic ' + auth, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            dados = r.read()
    except urllib.error.HTTPError as e:
        if e.code == 401:
            sys.exit('401: token inválido ou revogado. Cria um novo e corre "configurar".')
        if e.code == 404:
            sys.exit('404: issue inexistente ou sem permissão para o ver.')
        sys.exit(f'HTTP {e.code}: {e.read()[:300].decode(errors="replace")}')
    return dados if binario else json.loads(dados)


def adf(n):
    """Converte o Atlassian Document Format em texto simples."""
    if isinstance(n, list):
        return ''.join(adf(x) for x in n)
    if not isinstance(n, dict):
        return ''
    tipo = n.get('type')
    attrs = n.get('attrs', {})
    if tipo == 'mention':
        return '@' + attrs.get('text', '').lstrip('@')
    if tipo in ('inlineCard', 'blockCard'):
        return attrs.get('url', '')
    if tipo == 'hardBreak':
        return '\n'
    if tipo in ('media', 'mediaInline'):
        return f"[imagem/anexo {attrs.get('alt') or attrs.get('id', '')}]"
    s = n.get('text', '')
    for m in n.get('marks', []):
        if m.get('type') == 'link' and m.get('attrs', {}).get('href') not in (None, s):
            s += f" ({m['attrs']['href']})"
    filhos = adf(n.get('content', []))
    if tipo == 'listItem':
        return '- ' + filhos.strip() + '\n'
    if tipo in ('paragraph', 'heading', 'tableRow', 'codeBlock', 'blockquote'):
        return s + filhos + '\n'
    if tipo in ('tableCell', 'tableHeader'):
        return filhos.strip() + ' | '
    return s + filhos


def limpa(t):
    return re.sub(r'\n{3,}', '\n\n', t).strip()


def chave(k):
    k = k.strip().upper()
    return k if '-' in k else f'{PROJECTO}-{k}'


def cmd_configurar(_):
    print(f'1) Cria um token em {CRIAR_TOKEN} ("Create API token", dá-lhe um nome e um prazo).')
    print('2) Cola-o aqui. Não aparece no ecrã e não fica no histórico.\n')
    email = input('Email da conta Atlassian: ').strip()
    token = getpass.getpass('Token: ').strip()
    cred = {'email': email, 'token': token, 'site': SITE}
    eu = pedido('/rest/api/3/myself', cred)
    os.makedirs(os.path.dirname(CRED), exist_ok=True)
    tudo = {}
    if os.path.exists(CRED):
        with open(CRED, encoding='utf-8') as f:
            tudo = json.load(f)
    tudo['jira'] = cred
    with open(CRED, 'w', encoding='utf-8') as f:
        json.dump(tudo, f, ensure_ascii=False, indent=2)
    if os.name != 'nt':
        os.chmod(CRED, 0o600)
    print(f"\nOK: autenticado como {eu.get('displayName')}. Token guardado em {CRED} (chave \"jira\").")


def cmd_testar(_):
    eu = pedido('/rest/api/3/myself')
    p = pedido(f'/rest/api/3/project/{PROJECTO}')
    print(f"OK: {eu.get('displayName')} tem acesso ao projecto {p['key']} ({p['name']}).")


def cmd_ler(args):
    if not args:
        sys.exit('Uso: ler KWTR-14 [--sem-comentarios]')
    campos = 'summary,status,issuetype,created,updated,resolutiondate,assignee,reporter,labels,parent,description,comment,attachment,issuelinks'
    for k in [a for a in args if not a.startswith('--')]:
        d = pedido(f'/rest/api/3/issue/{chave(k)}', params={'fields': campos})
        f = d['fields']
        pessoa = lambda p: (p or {}).get('displayName', '-')
        print(f"### {d['key']} [{f['status']['name']}] {f['summary']}")
        print(f"Tipo: {f['issuetype']['name']} | Criado: {f['created'][:10]} | Actualizado: {f['updated'][:10]}"
              f" | Responsável: {pessoa(f.get('assignee'))} | Relator: {pessoa(f.get('reporter'))}")
        if f.get('parent'):
            print(f"Pai: {f['parent']['key']} {f['parent']['fields']['summary']}")
        if f.get('labels'):
            print('Labels: ' + ', '.join(f['labels']))
        for l in f.get('issuelinks', []):
            o = l.get('outwardIssue') or l.get('inwardIssue')
            print(f"Ligação ({l['type']['name']}): {o['key']} [{o['fields']['status']['name']}] {o['fields']['summary']}")
        for a in f.get('attachment', []):
            print(f"Anexo: {a['filename']} ({a['created'][:10]})")
        print(f"Link: https://{SITE}/browse/{d['key']}\n")
        print(limpa(adf(f.get('description'))) or '(sem descrição)')
        if '--sem-comentarios' not in args:
            for c in f['comment']['comments']:
                print(f"\n--- Comentário de {pessoa(c['author'])}, {c['created'][:10]}")
                print(limpa(adf(c['body'])))
        print()


def cmd_procurar(args):
    texto, jql, maximo = None, None, 50
    i = 0
    while i < len(args):
        if args[i] == '--jql':
            jql, i = args[i + 1], i + 2
        elif args[i] == '--max':
            maximo, i = int(args[i + 1]), i + 2
        else:
            texto, i = args[i], i + 1
    partes = [f'project = {PROJECTO}']
    if texto:
        texto_jql = texto.replace('\\', '\\\\').replace('"', '\\"')
        partes.append(f'text ~ "{texto_jql}"')
    if jql:
        partes.append(f'({jql})')
    consulta = ' AND '.join(partes) + ' ORDER BY key'
    vistos, token = 0, None
    while vistos < maximo:
        params = {'jql': consulta, 'fields': 'summary,status', 'maxResults': min(100, maximo - vistos)}
        if token:
            params['nextPageToken'] = token
        d = pedido('/rest/api/3/search/jql', params=params)
        for i in d['issues']:
            print(f"{i['key']}  [{i['fields']['status']['name']}]  {i['fields']['summary']}")
            vistos += 1
        token = d.get('nextPageToken')
        if d.get('isLast', True) or not token:
            break
    if not vistos:
        print('Sem resultados. Dica: a pesquisa de texto é sensível aos acentos; experimenta "propriet*".')


def cmd_anexos(args):
    if not args or '--pasta' not in args:
        sys.exit('Uso: anexos KWTR-14 --pasta <dir>')
    pasta = args[args.index('--pasta') + 1]
    os.makedirs(pasta, exist_ok=True)
    d = pedido(f'/rest/api/3/issue/{chave(args[0])}', params={'fields': 'attachment'})
    for a in d['fields']['attachment']:
        destino = os.path.join(pasta, re.sub(r'[\\/:*?"<>|]', '_', a['filename']))
        with open(destino, 'wb') as f:
            f.write(pedido(a['content'], binario=True))
        print(destino)


COMANDOS = {'configurar': cmd_configurar, 'testar': cmd_testar, 'ler': cmd_ler,
            'procurar': cmd_procurar, 'anexos': cmd_anexos}

if __name__ == '__main__':
    if len(sys.argv) >= 2 and sys.argv[1] in ('-h', '--help', 'ajuda'):
        print(__doc__)
        sys.exit(0)
    if len(sys.argv) < 2 or sys.argv[1] not in COMANDOS:
        print(__doc__)
        sys.exit(1)
    COMANDOS[sys.argv[1]](sys.argv[2:])
