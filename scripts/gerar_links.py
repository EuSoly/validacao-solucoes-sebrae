"""Gera scripts/links_solucoes.json (id da solução -> link da página da solução).

Uso:  python scripts/gerar_links.py caminho/Base_Unificada_Solucoes.xlsx
Depois rode scripts/gerar_data.py para aplicar os links no public/data.js.

Casa pelo nome da solução: primeiro o nome exato; se não houver, o nome normalizado
(sem acento, caixa, pontuação e prefixo "Sebraetec"), desde que dê um único link.
Soluções sem link na planilha ficam de fora (o card não mostra o botão).
"""
import collections
import json
import re
import sys
import unicodedata
from pathlib import Path

import openpyxl

RAIZ = Path(__file__).resolve().parent.parent
DATA = RAIZ / 'public' / 'data.js'
SAIDA = RAIZ / 'scripts' / 'links_solucoes.json'


def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'^\s*sebraetec\s*[-–:]?\s*', '', s)
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def main(xlsx):
    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    rows = list(wb['Base Unificada'].iter_rows(values_only=True))
    h = rows[0]
    exato, normal = collections.defaultdict(set), collections.defaultdict(set)
    for r in rows[1:]:
        nome, link = r[h.index('Nome')], r[h.index('Link')]
        link = str(link or '').strip()
        if nome and link.startswith('http'):
            exato[str(nome).strip()].add(link)
            normal[norm(nome)].add(link)

    src = DATA.read_text(encoding='utf-8')
    sols = [json.loads(l.strip().rstrip(',')) for l in src.split('\n') if l.strip().startswith('{"id"')]
    links, sem, ambiguos = {}, [], []
    for s in sols:
        cand = exato.get(s['nome'].strip()) or normal.get(norm(s['nome'])) or set()
        if len(cand) == 1:
            links[s['id']] = next(iter(cand))
        elif cand:
            ambiguos.append(s['id'])
        else:
            sem.append(s['id'])

    SAIDA.write_text(json.dumps(links, ensure_ascii=False, indent=1) + '\n', encoding='utf-8', newline='\n')
    print(f'{len(links)} links gravados | sem link: {len(sem)} | ambíguos (sem botão): {ambiguos}')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
