# -*- coding: utf-8 -*-
"""Modelo operativo: convierte lineas en UT, envios y colas (pulmon).

Tres granularidades, cada una con su razon de ser:

  LINEA   un articulo de un pedido. Es el grano del export.
  ENVIO   (nro de pedido + fecha de alta). Un mismo pedido genera varios envios
          cuando hubo reenvio: el original se anula y nace una linea nueva con
          otro recorrido. Medir por pedido mezcla hitos de envios distintos.
  UT      unidad de transporte. Agrupa lineas que viajan fisicamente juntas
          hacia UNA sucursal (verificado: ninguna UT mezcla sucursales).
          Es la unidad que el operador puede buscar, reclamar y destrabar.

El pulmon de cada etapa se mide como WIP: una linea esta "en" la etapa entre el
hito que la abre y el hito que la cierra. Si el hito de cierre no existe al
momento de observacion, la linea sigue en cola y acumula antiguedad.
"""
import collections, datetime

# Etapa: (hito que abre, hito que cierra, nombre, nodo responsable)
ETAPAS = {
    'cdr': [
        ('f_planificacion', 'f_picking', 'Pulmon de picking MCR', 'MCR'),
        ('f_picking', 'f_control', 'Control MCR', 'MCR'),
        ('f_control', 'f_salida_mcr', 'Cola de despacho MCR', 'MCR'),
        ('f_salida_mcr', 'f_llegada_cdr', 'Transito MCR a CDR', 'Transporte'),
        ('f_llegada_cdr', 'f_salida_cdr', 'Dentro del CDR', 'CDR'),
        ('f_salida_cdr', 'f_rec_item', 'Transito CDR a sucursal', 'Transporte'),
    ],
    'directo': [
        ('f_planificacion', 'f_picking', 'Pulmon de picking MCR', 'MCR'),
        ('f_picking', 'f_control', 'Control MCR', 'MCR'),
        ('f_control', 'f_salida_mcr', 'Cola de despacho MCR', 'MCR'),
        ('f_salida_mcr', 'f_rec_item', 'Transito MCR a sucursal', 'Transporte'),
    ],
    'local': [
        ('f_planificacion', 'f_picking', 'Pulmon de picking CDR', 'CDR'),
        ('f_picking', 'f_control', 'Control CDR', 'CDR'),
        ('f_control', 'f_salida_cdr', 'Cola de despacho CDR', 'CDR'),
        ('f_salida_cdr', 'f_rec_item', 'Transito CDR a sucursal', 'Transporte'),
    ],
    'andreani': [
        ('f_planificacion', 'f_picking', 'Pulmon de picking MCR', 'MCR'),
        ('f_control', 'f_salida_mcr', 'Cola de despacho MCR', 'MCR'),
        ('f_salida_mcr', 'f_rec_item', 'En Andreani', 'Andreani'),
    ],
    'sin_origen': [
        ('f_alta', 'f_planificacion', 'Sin planificar', 'Abastecimiento'),
        ('f_planificacion', 'f_rec_item', 'Sin circuito asignado', 'Abastecimiento'),
    ],
}

# Cadena canonica para detectar en que hito se detuvo una UT.
CADENA = ['f_planificacion', 'f_picking', 'f_control', 'f_salida_mcr',
          'f_llegada_cdr', 'f_inirec_cdr', 'f_salida_cdr', 'f_rec_caja',
          'f_rec_item', 'f_entregado']
HITO_NOMBRE = {
    'f_planificacion': 'planificada', 'f_picking': 'pickeada',
    'f_control': 'controlada', 'f_salida_mcr': 'despachada de MCR',
    'f_llegada_cdr': 'llegada al CDR', 'f_inirec_cdr': 'en recepcion del CDR',
    'f_salida_cdr': 'despachada del CDR', 'f_rec_caja': 'recibida en sucursal (caja)',
    'f_rec_item': 'recibida en sucursal', 'f_entregado': 'entregada al cliente',
}
# El hito que cierra la responsabilidad logistica. f_entregado depende del cliente.
HITO_CIERRE = 'f_rec_item'


class UT:
    """Una unidad de transporte observada a una fecha de corte."""

    def __init__(self, nro, lineas, corte):
        self.nro = nro
        self.lineas = lineas
        self.corte = corte
        l0 = lineas[0]
        self.sucursal = l0['suc']
        self.sucursal_nombre = l0['suc_nombre']
        self.cdr = l0['deposito3']
        self.circuito = l0.circuito
        self.pedidos = sorted({l['pedido'] for l in lineas})
        self.anulada = all(l.anulada for l in lineas)
        self.hitos = {}
        for k in CADENA + ['f_alta']:
            xs = [l[k] for l in lineas if l[k]]
            if xs:
                self.hitos[k] = max(xs)
        self.alta = min([l['f_alta'] for l in lineas if l['f_alta']] or [None])
        self.ultimo_hito = None
        for k in CADENA:
            if k in self.hitos:
                self.ultimo_hito = k
        self.cerrada = HITO_CIERRE in self.hitos
        # Promesa: el lead time prometido mas exigente de la UT.
        lts = []
        for l in lineas:
            try:
                lts.append(int(float(l['lt_total'])))
            except (TypeError, ValueError):
                pass
        self.lt_prometido = min(lts) if lts else None

    @property
    def etapa_actual(self):
        """Nombre de la etapa en la que esta detenida, '' si ya cerro."""
        if self.cerrada or self.anulada:
            return ''
        if self.ultimo_hito is None:
            return 'Sin planificar'
        for abre, cierra, nombre, _ in ETAPAS[self.circuito]:
            if self.hitos.get(abre) and not self.hitos.get(cierra):
                return nombre
        return 'Despues de %s' % HITO_NOMBRE[self.ultimo_hito]

    @property
    def nodo_responsable(self):
        if self.cerrada or self.anulada:
            return ''
        for abre, cierra, nombre, nodo in ETAPAS[self.circuito]:
            if self.hitos.get(abre) and not self.hitos.get(cierra):
                return nodo
        return 'Abastecimiento'

    @property
    def dias_detenida(self):
        """Dias desde el ultimo hito registrado hasta el corte."""
        if self.cerrada or self.anulada:
            return 0
        ref = self.hitos.get(self.ultimo_hito) or self.alta
        if not ref:
            return 0
        return max(0, (self.corte - ref).days)

    @property
    def dias_desde_alta(self):
        if not self.alta:
            return 0
        return max(0, (self.corte - self.alta).days)

    @property
    def atraso_vs_promesa(self):
        """Dias por encima del plazo prometido. None si no hay promesa."""
        if self.lt_prometido is None or not self.alta:
            return None
        fin = self.hitos.get(HITO_CIERRE) or self.corte
        return (fin.date() - self.alta.date()).days - self.lt_prometido

    def evidencia(self):
        return {
            'ut': self.nro,
            'circuito': self.circuito,
            'sucursal': '%s %s' % (self.sucursal, self.sucursal_nombre),
            'cdr': self.cdr or '-',
            'pedidos': self.pedidos[:12],
            'lineas': len(self.lineas),
            'alta': self.alta.strftime('%Y-%m-%d %H:%M') if self.alta else None,
            'ultimo_hito': HITO_NOMBRE.get(self.ultimo_hito, 'ninguno'),
            'ultimo_hito_fecha': (self.hitos[self.ultimo_hito].strftime('%Y-%m-%d %H:%M')
                                  if self.ultimo_hito else None),
            'dias_detenida': self.dias_detenida,
            'dias_desde_alta': self.dias_desde_alta,
            'lt_prometido': self.lt_prometido,
            'atraso_vs_promesa': self.atraso_vs_promesa,
        }


class Modelo:
    def __init__(self, lineas, corte=None):
        self.lineas = lineas
        fechas = [l['f_alta'] for l in lineas if l['f_alta']]
        obs = []
        for l in lineas:
            obs.extend(v for v in l.f.values() if v)
        self.corte = corte or (max(obs) if obs else datetime.datetime.now())
        self.desde = min(fechas) if fechas else None
        g = collections.defaultdict(list)
        self.sin_ut = []
        for l in lineas:
            u = l['ut']
            if u:
                g[u].append(l)
            else:
                self.sin_ut.append(l)
        self.uts = [UT(u, v, self.corte) for u, v in g.items()]
        self.por_nro = {u.nro: u for u in self.uts}

    # ---- envios (pedido + fecha de alta) -------------------------------
    def envios(self):
        g = collections.defaultdict(list)
        for l in self.lineas:
            if l['pedido'] and l['f_alta']:
                g[(l['pedido'], l['f_alta'].date())].append(l)
        return g

    # ---- pulmon: WIP diario por etapa ---------------------------------
    def wip_diario(self, desde=None, hasta=None):
        d0 = (desde or self.desde).date() if hasattr(desde or self.desde, 'date') else desde
        d1 = (hasta or self.corte).date() if hasattr(hasta or self.corte, 'date') else hasta
        wip = collections.defaultdict(collections.Counter)
        for l in self.lineas:
            if l.anulada:
                continue
            for abre, cierra, nombre, _ in ETAPAS[l.circuito]:
                x = l[abre]
                if not x:
                    continue
                y = l[cierra]
                ini = x.date()
                fin = y.date() if y else d1
                if fin < d0 or ini > d1:
                    continue
                cur, end = max(ini, d0), min(fin, d1)
                while cur < end:
                    wip[nombre][cur] += 1
                    cur += datetime.timedelta(days=1)
        return wip

    def wip_envejecido(self, umbral_dias):
        """Lineas que llevan mas de `umbral_dias` en su etapa, agrupadas."""
        out = collections.defaultdict(list)
        for l in self.lineas:
            if l.anulada:
                continue
            for abre, cierra, nombre, nodo in ETAPAS[l.circuito]:
                x, y = l[abre], l[cierra]
                if x and not y and (self.corte - x).days > umbral_dias:
                    out[nombre].append(l)
        return out
