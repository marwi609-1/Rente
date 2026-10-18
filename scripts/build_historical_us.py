"""Erzeugt src/data/historical-us.json aus Robert Shillers öffentlichen Daten.

Aufruf (Quelldateien zuvor herunterladen, siehe docs/DATA_SOURCES.md):

    python -I scripts/build_historical_us.py IE_DATA.xls CHAPT26.xlsx TB6MS.csv OUT.json

Benötigt die Python-Pakete xlrd (für .xls) und openpyxl (für .xlsx).

Konvention: Das Kalenderjahr Y reicht von Januar Y bis Januar Y+1 (Shiller verwendet
Monatsdurchschnitte). Alle Renditen sind nominal und einfach (0.05 = 5 %).
"""

import csv
import hashlib
import json
import sys
from datetime import date

import openpyxl
import xlrd

# Spalten im Blatt "Data" von ie_data.xls (0-basiert), Kopfzeile in Zeile 8.
COL_DATE, COL_P, COL_D, COL_CPI = 0, 1, 2, 4
COL_REAL_TR_PRICE, COL_BOND_MONTHLY, COL_REAL_BOND = 9, 17, 18
FIRST_DATA_ROW = 8

# Ab diesem Jahr fehlt Shillers Reihe R (chapt26.xlsx); fortgeschrieben wird mit TB6MS.
CASH_SPLICE_YEAR = 2012


def sha256(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def read_monthly(path):
    """Monatszeilen als dict (Jahr, Monat) -> Werte."""
    sheet = xlrd.open_workbook(path).sheet_by_name('Data')
    months = {}
    for r in range(FIRST_DATA_ROW, sheet.nrows):
        raw_date = sheet.cell_value(r, COL_DATE)
        if not isinstance(raw_date, float):
            continue
        # Datum als Jahr.Monat, z. B. 1871.01; Oktober steht als 1871.1
        year = int(raw_date)
        month = int(round((raw_date - year) * 100))

        def num(col):
            v = sheet.cell_value(r, col)
            return v if isinstance(v, float) else None

        months[(year, month)] = {
            'P': num(COL_P),
            'D': num(COL_D),
            'CPI': num(COL_CPI),
            'realTR': num(COL_REAL_TR_PRICE),
            'bond': num(COL_BOND_MONTHLY),
            'realBond': num(COL_REAL_BOND),
        }
    return months


def read_shiller_r(path):
    """Shillers Reihe R (One-Year Interest Rate, %) aus chapt26.xlsx."""
    rows = list(openpyxl.load_workbook(path, data_only=True)['Data'].iter_rows(values_only=True))
    out = {}
    for row in rows[8:]:
        year, r = row[0], row[4]
        if isinstance(year, (int, float)) and isinstance(r, (int, float)):
            out[int(year)] = float(r)
    return out


def read_fred(path, column):
    out = {}
    with open(path, newline='') as f:
        for row in csv.DictReader(f):
            value = row[column]
            if value not in ('', '.'):
                y, m = row['observation_date'][:7].split('-')
                out[(int(y), int(m))] = float(value)
    return out


def half_yearly(jan, jul):
    """Shillers Konstruktion von R: Januar- und Juli-Satz (6 Monate) zu einer Jahresrendite."""
    return (1 + jan / 200) * (1 + jul / 200) - 1


def main(ie_path, chapt26_path, tb6ms_path, out_path):
    months = read_monthly(ie_path)
    shiller_r = read_shiller_r(chapt26_path)
    tb6ms = read_fred(tb6ms_path, 'TB6MS')

    first_year = min(y for (y, _) in months)
    rows = []
    year = first_year
    while (year + 1, 1) in months and all(
        months.get((year, m), {}).get('bond') is not None for m in range(1, 13)
    ):
        start, end = months[(year, 1)], months[(year + 1, 1)]

        # Aktien: monatliche Wiederanlage der Dividende wie bei Shillers Total-Return-Preis.
        tr = 1.0
        for k in range(1, 13):
            prev = months[(year, k)]
            cur = months[(year + (k == 12), k % 12 + 1)]
            if prev['P'] is None or cur['P'] is None or cur['D'] is None:
                raise ValueError(f'Aktiendaten unvollständig im Jahr {year}')
            tr *= (cur['P'] + cur['D'] / 12) / prev['P']
        # Gegenprobe gegen Shillers realen Total-Return-Preis
        tr_check = (end['realTR'] / start['realTR']) * (end['CPI'] / start['CPI'])
        if abs(tr / tr_check - 1) > 1e-9:
            raise ValueError(f'Aktien-Gegenprobe fehlgeschlagen im Jahr {year}: {tr} vs {tr_check}')

        # Anleihen: Produkt der monatlichen Total-Return-Faktoren (Faktor in Monat m gilt bis m+1).
        bond = 1.0
        for m in range(1, 13):
            bond *= months[(year, m)]['bond']
        bond_check = (end['realBond'] / start['realBond']) * (end['CPI'] / start['CPI'])
        if abs(bond / bond_check - 1) > 1e-9:
            raise ValueError(f'Anleihen-Gegenprobe fehlgeschlagen im Jahr {year}')

        if year < CASH_SPLICE_YEAR:
            if year not in shiller_r:
                raise ValueError(f'Kurzfristiger Zins fehlt im Jahr {year}')
            cash = shiller_r[year] / 100
        else:
            cash = half_yearly(tb6ms[(year, 1)], tb6ms[(year, 7)])

        rows.append({
            'year': year,
            'equity': round(tr - 1, 8),
            'bonds': round(bond - 1, 8),
            'cash': round(cash, 8),
            'inflation': round(end['CPI'] / start['CPI'] - 1, 8),
        })
        year += 1

    # Abstand zwischen Shillers R und der TB6MS-Konstruktion im Überlappungszeitraum
    overlap = [y for y in range(1998, CASH_SPLICE_YEAR) if y in shiller_r]
    spread = sum(shiller_r[y] / 100 - half_yearly(tb6ms[(y, 1)], tb6ms[(y, 7)]) for y in overlap)
    spread /= len(overlap)

    data = {
        'meta': {
            'description': (
                'Jährliche nominale Renditen USA: S&P Composite Total Return, 10-jährige '
                'US-Staatsanleihen (Total Return), kurzfristiger Zins und CPI-Inflation.'
            ),
            'convention': 'Jahr Y = Januar Y bis Januar Y+1 auf Basis von Monatsdurchschnitten',
            'generated': date.today().isoformat(),
            'firstYear': rows[0]['year'],
            'lastYear': rows[-1]['year'],
            'cashSplice': {
                'fromYear': CASH_SPLICE_YEAR,
                'meanSpreadShillerRMinusTB6MS1998to2011': round(spread, 6),
            },
            'sources': [
                {
                    'name': 'Robert J. Shiller, ie_data.xls (Aktien, Anleihen, CPI)',
                    'url': 'https://shillerdata.com/',
                    'sha256': sha256(ie_path),
                },
                {
                    'name': 'Robert J. Shiller, chapt26.xlsx, Reihe R (kurzfristiger Zins bis 2011)',
                    'url': 'http://www.econ.yale.edu/~shiller/data/chapt26.xlsx',
                    'sha256': sha256(chapt26_path),
                },
                {
                    'name': 'Board of Governors of the Federal Reserve System, TB6MS via FRED (ab 2012)',
                    'url': 'https://fred.stlouisfed.org/series/TB6MS',
                    'sha256': sha256(tb6ms_path),
                },
            ],
        },
        'rows': rows,
    }
    # Metadaten eingerückt, Jahreszeilen je eine Zeile
    meta = json.dumps(data['meta'], ensure_ascii=False, indent=2).replace('\n', '\n  ')
    lines = ',\n'.join('    ' + json.dumps(row, ensure_ascii=False) for row in rows)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('{\n  "meta": ' + meta + ',\n  "rows": [\n' + lines + '\n  ]\n}\n')
    print(f'{len(rows)} Jahre {rows[0]["year"]}–{rows[-1]["year"]}, Spread R−TB6MS {spread:.4%}')


if __name__ == '__main__':
    main(*sys.argv[1:5])
