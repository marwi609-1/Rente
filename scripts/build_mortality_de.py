"""Erzeugt src/data/mortality-de.json aus den Kohortensterbetafeln des Statistischen Bundesamts.

Aufruf (Quelldatei zuvor herunterladen, siehe docs/DATA_SOURCES.md):

    python -I scripts/build_mortality_de.py KOHORTENSTERBETAFELN.xlsx OUT.json

Benötigt das Python-Paket openpyxl. Übernommen werden die einjährigen Sterbewahrscheinlichkeiten q_x
der Variante 3 (hohe Lebenserwartung) für Männer und Frauen der Geburtsjahrgänge 1926 bis 2008
im Alter von 18 bis 99 Jahren; für 100 Jahre und mehr gilt q = 1.
"""

import hashlib
import json
import sys
from datetime import date

import openpyxl

SHEETS = {'m': 'csv-12621-b05', 'w': 'csv-12621-b06'}
VARIANT = 'V3 (hoch)'
FIRST_COHORT, LAST_COHORT = 1926, 2008
FIRST_AGE, LAST_AGE = 18, 99


def sha256(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def read_qx(workbook, sheet):
    rows = workbook[sheet].iter_rows(values_only=True)
    header = [str(c).strip() for c in next(rows)]
    col = {name: header.index(name) for name in ('Geburtsjahrgang', 'Variante', 'Alter', 'qx')}
    table = {}
    for row in rows:
        if row[col['Variante']] != VARIANT:
            raise ValueError(f'Unerwartete Variante {row[col["Variante"]]} in {sheet}')
        age = row[col['Alter']]
        if not isinstance(age, int):
            continue  # „100 und mehr“
        table[(int(row[col['Geburtsjahrgang']]), age)] = float(row[col['qx']])
    return table


def main(xlsx_path, out_path):
    workbook = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    series = {}
    for sex, sheet in SHEETS.items():
        table = read_qx(workbook, sheet)
        series[sex] = []
        for cohort in range(FIRST_COHORT, LAST_COHORT + 1):
            qx = [table[(cohort, age)] for age in range(FIRST_AGE, LAST_AGE + 1)]
            if any(not 0 < q < 1 for q in qx):
                raise ValueError(f'q_x außerhalb von (0, 1) für Jahrgang {cohort}')
            series[sex].append([float(f'{q:.6g}') for q in qx])

    meta = {
        'description': (
            'Einjährige Sterbewahrscheinlichkeiten q_x (Alter x bis x+1) der Kohortensterbetafeln '
            'für Deutschland, Variante 3 (hohe Lebenserwartung).'
        ),
        'source': 'Statistisches Bundesamt (Destatis), Statistischer Bericht Kohortensterbetafeln '
        'für Deutschland 1926–2026, Artikelnummer 5126101269005, erschienen 16.09.2026',
        'url': 'https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/'
        'Sterbefaelle-Lebenserwartung/kohortensterbetafeln.html',
        'license': '© Statistisches Bundesamt (Destatis), 2026. Vervielfältigung und Verbreitung, '
        'auch auszugsweise, mit Quellenangabe gestattet.',
        'variant': VARIANT,
        'sheets': SHEETS,
        'sha256': sha256(xlsx_path),
        'generated': date.today().isoformat(),
    }
    lines = []
    for sex in ('m', 'w'):
        rows = ',\n'.join('      ' + json.dumps(q) for q in series[sex])
        lines.append(f'    "{sex}": [\n{rows}\n    ]')
    body = (
        '{\n  "meta": ' + json.dumps(meta, ensure_ascii=False, indent=2).replace('\n', '\n  ')
        + f',\n  "firstCohort": {FIRST_COHORT},\n  "lastCohort": {LAST_COHORT},'
        + f'\n  "firstAge": {FIRST_AGE},\n  "lastAge": {LAST_AGE},\n  "qx": {{\n'
        + ',\n'.join(lines) + '\n  }\n}\n'
    )
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(body)
    print(f'{len(series["m"])} Jahrgänge je Geschlecht, Alter {FIRST_AGE}–{LAST_AGE}')


if __name__ == '__main__':
    main(*sys.argv[1:3])
