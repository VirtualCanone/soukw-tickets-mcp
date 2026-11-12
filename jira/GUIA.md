# Ligar o Claude ao Jira (KWTR) por API

Dá ao Claude acesso **só de leitura** ao Jira da KW Portugal (projecto **KWTR** em `dvtpt.atlassian.net`): ler User Stories, bugs, comentários e anexos, e pesquisar por texto ou JQL. É a mesma forma de trabalhar que a equipa SouKW V2 usa no projecto de análise de US.

Cada pessoa usa o **seu próprio token** da Atlassian. Não há tokens partilhados e nenhum token vai para este repositório.

Requisitos: Python 3 (só biblioteca padrão) e uma conta Atlassian com acesso ao projecto KWTR.

## 1. Criar o seu token

1. Abra https://id.atlassian.com/manage-profile/security/api-tokens com a sua conta de trabalho.
2. **Create API token**: dê-lhe um nome (ex. `Claude Code`) e uma validade. Copie o token.
3. Não o cole no chat do Claude, em emails, nem em ficheiros deste repositório.

## 2. Instalar a skill no Claude Code

Copie a pasta `skill/jira` para as skills do seu utilizador (PowerShell, a partir da raiz deste repositório):

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\skills" | Out-Null
Copy-Item -Recurse -Force .\jira\skill\jira "$env:USERPROFILE\.claude\skills\"
```

(macOS/Linux: `mkdir -p ~/.claude/skills && cp -r jira/skill/jira ~/.claude/skills/`.)

A partir daí, o Claude Code usa a skill `jira` sozinho quando precisar de confirmar uma US.

## 3. Guardar o token (escolha uma das formas)

**A) Ficheiro no seu perfil (recomendado).** No **seu terminal**, fora do chat do Claude:

```powershell
python "$env:USERPROFILE\.claude\skills\jira\jira.py" configurar
```

Pede o email e o token (sem eco no ecrã), valida-os no Jira e grava-os em `%USERPROFILE%\.jira-kwtr\credenciais.json`. Esse ficheiro fica fora de qualquer repositório; não o partilhe.

**B) Variáveis de ambiente do utilizador.** Útil se já gere segredos assim:

```powershell
[Environment]::SetEnvironmentVariable('JIRA_EMAIL', '<o seu email de trabalho>', 'User')
[Environment]::SetEnvironmentVariable('JIRA_API_TOKEN', '<o seu token>', 'User')
```

Feche e volte a abrir o terminal e o Claude Code. As variáveis têm prioridade sobre o ficheiro. Nota: este comando fica no histórico do PowerShell; a forma A não deixa rasto.

## 4. Testar

```powershell
python "$env:USERPROFILE\.claude\skills\jira\jira.py" testar
python "$env:USERPROFILE\.claude\skills\jira\jira.py" ler KWTR-14 --sem-comentarios
```

O primeiro deve responder `OK: <o seu nome> tem acesso ao projecto KWTR (...)`. Todos os comandos estão em `python jira.py --help` e no [SKILL.md](skill/jira/SKILL.md).

## Revogar ou trocar o token
Apague o token na mesma página da Atlassian e repita o passo 3 com um novo. Se suspeitar que foi exposto, revogue-o logo.

## Alternativa: MCP oficial da Atlassian
A Atlassian tem um servidor MCP remoto oficial (Atlassian Remote MCP Server, Jira e Confluence), com login por OAuth no browser em vez de token. No Claude Desktop/claude.ai aparece como conector "Atlassian"; no Claude Code adiciona-se com `claude mcp add` apontando para o endereço indicado na documentação da Atlassian. Diferenças face a esta skill: entra com a sua sessão Atlassian (sem token para guardar) e **também pode escrever** (criar e editar issues, comentar), por isso exige mais cuidado ao aceitar as acções; e depende de o administrador do site `dvtpt.atlassian.net` o permitir. Não está instalado nem testado por este repositório.
