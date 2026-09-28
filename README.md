# Validação de Soluções — Sebrae Indústria PR

Fichas para os gestores validarem a classificação das soluções (segmento, jornada, área, maturidade, momento). O gestor se identifica com nome e e-mail, aprova ou reclassifica cada solução, e as respostas ficam salvas no Netlify Blobs.

## Estrutura

- `public/` — site estático (`index.html`, `app.js`, `styles.css`, `filtros.js`, `logo.png`)
- `public/data.js` — soluções, gerado da planilha (a planilha não vai para o Git)
- `netlify/functions/avaliacoes.mjs` — API em `/api/avaliacoes` (salvar, retomar, exportar CSV)
- `scripts/gerar_data.py` — gera `public/data.js` a partir da planilha da base final

## Rodar local

```bash
npm install
npx netlify-cli dev --port 8899
```

Abre em http://localhost:8899. Os dados de teste ficam em `.netlify/` (local, não sobe).

## Publicar

O site no Netlify está ligado a este repositório: cada push na `main` republica sozinho.
Para atualizar a base, gere o `data.js` de novo, faça o commit e dê push:

```bash
python scripts/gerar_data.py caminho/BASE_FINAL_SEBRAE_com_precos.xlsx   # pip install openpyxl
```

(O arrastar-e-soltar do Netlify não publica functions.)

## Resultados

`https://<site>.netlify.app/api/avaliacoes?formato=csv` baixa todas as avaliações (CSV com `;`, abre no Excel).

Variáveis de ambiente opcionais (Netlify → Site configuration → Environment variables):

- `EMAILS_PERMITIDOS` — e-mails autorizados, separados por vírgula. Vazio = qualquer e-mail entra.
- `CHAVE_EXPORTACAO` — se definida, o CSV exige `&chave=<valor>`.
