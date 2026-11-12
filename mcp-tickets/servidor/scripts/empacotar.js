// Gera mcp_tickets/dist/soukw-tickets-<versão>.mcpb com o CLI oficial @anthropic-ai/mcpb.
// Monta uma pasta de preparação só com o necessário (src, package.json, manifest e dependências de produção),
// sincroniza a versão e a lista de ferramentas do manifest a partir do código, valida e empacota.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FERRAMENTAS } from '../src/ferramentas.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(raiz, '..', 'dist');
const prep = path.join(dist, 'preparacao');
const pkg = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// No Windows os .cmd precisam de shell; aspas porque o caminho do projecto tem espaços ("ODC Merge").
const aspas = (s) => (process.platform === 'win32' && /\s/.test(s) ? `"${s}"` : s);
const correr = (cmd, args, cwd) => execFileSync(aspas(cmd), args.map(aspas), { cwd, stdio: 'inherit', shell: process.platform === 'win32' });

fs.rmSync(prep, { recursive: true, force: true });
fs.mkdirSync(prep, { recursive: true });
fs.cpSync(path.join(raiz, 'src'), path.join(prep, 'src'), { recursive: true });
for (const f of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(raiz, f), path.join(prep, f));

const manifest = JSON.parse(fs.readFileSync(path.join(raiz, 'manifest.json'), 'utf8'));
manifest.version = pkg.version;
manifest.tools = FERRAMENTAS.map((f) => ({ name: f.nome, description: f.descricao }));
fs.writeFileSync(path.join(prep, 'manifest.json'), JSON.stringify(manifest, null, 2));

correr(npm, ['ci', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts'], prep);
const mcpb = path.join(raiz, 'node_modules', '.bin', process.platform === 'win32' ? 'mcpb.cmd' : 'mcpb');
correr(mcpb, ['validate', path.join(prep, 'manifest.json')], raiz);
const saida = path.join(dist, `soukw-tickets-${pkg.version}.mcpb`);
correr(mcpb, ['pack', prep, saida], raiz);
fs.rmSync(prep, { recursive: true, force: true });
console.log(`\nPacote: ${saida}`);
