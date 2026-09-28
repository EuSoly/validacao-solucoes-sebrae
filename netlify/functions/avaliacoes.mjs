/* API das avaliações — um registro (blob) por gestor, com todas as avaliações dele.
   GET  /api/avaliacoes?email=x          → avaliações e lote do gestor (para retomar de onde parou)
   GET  /api/avaliacoes?formato=csv      → todas as avaliações em CSV (Excel)
   POST /api/avaliacoes {acao:'entrar', nome, email}
   POST /api/avaliacoes {acao:'lote', nome, email, ids}     → sorteia mais um lote para o gestor
   POST /api/avaliacoes {nome, email, solucao, avaliacao}   (avaliacao null = apagar)

   Lote: cada gestor recebe LOTE_PERCENTUAL% das soluções, priorizando as com menos
   validações, depois as menos reservadas em lotes ainda não respondidos; empates por sorteio.

   Variáveis de ambiente opcionais (Netlify → Site configuration → Environment variables):
   EMAILS_PERMITIDOS  lista de e-mails separados por vírgula; vazio = qualquer e-mail entra
   CHAVE_EXPORTACAO   se definida, o CSV exige ?chave=<valor>
   LOTE_PERCENTUAL    tamanho do lote em % do total de soluções (padrão 10) */
import { getStore } from '@netlify/blobs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROTULOS = { segmento: 'Segmento', jornada: 'Jornada', area: 'Área principal', maturidade: 'Maturidade', momento: 'Momento empresarial' };

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

function limpaAvaliacao(a) {
  if (a.decisao !== 'aprovada' && a.decisao !== 'nao_aprovada') return null;
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
    em: new Date().toISOString(),
  };
}

// Escolhe as próximas soluções para o gestor: menos validadas primeiro, depois as menos
// reservadas em lotes de outros gestores ainda sem resposta; empates são sorteados.
function sorteiaLote(ids, gestores, eu) {
  const validacoes = {}, reservas = {};
  for (const g of gestores) {
    if (g.email === eu.email) continue;
    for (const id of Object.keys(g.avaliacoes || {})) validacoes[id] = (validacoes[id] || 0) + 1;
    for (const id of g.lote || []) if (!(g.avaliacoes || {})[id]) reservas[id] = (reservas[id] || 0) + 1;
  }
  const jaTem = new Set([...(eu.lote || []), ...Object.keys(eu.avaliacoes || {})]);
  const pct = Number(process.env.LOTE_PERCENTUAL) > 0 ? Number(process.env.LOTE_PERCENTUAL) : 10;
  const tamanho = Math.max(1, Math.ceil(ids.length * pct / 100));
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
  const linhas = [['Data', 'Gestor', 'E-mail', 'ID da solução', 'Solução', 'Parecer', 'Filtros alterados',
    ...chaves.map((k) => ROTULOS[k] || k), 'Comentário']];
  gestores.forEach((g) => Object.entries(g.avaliacoes || {}).forEach(([id, a]) => {
    linhas.push([
      new Date(a.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      g.nome, g.email, id, a.nomeSolucao,
      a.decisao === 'aprovada' ? 'Aprovada' : 'Não aprovada',
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

  if (req.method === 'GET') {
    if (url.searchParams.get('formato') === 'csv') {
      const exigida = process.env.CHAVE_EXPORTACAO;
      if (exigida && url.searchParams.get('chave') !== exigida) return json({ erro: 'Chave inválida.' }, 403);
      return csv(await todos(store));
    }
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

export const config = { path: '/api/avaliacoes' };
