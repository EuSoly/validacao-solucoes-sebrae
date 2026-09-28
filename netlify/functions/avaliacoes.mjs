/* API das avaliações — um registro (blob) por gestor, com todas as avaliações dele.
   GET  /api/avaliacoes?email=x          → avaliações do gestor (para retomar de onde parou)
   GET  /api/avaliacoes?formato=csv      → todas as avaliações em CSV (Excel)
   POST /api/avaliacoes {acao:'entrar', nome, email}
   POST /api/avaliacoes {nome, email, solucao, avaliacao}   (avaliacao null = apagar)

   Variáveis de ambiente opcionais (Netlify → Site configuration → Environment variables):
   EMAILS_PERMITIDOS  lista de e-mails separados por vírgula; vazio = qualquer e-mail entra
   CHAVE_EXPORTACAO   se definida, o CSV exige ?chave=<valor> */
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
    return json({ avaliacoes: (g && g.avaliacoes) || {} });
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
