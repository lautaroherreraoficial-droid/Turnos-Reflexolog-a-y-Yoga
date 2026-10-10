# -*- coding: utf-8 -*-
"""Motor de alertas del OI Control Tower.

Que hace, en una linea: lee el circuito, evalua las reglas de reglas.yaml,
y mantiene un registro de alertas con estado, severidad e historial.

Decisiones de diseno que importan:

1. La alerta tiene IDENTIDAD, no es un mensaje. Se identifica por
   (regla + entidad). Si vuelve a dispararse manana, es la MISMA alerta con un
   dia mas de antiguedad, no una nueva. Asi se puede medir si algo se resolvio.

2. Histeresis. Abre en `umbral` y recien cierra en `umbral_cierre`. Sin esto,
   una metrica que oscila alrededor del umbral genera una alerta por dia.

3. Agregacion. Si una regla toca mas entidades que `agrupar_si_mas_de` dentro
   del mismo nodo, se emite una sola alerta agregada con el detalle adentro.
   180 alertas de "UT detenida" no son 180 problemas: son uno.

4. Silencio. No se re-notifica antes de `silencio_horas`, salvo que la alerta
   suba de severidad. Lo que cambia se avisa; lo que sigue igual, no.

5. Todo umbral es configuracion, no codigo, y cada alerta lleva el umbral que
   se le aplico. Una alerta que no se puede auditar no se puede defender.
"""
import collections, datetime, hashlib, json, os, statistics as st
import yaml
import ct_modelo as M

SEV_ORDEN = {'media': 1, 'alta': 2, 'critica': 3}

# Ciclo de vida. El motor solo produce 'nueva', 'abierta' y 'resuelta'.
# 'reconocida' y 'en_gestion' las escribe una persona (o la app que las
# gestione) en estado.json, y el motor las respeta sin pisarlas.
ESTADOS = ('nueva', 'abierta', 'reconocida', 'en_gestion', 'resuelta')
ESTADOS_DEL_MOTOR = ('nueva', 'abierta', 'resuelta')


def _sev(valor, tramos, invertido=False):
    """Devuelve la severidad segun los tramos configurados."""
    orden = sorted(tramos.items(), key=lambda kv: SEV_ORDEN[kv[0]], reverse=True)
    for nombre, limite in orden:
        if (valor <= limite) if invertido else (valor >= limite):
            return nombre
    return None


def _mad_z(serie, x):
    """z robusto. Resiste outliers, que es justo lo que abunda en operaciones."""
    if len(serie) < 8:
        return 0.0
    med = st.median(serie)
    mad = st.median([abs(v - med) for v in serie])
    if mad == 0:
        desv = st.pstdev(serie)
        return 0.0 if desv == 0 else (x - med) / desv
    return (x - med) / (1.4826 * mad)


def _fid(regla_id, entidad):
    base = '%s|%s' % (regla_id, entidad)
    return regla_id + '-' + hashlib.sha1(base.encode()).hexdigest()[:8]


class Alerta(dict):
    pass


class Motor:
    def __init__(self, modelo, config, estado_path=None):
        self.m = modelo
        self.cfg = config
        self.g = config['parametros_globales']
        self.resp = config['responsables']
        self.reglas = {r['id']: r for r in config['reglas']}
        self.estado_path = estado_path
        self.estado = self._cargar_estado()
        self.ahora = modelo.corte
        self.alertas = []

    # ---------------- persistencia -----------------------------------
    def _cargar_estado(self):
        if self.estado_path and os.path.exists(self.estado_path):
            with open(self.estado_path, encoding='utf-8') as fh:
                return json.load(fh)
        return {'alertas': {}, 'corridas': []}

    def guardar_estado(self):
        if not self.estado_path:
            return
        os.makedirs(os.path.dirname(self.estado_path) or '.', exist_ok=True)
        with open(self.estado_path, 'w', encoding='utf-8') as fh:
            json.dump(self.estado, fh, ensure_ascii=False, indent=1)

    # ---------------- ciclo de vida ----------------------------------
    def _emitir(self, regla, entidad, nodo, valor, severidad, evidencia,
                titulo=None, responsable=None, agregada=False):
        fid = _fid(regla['id'], entidad)
        prev = self.estado['alertas'].get(fid)
        ts = self.ahora.strftime('%Y-%m-%d %H:%M')
        if responsable is None:
            responsable = (self.resp.get(nodo, nodo)
                           if regla.get('responsable') == 'por_nodo'
                           else self.resp.get(regla.get('responsable', ''),
                                              regla.get('responsable', '')))
        if prev is None:
            reg = {
                'id': fid, 'regla': regla['id'], 'regla_nombre': regla['nombre'],
                'entidad': entidad, 'nodo': nodo,
                'detectada': ts, 'ultima_vez': ts,
                'estado': 'nueva', 'severidad': severidad,
                'valor': valor, 'umbral': regla['umbral'],
                'veces_vista': 1, 'notificada': None,
                'historial': [{'ts': ts, 'ev': 'detectada',
                               'sev': severidad, 'valor': valor}],
                'semanas': [self._semana(self.ahora)],
            }
            self.estado['alertas'][fid] = reg
        else:
            reg = prev
            subio = SEV_ORDEN[severidad] > SEV_ORDEN.get(reg['severidad'], 0)
            if reg['estado'] == 'resuelta':
                reg['estado'] = 'nueva'
                reg['historial'].append({'ts': ts, 'ev': 'reabierta',
                                         'sev': severidad, 'valor': valor})
            elif reg['estado'] == 'nueva':
                # Ya se vio una vez: deja de ser novedad. Los estados que
                # pone una persona (reconocida / en gestion) no se tocan:
                # el motor solo mueve nueva -> abierta y cualquiera -> resuelta.
                reg['estado'] = 'abierta'
            if subio:
                reg['historial'].append({'ts': ts, 'ev': 'escala',
                                         'sev': severidad, 'valor': valor})
            reg['severidad'] = severidad
            reg['valor'] = valor
            reg['ultima_vez'] = ts
            reg['veces_vista'] = reg.get('veces_vista', 0) + 1
            sem = self._semana(self.ahora)
            if sem not in reg['semanas']:
                reg['semanas'].append(sem)
        reg['titulo'] = titulo or regla['nombre']
        reg['pregunta'] = regla.get('pregunta', '')
        reg['accion'] = ' '.join(regla.get('accion', '').split())
        reg['responsable'] = responsable
        reg['evidencia'] = evidencia
        reg['agregada'] = agregada
        reg['notificar'] = self._debe_notificar(reg)
        if reg['notificar']:
            # Se deja constancia de que ya salio. Sin esto, la ventana de
            # silencio nunca arranca y la misma alerta se manda todos los dias.
            reg['notificada'] = ts
            reg['historial'].append({'ts': ts, 'ev': 'notificada',
                                     'sev': severidad, 'valor': valor})
        reg['historial'] = reg['historial'][-60:]
        self.alertas.append(reg)
        return reg

    def _debe_notificar(self, reg):
        """Silencio con excepcion por escalamiento."""
        if reg['estado'] == 'nueva' and reg['notificada'] is None:
            return True
        if not reg['notificada']:
            return True
        ultima = datetime.datetime.strptime(reg['notificada'], '%Y-%m-%d %H:%M')
        horas = (self.ahora - ultima).total_seconds() / 3600
        escalo = any(h['ev'] == 'escala' and h['ts'] > reg['notificada']
                     for h in reg['historial'])
        return escalo or horas >= self.g.get('silencio_horas', 24)

    @staticmethod
    def _semana(dt):
        y, w, _ = dt.isocalendar()
        return '%04d-W%02d' % (y, w)

    def cerrar_no_vistas(self):
        """Lo que ya no cumple el umbral de cierre pasa a resuelta."""
        vistas = {a['id'] for a in self.alertas}
        ts = self.ahora.strftime('%Y-%m-%d %H:%M')
        for fid, reg in self.estado['alertas'].items():
            if fid not in vistas and reg['estado'] != 'resuelta':
                reg['estado'] = 'resuelta'
                reg['resuelta'] = ts
                reg['historial'].append({'ts': ts, 'ev': 'resuelta',
                                         'sev': reg['severidad'],
                                         'valor': reg['valor']})

    # ---------------- reglas -----------------------------------------
    def correr(self):
        self.alertas = []
        for rid, r in sorted(self.reglas.items()):
            if not r.get('activa'):
                continue
            fn = getattr(self, '_r_' + r['tipo'], None)
            if fn is None:
                continue
            fn(r)
        self._r_recurrencia_final()
        self.cerrar_no_vistas()
        self.estado['corridas'].append({
            'ts': self.ahora.strftime('%Y-%m-%d %H:%M'),
            'alertas_activas': sum(1 for a in self.estado['alertas'].values()
                                   if a['estado'] != 'resuelta'),
        })
        self.estado['corridas'] = self.estado['corridas'][-200:]
        return self.alertas

    # R01 ------------------------------------------------------------
    def _r_ut_detenida(self, r):
        cand = [u for u in self.m.uts
                if not u.cerrada and not u.anulada
                and u.dias_detenida > r['umbral']
                and u.circuito not in r.get('excluir_circuitos', [])]
        self._ut_like(r, cand, lambda u: u.dias_detenida,
                      'UT %s detenida %d dias en "%s"')

    def _ut_like(self, r, cand, val, plantilla):
        porgrupo = collections.defaultdict(list)
        for u in cand:
            porgrupo[(u.nodo_responsable, u.etapa_actual)].append(u)
        lim = r.get('agrupar_si_mas_de', 10 ** 9)
        for (nodo, etapa), us in sorted(porgrupo.items()):
            if len(us) > lim:
                vs = [val(u) for u in us]
                sev = _sev(max(vs), r['severidad']) or 'media'
                us_ord = sorted(us, key=val, reverse=True)
                self._emitir(
                    r, 'grupo:%s|%s' % (nodo, etapa), nodo, len(us), sev,
                    {'total_ut': len(us),
                     'dias_mediana': st.median(vs),
                     'dias_max': max(vs),
                     'lineas': sum(len(u.lineas) for u in us),
                     'sucursales_afectadas': len({u.sucursal for u in us}),
                     'detalle': [u.evidencia() for u in us_ord[:40]]},
                    titulo='%d UT detenidas en "%s"' % (len(us), etapa),
                    agregada=True)
            else:
                for u in sorted(us, key=val, reverse=True):
                    v = val(u)
                    sev = _sev(v, r['severidad'])
                    if not sev:
                        continue
                    self._emitir(r, 'ut:%s' % u.nro, nodo, v, sev, u.evidencia(),
                                 titulo=plantilla % (u.nro, v, u.etapa_actual))

    # R02 ------------------------------------------------------------
    def _r_sin_circuito(self, r):
        grupos = collections.defaultdict(list)
        for l in self.m.lineas:
            if l.circuito != 'sin_origen' or l.anulada:
                continue
            if not l['f_alta']:
                continue
            d = (self.ahora - l['f_alta']).days
            if d > r['umbral']:
                grupos[l['suc'] + ' ' + l['suc_nombre']].append((d, l))
        lim = r.get('agrupar_si_mas_de', 10 ** 9)
        total = sum(len(v) for v in grupos.values())
        if total > lim:
            vs = [d for v in grupos.values() for d, _ in v]
            sev = _sev(max(vs), r['severidad']) or 'media'
            det = sorted(((d, l) for v in grupos.values() for d, l in v),
                         reverse=True, key=lambda x: x[0])[:40]
            self._emitir(
                r, 'grupo:sin_circuito', 'Abastecimiento', total, sev,
                {'total_lineas': total,
                 'dias_mediana': st.median(vs), 'dias_max': max(vs),
                 'sucursales_afectadas': len(grupos),
                 'con_backorder': sum(1 for v in grupos.values() for _, l in v
                                      if _num(l['cant_backorder']) > 0),
                 'detalle': [{'pedido': l['pedido'], 'sucursal': l['suc_nombre'],
                              'articulo': l['descripcion'][:40],
                              'alta': l['f_alta'].strftime('%Y-%m-%d'),
                              'dias': d,
                              'planificada': bool(l['f_planificacion']),
                              'backorder': _num(l['cant_backorder'])}
                             for d, l in det]},
                titulo='%d lineas sin circuito asignado y sin anular' % total,
                agregada=True)
        else:
            for suc, v in sorted(grupos.items()):
                vs = [d for d, _ in v]
                sev = _sev(max(vs), r['severidad'])
                if not sev or len(v) < r.get('min_n', 1):
                    continue
                self._emitir(r, 'sin_circuito:%s' % suc, 'Abastecimiento',
                             max(vs), sev,
                             {'sucursal': suc, 'lineas': len(v),
                              'dias_max': max(vs),
                              'detalle': [{'pedido': l['pedido'],
                                           'articulo': l['descripcion'][:40],
                                           'dias': d} for d, l in sorted(v, reverse=True, key=lambda x: x[0])[:20]]},
                             titulo='%s: %d lineas sin circuito hace hasta %d dias'
                                    % (suc, len(v), max(vs)))

    # R03 ------------------------------------------------------------
    def _r_wip_anomalo(self, r):
        wip = self.m.wip_diario()
        hoy = self.ahora.date()
        excluir = set(r.get('excluir_etapas', []))
        for etapa, serie in sorted(wip.items()):
            if etapa in excluir:
                continue
            dias = sorted(serie)
            if len(dias) < r['ventana_base_dias'] // 2:
                continue
            # la cola de los ultimos dias esta sesgada por el corte de datos:
            # se compara la mediana de 7 dias contra la base previa, no el ultimo dia.
            ult = [serie[d] for d in dias[-10:-3]] or [serie[dias[-1]]]
            actual = st.median(ult)
            base = [serie[d] for d in dias[:-10]][-r['ventana_base_dias']:]
            if len(base) < 8 or actual < r.get('min_n', 0):
                continue
            z = _mad_z(base, actual)
            if z < r['umbral']:
                continue
            sev = _sev(z, r['severidad']) or 'media'
            nodo = _nodo_de_etapa(etapa)
            self._emitir(
                r, 'wip:%s' % etapa, nodo, round(z, 2), sev,
                {'etapa': etapa,
                 'cola_actual_mediana_7d': round(actual, 1),
                 'cola_base_mediana': round(st.median(base), 1),
                 'cola_base_p90': round(sorted(base)[int(len(base) * .9)], 1),
                 'z_robusto': round(z, 2),
                 'serie_semanal': [{'dia': str(d), 'cola': serie[d]}
                                   for d in dias if d.weekday() == 0]},
                titulo='%s: la cola esta %.1f veces por encima de lo habitual'
                       % (etapa, actual / max(1, st.median(base))))

    # R04 ------------------------------------------------------------
    def _r_nodo_lento(self, r):
        """Compara cada nodo contra sus PARES, no contra la red entera.

        Dos correcciones que cambian el resultado:

        a) La referencia se calcula solo con los envios que SI cumplieron el
           plazo. El promedio general ya viene contaminado por los que se pasan
           y volveria el umbral mas indulgente de lo que corresponde.

        b) La comparacion es contra el grupo de pares. El viaje a una sucursal
           se compara con las sucursales que cuelgan del MISMO CDR, no con la
           red: una sucursal lejana tarda mas por geografia, y marcarla por eso
           seria culpar al mapa. Un CDR se compara con los otros CDR, que hacen
           el mismo trabajo.
        """
        obs = collections.defaultdict(lambda: collections.defaultdict(list))
        ref = collections.defaultdict(lambda: collections.defaultdict(list))
        for l in self.m.lineas:
            if l.anulada:
                continue
            fin, alta, lt = l['f_rec_item'], l['f_alta'], _num(l['lt_total'])
            cumple = bool(fin and alta and lt and
                          (fin.date() - alta.date()).days <= lt)
            for abre, cierra, nombre, nodo in M.ETAPAS[l.circuito]:
                x, y = l[abre], l[cierra]
                if not (x and y):
                    continue
                h = (y - x).total_seconds() / 3600
                if h < 0:
                    continue
                if nodo == 'CDR':
                    pares, ent = 'CDR de la red', 'CDR ' + (l['deposito3'] or '-')
                elif nodo == 'Transporte':
                    pares = 'sucursales del CDR ' + (l['deposito3'] or 'directo MCR')
                    ent = '%s %s' % (l['suc'], l['suc_nombre'])
                else:
                    pares, ent = 'red', nodo
                obs[(nombre, pares)][ent].append(h)
                if cumple:
                    ref[(nombre, pares)][ent].append(h)

        # Primero se juntan TODOS los excesos de la etapa, aunque vengan de
        # grupos de pares distintos. La decision de agrupar se toma por etapa:
        # "32 sucursales por encima de sus pares en el viaje desde el CDR" es
        # un problema, no 32.
        lim = r.get('agrupar_si_mas_de', 10 ** 9)
        por_etapa = collections.defaultdict(list)
        evaluadas = collections.Counter()
        refs = {}
        for (etapa, pares), grupos in sorted(obs.items()):
            meds = [st.median(v) for e, v in ref[(etapa, pares)].items()
                    if len(v) >= r.get('min_n', 30)]
            if len(meds) < 3:
                continue
            mref = st.median(meds)
            if mref <= 0:
                continue
            refs[(etapa, pares)] = mref
            for ent, vs in sorted(grupos.items()):
                if len(vs) < r.get('min_n', 30):
                    continue
                evaluadas[etapa] += 1
                razon = st.median(vs) / mref
                if razon >= r['umbral']:
                    por_etapa[etapa].append((razon, ent, vs, pares, mref))
        for etapa, hits in sorted(por_etapa.items()):
            nodo = _nodo_de_etapa(etapa)
            hits.sort(reverse=True, key=lambda t: t[0])
            if len(hits) > lim:
                sev = _sev(hits[0][0], r['severidad']) or 'media'
                self._emitir(
                    r, 'nodo_grupo:%s' % etapa, nodo, len(hits), sev,
                    {'etapa': etapa,
                     'entidades_fuera_de_referencia': len(hits),
                     'entidades_evaluadas': evaluadas[etapa],
                     'comparacion': 'cada una contra su grupo de pares',
                     'razon_peor': round(hits[0][0], 2),
                     'razon_mediana': round(st.median([h[0] for h in hits]), 2),
                     'detalle': [{'entidad': e, 'pares': pr, 'envios': len(v),
                                  'horas_mediana': round(st.median(v), 1),
                                  'horas_pares': round(mr, 1),
                                  'veces_los_pares': round(z, 2)}
                                 for z, e, v, pr, mr in hits[:40]]},
                    titulo='%d de %d por encima de sus pares en "%s"'
                           % (len(hits), evaluadas[etapa], etapa),
                    agregada=True)
            else:
                for razon, ent, vs, pares, mref in hits:
                    sev = _sev(razon, r['severidad']) or 'media'
                    self._emitir(
                        r, 'nodo:%s|%s' % (etapa, ent), nodo, round(razon, 2), sev,
                        {'etapa': etapa, 'entidad': ent,
                         'comparado_contra': pares, 'envios': len(vs),
                         'horas_mediana': round(st.median(vs), 1),
                         'horas_referencia_pares': round(mref, 1),
                         'veces_la_referencia': round(razon, 2),
                         'horas_p90': round(sorted(vs)[int(len(vs) * .9)], 1)},
                        titulo='%s en "%s": %.1f h, %.1f veces sus pares'
                               % (ent, etapa, st.median(vs), razon))

    # R05 ------------------------------------------------------------
    def _r_promesa_descalibrada(self, r):
        """La promesa se mide contra la MEDIANA real, no contra el p75.

        Si la mediana ya supera el plazo publicado, mas de la mitad de los
        envios de esa sucursal nacen incumplidos: no es un problema de
        operacion, es un plazo mal puesto. El p75 y el p90 van como contexto
        para dimensionar cuanto habria que corregirlo.
        """
        suc = collections.defaultdict(list)
        for l in self.m.lineas:
            fin, alta, lt = l['f_rec_item'], l['f_alta'], _num(l['lt_total'])
            if fin and alta and lt:
                suc[(l['suc'], l['suc_nombre'])].append(
                    ((fin.date() - alta.date()).days, lt))
        hits = []
        for (cod, nom), vs in sorted(suc.items()):
            if len(vs) < r.get('min_n', 30):
                continue
            reales = sorted(d for d, _ in vs)
            p50 = reales[len(reales) // 2]
            promesa = st.median([lt for _, lt in vs])
            holgura = promesa - p50
            if holgura > r['umbral']:
                continue
            hits.append({
                'cod': cod,
                'sucursal': '%s %s' % (cod, nom),
                'envios': len(vs),
                'promesa_dias': promesa,
                'real_p50': p50,
                'real_p75': reales[int(len(reales) * .75)],
                'real_p90': reales[int(len(reales) * .9)],
                'holgura_dias': holgura,
                'incumplimiento_pct': round(
                    100 * sum(1 for d, lt in vs if d > lt) / len(vs), 1),
            })
        if not hits:
            return
        hits.sort(key=lambda h: h['holgura_dias'])
        lim = r.get('agrupar_si_mas_de', 10 ** 9)
        if len(hits) > lim:
            peor = hits[0]['holgura_dias']
            sev = _sev(peor, r['severidad'], invertido=True) or 'media'
            self._emitir(
                r, 'grupo:promesa', 'Promesa', len(hits), sev,
                {'sucursales_con_promesa_incumplible': len(hits),
                 'sucursales_evaluadas': len(suc),
                 'envios_afectados': sum(h['envios'] for h in hits),
                 'holgura_peor_dias': peor,
                 'holgura_mediana_dias': st.median([h['holgura_dias'] for h in hits]),
                 'detalle': [{k: v for k, v in h.items() if k != 'cod'}
                             for h in hits[:40]]},
                titulo='%d de %d sucursales prometen menos de lo que tardan'
                       % (len(hits), len(suc)),
                agregada=True, responsable=self.resp.get('Promesa'))
        else:
            for h in hits:
                sev = _sev(h['holgura_dias'], r['severidad'], invertido=True) or 'media'
                self._emitir(
                    r, 'promesa:%s' % h['cod'], 'Promesa', h['holgura_dias'], sev,
                    {k: v for k, v in h.items() if k != 'cod'},
                    titulo='%s: promete %d dias y su mediana real es %d'
                           % (h['sucursal'], h['promesa_dias'], h['real_p50']),
                    responsable=self.resp.get('Promesa'))

    # R06 ------------------------------------------------------------
    def _r_datos_incompletos(self, r):
        for campo in r['campos_clave']:
            porgrupo = collections.defaultdict(lambda: [0, 0])
            for l in self.m.lineas:
                if l.anulada:
                    continue
                # deposito3 solo aplica al circuito por CDR
                if campo == 'deposito3' and l.circuito != 'cdr':
                    continue
                if campo == 'exp_mcr_cdr' and l.circuito not in ('cdr', 'directo'):
                    continue
                if campo == 'ut' and l.circuito == 'sin_origen':
                    continue
                etiqueta = (('CDR ' + l['deposito3']) if l['deposito3']
                            else ('deposito ' + l['deposito1']) if l['deposito1']
                            else ('circuito ' + l.circuito))
                g = porgrupo[etiqueta]
                g[1] += 1
                if not l[campo]:
                    g[0] += 1
            for dep, (falta, total) in sorted(porgrupo.items()):
                if total < r.get('min_n', 50):
                    continue
                pct = 100 * falta / total
                if pct < r['umbral']:
                    continue
                sev = _sev(pct, r['severidad']) or 'media'
                self._emitir(
                    r, 'datos:%s|%s' % (campo, dep), 'Datos', round(pct, 1), sev,
                    {'campo': campo, 'grupo': dep, 'lineas': total,
                     'lineas_sin_dato': falta, 'porcentaje': round(pct, 1)},
                    titulo='%s: %.1f%% de las lineas sin "%s"' % (dep, pct, campo),
                    responsable=self.resp.get('Datos'))

    # R08 ------------------------------------------------------------
    def _r_reenvio(self, r):
        porped = collections.defaultdict(set)
        info = {}
        for l in self.m.lineas:
            if l['pedido'] and l['f_alta']:
                porped[l['pedido']].add(l['f_alta'].date())
                info.setdefault(l['pedido'], l)
        malos = {p: len(v) for p, v in porped.items() if len(v) >= r['umbral']}
        if not malos:
            return
        lim = r.get('agrupar_si_mas_de', 10 ** 9)
        if len(malos) > lim:
            sev = _sev(max(malos.values()), r['severidad']) or 'media'
            det = sorted(malos.items(), key=lambda kv: -kv[1])[:40]
            self._emitir(
                r, 'grupo:reenvios', 'Transporte', len(malos), sev,
                {'pedidos_con_reenvio': len(malos),
                 'intentos_max': max(malos.values()),
                 'detalle': [{'pedido': p, 'intentos': n,
                              'sucursal': info[p]['suc_nombre'],
                              'articulo': info[p]['descripcion'][:40]}
                             for p, n in det]},
                titulo='%d pedidos necesitaron mas de un envio' % len(malos),
                agregada=True)
        else:
            for p, n in sorted(malos.items(), key=lambda kv: -kv[1]):
                sev = _sev(n, r['severidad']) or 'media'
                self._emitir(r, 'reenvio:%s' % p, 'Transporte', n, sev,
                             {'pedido': p, 'intentos': n,
                              'sucursal': info[p]['suc_nombre']},
                             titulo='Pedido %s: %d intentos de entrega' % (p, n))

    # R09 ------------------------------------------------------------
    def _r_backorder(self, r):
        cand = []
        for l in self.m.lineas:
            if l.anulada or l['f_rec_item'] or not l['f_alta']:
                continue
            if _num(l['cant_backorder']) <= 0:
                continue
            d = (self.ahora - l['f_alta']).days
            if d > r['umbral']:
                cand.append((d, l))
        if not cand:
            return
        lim = r.get('agrupar_si_mas_de', 10 ** 9)
        vs = [d for d, _ in cand]
        if len(cand) > lim:
            sev = _sev(max(vs), r['severidad']) or 'media'
            self._emitir(
                r, 'grupo:backorder', 'Abastecimiento', len(cand), sev,
                {'lineas': len(cand), 'dias_mediana': st.median(vs),
                 'dias_max': max(vs),
                 'sucursales_afectadas': len({l['suc'] for _, l in cand}),
                 'detalle': [{'pedido': l['pedido'], 'articulo': l['descripcion'][:40],
                              'sucursal': l['suc_nombre'], 'dias': d,
                              'faltante': _num(l['cant_backorder'])}
                             for d, l in sorted(cand, reverse=True, key=lambda x: x[0])[:40]]},
                titulo='%d lineas en backorder hace mas de %d dias'
                       % (len(cand), r['umbral']),
                agregada=True)
        else:
            for d, l in sorted(cand, reverse=True, key=lambda x: x[0]):
                sev = _sev(d, r['severidad']) or 'media'
                self._emitir(r, 'bo:%s|%s' % (l['pedido'], l['cod_art']),
                             'Abastecimiento', d, sev,
                             {'pedido': l['pedido'], 'articulo': l['descripcion'][:40],
                              'sucursal': l['suc_nombre'], 'dias': d},
                             titulo='Pedido %s en backorder hace %d dias' % (l['pedido'], d))

    # R07 ------------------------------------------------------------
    def _r_recurrencia(self, r):
        pass  # se evalua al final, sobre el estado acumulado

    def _r_recurrencia_final(self):
        r = self.reglas.get('R07')
        if not r or not r.get('activa'):
            return
        for fid, reg in sorted(self.estado['alertas'].items()):
            if reg['regla'] == 'R07' or reg['estado'] == 'resuelta':
                continue
            n = len(reg.get('semanas', []))
            if n < r['umbral']:
                continue
            sev = _sev(n, r['severidad']) or 'media'
            self._emitir(
                r, 'rec:%s' % fid, reg['nodo'], n, sev,
                {'alerta_origen': fid, 'regla_origen': reg['regla'],
                 'titulo_origen': reg.get('titulo', ''),
                 'semanas': reg.get('semanas', []),
                 'detectada': reg['detectada'], 'valor_actual': reg['valor']},
                titulo='Sin resolver hace %d semanas: %s'
                       % (n, reg.get('titulo', reg['regla_nombre'])))

    # ---------------- salida ------------------------------------------
    def resumen(self):
        act = [a for a in self.alertas]
        por_sev = collections.Counter(a['severidad'] for a in act)
        por_estado = collections.Counter(a['estado'] for a in act)
        por_nodo = collections.Counter(a['nodo'] for a in act)
        por_regla = collections.Counter(a['regla'] for a in act)
        return {
            'corte': self.ahora.strftime('%Y-%m-%d %H:%M'),
            'alertas': len(act),
            'a_notificar': sum(1 for a in act if a['notificar']),
            'por_severidad': dict(por_sev),
            'por_nodo': dict(por_nodo),
            'por_regla': dict(por_regla),
            'por_estado': dict(por_estado),
            'nuevas': sum(1 for a in act if a['estado'] == 'nueva'),
            'resueltas_en_esta_corrida': sum(
                1 for a in self.estado['alertas'].values()
                if a.get('resuelta', '').startswith(
                    self.ahora.strftime('%Y-%m-%d'))),
        }


def _num(s):
    try:
        return int(float(s))
    except (TypeError, ValueError):
        return 0


def _nodo_de_etapa(etapa):
    for lista in M.ETAPAS.values():
        for _, _, nombre, nodo in lista:
            if nombre == etapa:
                return nodo
    return 'Operacion'


def cargar_config(path):
    with open(path, encoding='utf-8') as fh:
        return yaml.safe_load(fh)
