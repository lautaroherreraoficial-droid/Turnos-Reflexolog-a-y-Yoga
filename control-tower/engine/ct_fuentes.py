# -*- coding: utf-8 -*-
"""Lectura y normalizacion de las fuentes de tracking.

El circuito 1060 se exporta hoy de dos maneras distintas que contienen los
MISMOS campos en las MISMAS posiciones, pero cambian siete nombres de columna,
el formato de fecha (dd/mm/aaaa vs aaaa-mm-dd) y el marcador de nulo. Este
modulo normaliza ambas al mismo esquema para que el resto del sistema no tenga
que saber de donde vino cada fila.

Cuando el circuito se publique como vista o tabla SQL (ver sql/00_staging.sql),
este modulo se reemplaza por una sola consulta y el resto del sistema no cambia.
"""
import csv, datetime, os

# Posiciones verificadas contra el encabezado de ambos exports (2026-06 a 2026-09).
COLS = dict(
    pedido=0, meli=1, suc=2, suc_nombre=3, f_alta=4, cod_art=5, descripcion=6,
    marca=7, cantidad=8, unidad=9, lt_total=10, lt_vtaverde=11, precio=12,
    surtido=13, linea=14, orden=15, nro_provlocal=16,
    f_planificacion=17, f_picking=18, f_control=19,
    ut=20, cod_art_ut=21, exp_mcr_cdr=22, deposito1=23, suc1=24,
    f_salida_mcr=25, f_llegada_bt=26, exp_bt=27, carta_porte=28,
    deposito2=29, suc2=30, f_salida_bt=31,
    f_llegada_cdr=32, f_inirec_cdr=33, f_finrec_cdr=34,
    exp_cdr_suc=35, deposito3=36, suc3=37, f_salida_cdr=38,
    f_rec_caja=39, f_rec_item=40, f_entregado=41, f_anulado=42,
    anul_por_reenvio=43, reenvio=44, cant_backorder=45,
    provision_local=46, andreani=47, bigger=48, tipo_envio=49,
    estado_andreani=50, oc_ventaverde=51, f_liberacion=52,
)
CAMPOS_FECHA = [k for k in COLS if k.startswith('f_')]
NULOS = {'', '\\', '\\ ', 'None', ' ', 'NULL', 'null'}


def limpiar(v):
    v = (v or '').strip()
    return '' if v in NULOS else v


def _fecha(s, formatos):
    s = limpiar(s)
    if not s:
        return None
    base = s[:19] if ' ' in s else s[:10]
    for f in formatos:
        try:
            return datetime.datetime.strptime(base, f)
        except ValueError:
            pass
    # Un hito sin segundos no puede perderse en silencio: una fecha que no
    # parsea se vuelve un hito faltante, y un hito faltante se vuelve una UT
    # "detenida" que en realidad avanzo. Se intenta tambien sin segundos.
    for f in formatos:
        corto = f.replace(':%S', '')
        if corto == f:
            continue
        try:
            return datetime.datetime.strptime(base[:16], corto)
        except ValueError:
            pass
    return None


ISO = ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d')
LAT = ('%d/%m/%Y %H:%M:%S', '%d/%m/%Y')


class Linea:
    """Una linea de pedido con sus hitos ya parseados."""
    __slots__ = ('v', 'f', 'origen')

    def __init__(self, campos, parser, origen):
        self.v = {}
        self.f = {}
        for k, i in COLS.items():
            bruto = campos[i] if i < len(campos) else ''
            if k in CAMPOS_FECHA:
                self.f[k] = _fecha(bruto, parser)
            else:
                self.v[k] = limpiar(bruto)

    def __getitem__(self, k):
        return self.f[k] if k in self.f else self.v.get(k, '')

    @property
    def circuito(self):
        """Por donde se abastece. Determina que nodos aplican a esta linea."""
        if self.v.get('provision_local') == 'S':
            return 'local'
        if self.v.get('andreani') == 'S':
            return 'andreani'
        if self.v.get('deposito1') != '940':
            return 'sin_origen'
        return 'cdr' if self.v.get('deposito3') else 'directo'

    @property
    def anulada(self):
        return self.f.get('f_anulado') is not None


def leer(path, formato_fecha='auto', delimitador='|'):
    """Lee un export de tracking. formato_fecha: 'iso' | 'latino' | 'auto'."""
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    with open(path, encoding='latin-1', newline='') as fh:
        lineas = fh.read().replace('\r\n', '\n').split('\n')
    if not lineas:
        return []
    cuerpo = [l for l in lineas[1:] if l.strip()]
    if formato_fecha == 'auto':
        muestra = [l.split(delimitador) for l in cuerpo[:200]]
        latinos = sum(1 for c in muestra
                      if len(c) > 4 and '/' in c[COLS['f_alta']])
        parser = LAT if latinos > len(muestra) / 2 else ISO
    else:
        parser = LAT if formato_fecha == 'latino' else ISO
    origen = os.path.basename(path)
    return [Linea(l.split(delimitador), parser, origen) for l in cuerpo]


def leer_varios(paths):
    out = []
    for p in paths:
        out.extend(leer(p))
    return out
