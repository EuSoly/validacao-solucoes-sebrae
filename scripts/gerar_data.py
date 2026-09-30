"""Gera public/data.js (SOLUCOES) a partir da planilha da base final.

Uso:  python scripts/gerar_data.py caminho/BASE_FINAL_SEBRAE_com_precos.xlsx
Requer: pip install openpyxl

Confere cada valor de classificação contra as opções de public/filtros.js e
para com erro se algum não existir lá (o modo de reclassificação não o mostraria).

Os links de scripts/links_solucoes.json viram o botão "Acessar solução" no card.
As descrições de scripts/descricoes_sebraetec.json (reescritas a partir das fichas
técnicas do Sebraetec) substituem a descrição da planilha para os ids listados.
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

RAIZ = Path(__file__).resolve().parent.parent
FILTROS = RAIZ / 'public' / 'filtros.js'
DATA = RAIZ / 'public' / 'data.js'
DESCRICOES = RAIZ / 'scripts' / 'descricoes_sebraetec.json'
LINKS = RAIZ / 'scripts' / 'links_solucoes.json'  # gerado por scripts/gerar_links.py
NA = 'Não se aplica (institucional)'
CABECALHO = '''/* SOLUÇÕES — gerado por scripts/gerar_data.py a partir da planilha da base final.
   Não editar à mão. "id" é a chave das avaliações salvas: precisa ser único e estável. */
'''


def opcoes_dos_filtros():
    src = FILTROS.read_text(encoding='utf-8')
    opts = {}
    for key, body in re.findall(r"\{key:'(\w+)',label:'[^']*',options:\[(.*?)\]\}", src):
        opts[key] = [NA if o == 'NA' else o.strip("'") for o in re.findall(r"'[^']*'|NA", body)]
    return opts


def preco(v):
    if v in (None, ''):
        return 'Valor não informado'
    s = f'{float(v):,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    return 'R$ ' + s


def maturidade(v):
    v = str(v).strip()
    if v == NA:
        return [NA]
    return ['Nível ' + p.strip() for p in v.split(',')]


def main(xlsx):
    opts = opcoes_dos_filtros()
    descricoes = json.loads(DESCRICOES.read_text(encoding='utf-8')) if DESCRICOES.exists() else {}
    links = json.loads(LINKS.read_text(encoding='utf-8')) if LINKS.exists() else {}
    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    rows = list(wb['Base Final'].iter_rows(values_only=True))
    h = rows[0]
    col = lambda r, name: r[h.index(name)]

    sols, erros = [], []
    for r in rows[1:]:
        if not any(r):
            continue
        sid = int(col(r, 'ID'))
        initial = {
            'segmento': [p.strip() for p in str(col(r, 'Segmentos')).split(',')],
            'jornada': [str(col(r, 'Jornada')).strip()],
            'area': [str(col(r, 'Área Principal')).strip()],
            'maturidade': maturidade(col(r, 'Maturidade Empresarial')),
            'momento': [str(col(r, 'Momento Empresarial')).strip()],
        }
        for k, vals in initial.items():
            erros += [(sid, k, v) for v in vals if v not in opts[k]]
        sols.append({
            'id': f'sol-{sid:02d}', 'num': f'{sid:02d}',
            'nome': str(col(r, 'Solução')).strip(),
            'desc': (col(r, 'Descrição') or 'Sem descrição cadastrada.').strip(),
            'preco': preco(col(r, 'Preço máximo (R$)')),
            'origem': 'Sebraetec' if col(r, 'Código Sebraetec') else 'Sebrae',  # tag no card
            'initial': initial,
        })

    for s in sols:
        if s['id'] in descricoes:
            s['desc'] = descricoes[s['id']]['desc']
            for campo in ('como', 'recebe'):  # etapas e entregas da ficha, mostradas no card
                if descricoes[s['id']].get(campo):
                    s[campo] = descricoes[s['id']][campo]
    for s in sols:
        if links.get(s['id']):
            s['link'] = links[s['id']]  # botão "Acessar solução"
    desconhecidos = set(descricoes) - {s['id'] for s in sols}
    if desconhecidos:
        sys.exit('descricoes_sebraetec.json tem ids que não estão na planilha: ' + ', '.join(sorted(desconhecidos)))

    if erros:
        sys.exit('Valores que não existem em filtros.js: ' + repr(erros))
    if len({s['id'] for s in sols}) != len(sols):
        sys.exit('IDs repetidos na planilha.')

    linhas = ',\n'.join('  ' + json.dumps(s, ensure_ascii=False) for s in sols)
    DATA.write_text(CABECALHO + 'var SOLUCOES=[\n' + linhas + '\n];\n', encoding='utf-8', newline='\n')
    print(f'{len(sols)} soluções gravadas em {DATA.relative_to(RAIZ)}')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
