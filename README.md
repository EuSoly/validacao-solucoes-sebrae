# Validação de Soluções — Sebrae Indústria PR

Fichas para os gestores validarem a classificação das soluções (segmento, jornada, área, maturidade, momento). O gestor se identifica com nome e e-mail, aprova ou reclassifica cada solução, e as respostas ficam salvas no Netlify Blobs.

## Lotes e respostas

Cada gestor recebe um lote sorteado de 10 soluções. O sorteio prioriza as soluções com menos validações, depois as menos reservadas em lotes de outros gestores ainda não respondidos; empates são aleatórios. O lote fica gravado (o gestor volta e encontra as mesmas soluções) e, ao terminar, ele pode pedir outro em "Quero avaliar mais".

Os filtros da ficha já abrem editáveis, com a classificação atual marcada (multisseleção: "marque todas que se aplicam"; Jornada e Momento mostram a definição de cada opção). Para cada solução o gestor responde:

- **Aprovada como está** — a classificação está certa. Se algum filtro foi alterado, pede para desfazer ou escolher "com ajustes".
- **Aprovada com ajustes** — exige pelo menos um filtro alterado e um comentário explicando as mudanças.
- **Fora do escopo** — a solução não é para a indústria; exige comentário.
- **Não sei avaliar** — com motivo (não conheço a solução / a descrição não basta / não sei se é da indústria). Fica registrado, mas não conta como validação: a solução volta para o sorteio e vai para outro gestor (nunca de novo para quem disse "não sei").

As respostas "Não aprovada" da 1ª rodada (antes de existir "com ajustes") continuam valendo e entram no painel junto com as "com ajustes".

As áreas espelho foram unificadas (`UNIFICAR` em `public/filtros.js`): o gerador aplica na planilha e o painel aplica nas avaliações antigas.

O app mede o tempo de cada resposta (só com a ficha na tela, a aba visível e alguém mexendo; pausa depois de 2 min parado). Aparece no painel e no CSV.

## Estrutura

- `public/` — site estático: app dos gestores (`index.html`, `app.js`), painel (`admin.html`, `admin.js`, `admin.css`), `styles.css`, `filtros.js`, `logo.png`
- `public/data.js` — soluções, gerado da planilha (a planilha não vai para o Git)
- `netlify/functions/avaliacoes.mjs` — API em `/api/avaliacoes` (salvar, retomar, sortear lote) e `/api/admin` (painel e CSV)
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

## Painel

`https://<site>.netlify.app/admin.html` — cobertura da base, gestores (com "Liberar pendentes" para devolver à fila as soluções de um lote abandonado, e "Remover" para apagar um gestor e suas respostas), soluções com filtros (sem ninguém, reservadas, validadas, não aprovadas, divergência) e o detalhe de cada parecer. O botão "Baixar CSV" exporta todas as avaliações (`;`, abre no Excel).

Login padrão **admin / admin**, conferido no servidor. Troque antes de divulgar o link.

Variáveis de ambiente opcionais (Netlify → Site configuration → Environment variables):

- `ADMIN_USUARIO` / `ADMIN_SENHA` — login do painel (padrão `admin` / `admin`).
- `EMAILS_PERMITIDOS` — e-mails autorizados, separados por vírgula. Vazio = qualquer e-mail entra.
- `LOTE_TAMANHO` — soluções por lote (padrão `10`).
