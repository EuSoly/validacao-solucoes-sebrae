/* API das avaliações — um registro (blob) por gestor, com todas as avaliações dele.
   GET  /api/avaliacoes?email=x          → avaliações e lote do gestor (para retomar de onde parou)
   POST /api/avaliacoes {acao:'entrar', nome, email}
   POST /api/avaliacoes {acao:'lote', nome, email, ids}     → sorteia mais um lote para o gestor
   POST /api/avaliacoes {nome, email, solucao, avaliacao}   (avaliacao null = apagar)

   Pareceres: aprovada (como está), ajustada (aprovada com ajustes), fora_escopo, nao_sei
   (com motivoNaoSei) e nao_aprovada, que é da 1ª rodada e continua valendo nas respostas antigas.

   Lote: cada gestor recebe LOTE_TAMANHO soluções por vez, priorizando as com menos
   validações (todo parecer menos "não sei"), depois as menos reservadas
   em lotes ainda não respondidos; empates por sorteio.

   Painel (exige Authorization: Basic usuário:senha do admin):
   GET  /api/admin                        → todos os gestores, lotes e avaliações
   GET  /api/admin?formato=csv            → todas as avaliações em CSV (Excel)
   POST /api/admin {acao:'entrar'}        → só confere o login
   POST /api/admin {acao:'liberar', email} → devolve para a fila as soluções do lote ainda sem resposta
   POST /api/admin {acao:'remover', email} → move o gestor (com as avaliações) para a lixeira
   GET  /api/admin?lixeira=1              → itens da lixeira
   POST /api/admin {acao:'restaurar', id}  → devolve o gestor da lixeira (junta com registro novo do mesmo e-mail)
   POST /api/admin {acao:'excluir_lixeira', id} → apaga de vez um item da lixeira

   Variáveis de ambiente opcionais (Netlify → Site configuration → Environment variables):
   EMAILS_PERMITIDOS  lista de e-mails separados por vírgula; vazio = qualquer e-mail entra
   ADMIN_USUARIO / ADMIN_SENHA  login do painel (padrão admin / admin — troque antes de divulgar)
   LOTE_TAMANHO       soluções por lote (padrão 10) */
import { getStore } from '@netlify/blobs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROTULOS = { segmento: 'Segmento', jornada: 'Jornada', area: 'Área principal', maturidade: 'Maturidade', momento: 'Momento empresarial' };
const PARECER = { aprovada: 'Aprovada como está', ajustada: 'Aprovada com ajustes', fora_escopo: 'Fora do escopo', nao_sei: 'Não sei', nao_aprovada: 'Não aprovada (1ª rodada)' };
const MOTIVO_NAO_SEI = { nao_conheco: 'Não conheço a solução', descricao: 'A descrição não basta', industria: 'Não sei se é da indústria' };

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const str = (v, max) => String(v == null ? '' : v).slice(0, max);
const strList = (v) => (Array.isArray(v) ? v.slice(0, 50).map((x) => str(x, 200)) : []);
const normEmail = (e) => str(e, 200).trim().toLowerCase();
const chave = (email) => Buffer.from(email).toString('base64url'); // só caracteres seguros para chave de blob

function permitido(email) {
  const lista = (process.env.EMAILS_PERMITIDOS || '').split(/[,;\s]+/).map(normEmail).filter(Boolean);
  return !lista.length || lista.includes(email);
}

function adminOk(req) {
  const [tipo, cred] = (req.headers.get('authorization') || '').split(' ');
  if (tipo !== 'Basic' || !cred) return false;
  const txt = Buffer.from(cred, 'base64').toString('utf8');
  const i = txt.indexOf(':');
  return i > 0 && txt.slice(0, i) === (process.env.ADMIN_USUARIO || 'admin') && txt.slice(i + 1) === (process.env.ADMIN_SENHA || 'admin');
}

async function admin(req, store, url) {
  if (!adminOk(req)) return json({ erro: 'Usuário ou senha inválidos.' }, 401);
  const lixeira = getStore({ name: 'lixeira', consistency: 'strong' });
  if (req.method === 'GET') {
    if (url.searchParams.get('lixeira')) {
      const itens = (await todos(lixeira)).map((x) => ({
        id: x.id, removidoEm: x.removidoEm, nome: x.gestor.nome, email: x.gestor.email,
        respostas: Object.keys(x.gestor.avaliacoes || {}).length, lote: (x.gestor.lote || []).length,
      })).sort((a, b) => String(b.removidoEm).localeCompare(String(a.removidoEm)));
      return json({ itens });
    }
    const gestores = await todos(store);
    return url.searchParams.get('formato') === 'csv' ? csv(gestores) : json({ gestores });
  }
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ erro: 'Requisição inválida.' }, 400); }
  if (body.acao === 'entrar') return json({ ok: true });

  // Lixeira: restaurar devolve o gestor (juntando com um registro novo do mesmo e-mail, se houver);
  // excluir_lixeira apaga de vez.
  if (body.acao === 'restaurar' || body.acao === 'excluir_lixeira') {
    const id = str(body.id, 300);
    const item = id && (await lixeira.get(id, { type: 'json' }));
    if (!item) return json({ erro: 'Item não encontrado na lixeira.' }, 404);
    if (body.acao === 'restaurar') {
      const velho = item.gestor, k = chave(velho.email);
      const atual = await store.get(k, { type: 'json' });
      const g = atual
        ? { ...atual, avaliacoes: { ...(velho.avaliacoes || {}), ...(atual.avaliacoes || {}) },
            lote: [...new Set([...(velho.lote || []), ...(atual.lote || [])])] }
        : velho;
      await store.setJSON(k, g);
    }
    await lixeira.delete(id);
    return json({ ok: true });
  }

  const email = normEmail(body.email);
  const g = await store.get(chave(email), { type: 'json' });
  if (!g) return json({ erro: 'Gestor não encontrado.' }, 404);
  if (body.acao === 'liberar') {
    const antes = (g.lote || []).length;
    g.lote = (g.lote || []).filter((id) => (g.avaliacoes || {})[id]);
    await store.setJSON(chave(email), g);
    return json({ ok: true, liberadas: antes - g.lote.length });
  }
  if (body.acao === 'remover') {
    // guarda uma cópia na lixeira antes de apagar, para poder restaurar
    const id = `${Date.now()}-${chave(email)}`;
    await lixeira.setJSON(id, { id, removidoEm: new Date().toISOString(), gestor: g });
    await store.delete(chave(email));
    return json({ ok: true, lixeira: id });
  }
  return json({ erro: 'Ação desconhecida.' }, 400);
}

function limpaAvaliacao(a) {
  if (!PARECER[a.decisao]) return null;
  const classificacao = {};
  if (a.classificacao && typeof a.classificacao === 'object') {
    for (const k of Object.keys(a.classificacao).slice(0, 20)) classificacao[str(k, 50)] = strList(a.classificacao[k]);
  }
  return {
    decisao: a.decisao,
    nomeSolucao: str(a.nomeSolucao, 300),
    classificacao,
    alterados: strList(a.alterados),
    comentario: str(a.comentario, 2000).trim(),
    tempoSegundos: Math.min(86400, Math.max(0, Math.round(Number(a.tempoSegundos) || 0))),
    ...(a.decisao === 'nao_sei' && MOTIVO_NAO_SEI[a.motivoNaoSei] ? { motivoNaoSei: a.motivoNaoSei } : {}),
    em: new Date().toISOString(),
  };
}

// Escolhe as próximas soluções para o gestor: menos validadas primeiro, depois as menos
// reservadas em lotes de outros gestores ainda sem resposta; empates são sorteados.
function sorteiaLote(ids, gestores, eu) {
  const validacoes = {}, reservas = {};
  for (const g of gestores) {
    if (g.email === eu.email) continue;
    for (const [id, a] of Object.entries(g.avaliacoes || {})) if (a.decisao !== 'nao_sei') validacoes[id] = (validacoes[id] || 0) + 1;
    for (const id of g.lote || []) if (!(g.avaliacoes || {})[id]) reservas[id] = (reservas[id] || 0) + 1;
  }
  const jaTem = new Set([...(eu.lote || []), ...Object.keys(eu.avaliacoes || {})]);
  const tamanho = Math.floor(Number(process.env.LOTE_TAMANHO)) > 0 ? Math.floor(Number(process.env.LOTE_TAMANHO)) : 10;
  return ids
    .filter((id) => !jaTem.has(id))
    .map((id) => ({ id, v: validacoes[id] || 0, r: reservas[id] || 0, s: Math.random() }))
    .sort((a, b) => a.v - b.v || a.r - b.r || a.s - b.s)
    .slice(0, tamanho)
    .map((x) => x.id);
}

async function todos(store) {
  const { blobs } = await store.list();
  const lista = await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })));
  return lista.filter(Boolean);
}

function csv(gestores) {
  const chaves = [];
  gestores.forEach((g) => Object.values(g.avaliacoes || {}).forEach((a) => {
    Object.keys(a.classificacao || {}).forEach((k) => { if (!chaves.includes(k)) chaves.push(k); });
  }));
  const cel = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const linhas = [['Data', 'Gestor', 'E-mail', 'ID da solução', 'Solução', 'Parecer', 'Motivo do "não sei"', 'Tempo (segundos)', 'Filtros alterados',
    ...chaves.map((k) => ROTULOS[k] || k), 'Comentário']];
  gestores.forEach((g) => Object.entries(g.avaliacoes || {}).forEach(([id, a]) => {
    linhas.push([
      new Date(a.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      g.nome, g.email, id, a.nomeSolucao,
      PARECER[a.decisao] || a.decisao,
      a.decisao === 'nao_sei' ? MOTIVO_NAO_SEI[a.motivoNaoSei] || MOTIVO_NAO_SEI.nao_conheco : '', // antes do motivo, o botão era "Não conheço"
      a.tempoSegundos ?? '',
      (a.alterados || []).map((k) => ROTULOS[k] || k).join(', '),
      ...chaves.map((k) => ((a.classificacao || {})[k] || []).join(', ')),
      a.comentario,
    ]);
  }));
  const corpo = '﻿' + linhas.map((l) => l.map(cel).join(';')).join('\r\n');
  return new Response(corpo, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="avaliacoes-solucoes.csv"',
      'cache-control': 'no-store',
    },
  });
}

export default async (req) => {
  const store = getStore({ name: 'avaliacoes', consistency: 'strong' });
  const url = new URL(req.url);
  if (url.pathname === '/api/admin') return admin(req, store, url);

  if (req.method === 'GET') {
    const email = normEmail(url.searchParams.get('email'));
    if (!EMAIL_RE.test(email)) return json({ erro: 'Informe um e-mail válido.' }, 400);
    const g = await store.get(chave(email), { type: 'json' });
    return json({ avaliacoes: (g && g.avaliacoes) || {}, lote: (g && g.lote) || [] });
  }

  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ erro: 'Requisição inválida.' }, 400); }
  const email = normEmail(body.email);
  const nome = str(body.nome, 120).trim();
  if (!nome) return json({ erro: 'Informe seu nome.' }, 400);
  if (!EMAIL_RE.test(email)) return json({ erro: 'Informe um e-mail válido.' }, 400);
  if (!permitido(email)) return json({ erro: 'Este e-mail não está na lista de gestores da validação.' }, 403);

  if (body.acao === 'entrar') return json({ ok: true });

  if (body.acao === 'lote') {
    const ids = [...new Set(Array.isArray(body.ids) ? body.ids.slice(0, 5000).map((x) => str(x, 100)) : [])];
    const gestores = await todos(store);
    const eu = gestores.find((x) => x.email === email) || { email, avaliacoes: {} };
    // quem já avaliou antes de existir lote começa com essas soluções no lote
    if (!eu.lote) eu.lote = Object.keys(eu.avaliacoes || {});
    const novos = sorteiaLote(ids, gestores, eu);
    eu.lote = eu.lote.concat(novos);
    eu.nome = nome;
    await store.setJSON(chave(email), eu);
    return json({ lote: eu.lote, novos });
  }

  const solucao = str(body.solucao, 100);
  if (!solucao) return json({ erro: 'Solução não informada.' }, 400);
  const g = (await store.get(chave(email), { type: 'json' })) || { email, avaliacoes: {} };
  g.nome = nome;
  if (body.avaliacao == null) {
    delete g.avaliacoes[solucao];
  } else {
    const a = limpaAvaliacao(body.avaliacao);
    if (!a) return json({ erro: 'Parecer inválido.' }, 400);
    g.avaliacoes[solucao] = a;
  }
  await store.setJSON(chave(email), g);
  return json({ ok: true });
};

export const config = { path: ['/api/avaliacoes', '/api/admin'] };
