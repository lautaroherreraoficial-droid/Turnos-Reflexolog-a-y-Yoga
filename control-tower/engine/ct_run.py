# -*- coding: utf-8 -*-
"""Punto de entrada. Una corrida = leer, evaluar, emitir.

Uso:
    python3 ct_run.py --fuente ruta1.csv --fuente ruta2.txt
    python3 ct_run.py --fuente ... --corte 2026-09-01 --sin-html
    python3 ct_run.py --fuente ... --solo R01,R05

Salidas (en --salida, por defecto ../out):
    alertas.json          las alertas de esta corrida, con evidencia
    resumen.json          conteos por severidad, nodo y regla
    estado.json           el registro persistente (historial, recurrencia)
    Bandeja_Alertas.html  la bandeja para abrir y repartir
"""
import argparse, datetime, json, os, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import ct_fuentes, ct_modelo, ct_motor, ct_bandeja


def main(argv=None):
    p = argparse.ArgumentParser(description='OI Control Tower - motor de alertas')
    p.add_argument('--fuente', action='append', required=True,
                   help='export del circuito 1060 (se puede repetir)')
    p.add_argument('--reglas', default=os.path.join(AQUI, 'reglas.yaml'))
    p.add_argument('--salida', default=os.path.join(AQUI, '..', 'out'))
    p.add_argument('--corte', default=None,
                   help='aaaa-mm-dd. Por defecto, el ultimo hito observado.')
    p.add_argument('--solo', default=None, help='lista de reglas: R01,R05')
    p.add_argument('--sin-html', action='store_true')
    p.add_argument('--sin-estado', action='store_true',
                   help='no leer ni escribir estado.json (corrida limpia)')
    a = p.parse_args(argv)

    cfg = ct_motor.cargar_config(a.reglas)
    if a.solo:
        permitidas = {x.strip().upper() for x in a.solo.split(',')}
        for r in cfg['reglas']:
            r['activa'] = r['activa'] and r['id'] in permitidas

    print('leyendo %d fuente(s)...' % len(a.fuente))
    lineas = ct_fuentes.leer_varios(a.fuente)
    print('  %d lineas' % len(lineas))

    corte = (datetime.datetime.strptime(a.corte, '%Y-%m-%d')
             if a.corte else None)
    m = ct_modelo.Modelo(lineas, corte=corte)
    print('  corte: %s | UT: %d | lineas sin UT: %d'
          % (m.corte.strftime('%Y-%m-%d %H:%M'), len(m.uts), len(m.sin_ut)))

    os.makedirs(a.salida, exist_ok=True)
    estado = None if a.sin_estado else os.path.join(a.salida, 'estado.json')
    mot = ct_motor.Motor(m, cfg, estado_path=estado)
    alertas = mot.correr()
    res = mot.resumen()
    mot.guardar_estado()

    with open(os.path.join(a.salida, 'alertas.json'), 'w', encoding='utf-8') as fh:
        json.dump(alertas, fh, ensure_ascii=False, indent=1, default=str)
    with open(os.path.join(a.salida, 'resumen.json'), 'w', encoding='utf-8') as fh:
        json.dump(res, fh, ensure_ascii=False, indent=1)

    print('\n--- corrida %s ---' % res['corte'])
    print('alertas: %d (a notificar: %d, nuevas: %d)'
          % (res['alertas'], res['a_notificar'], res['nuevas']))
    print('por severidad:', res['por_severidad'])
    print('por nodo:', res['por_nodo'])
    print('por regla:', res['por_regla'])

    if not a.sin_html:
        html = ct_bandeja.render(alertas, res, m, cfg)
        ruta = os.path.join(a.salida, 'Bandeja_Alertas.html')
        with open(ruta, 'w', encoding='utf-8') as fh:
            fh.write(html)
        print('bandeja: %s (%.0f KB)' % (ruta, os.path.getsize(ruta) / 1024))
    return 0


if __name__ == '__main__':
    sys.exit(main())
