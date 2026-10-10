# -*- coding: utf-8 -*-
"""Pruebas del Control Tower.

Tres niveles, porque cada uno atrapa un tipo distinto de error:

  1. INVARIANTES sobre los datos reales. Si manana el export cambia de
     forma, estas pruebas fallan antes de que el tablero mienta.
  2. CASOS SINTETICOS por regla. Prueban que cada regla PUEDE dispararse.
     Una regla que nunca se dispara parece sana y no lo esta: hay que
     demostrar que detecta lo que dice detectar.
  3. PARIDAD SQL. La misma consulta de pendientes, escrita en SQL y
     corrida sobre SQLite con los datos reales, tiene que dar el mismo
     numero que el motor en Python. Si los dos caminos no coinciden, uno
     de los dos esta mal y el tablero no se publica.

Uso:  python3 test_ct.py [--rapido]
      --rapido saltea lo que necesita el export completo.
"""
import datetime, os, sqlite3, sys, tempfile, unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import ct_fuentes, ct_modelo, ct_motor

UP = os.environ.get('CT_UPLOADS',
                    '/root/.claude/uploads/0fa3a80a-9f17-5bc6-91bb-a8a23efb6ade')
FUENTES = [os.path.join(UP, 'f0a8bfd2-TrackingLAOL.txt'),
           os.path.join(UP, 'e346d969-1060_juniojulio.csv')]
HAY_DATOS = all(os.path.exists(f) for f in FUENTES)
_CACHE = {}


def modelo_real():
    if 'm' not in _CACHE:
        _CACHE['m'] = ct_modelo.Modelo(ct_fuentes.leer_varios(FUENTES))
    return _CACHE['m']


# ---------------------------------------------------------------- utilidades
def linea(**kw):
    """Fabrica una linea sintetica con el layout real del export."""
    campos = [''] * 58
    campos[ct_fuentes.COLS['deposito1']] = '940'
    for k, v in kw.items():
        campos[ct_fuentes.COLS[k]] = v
    return ct_fuentes.Linea(campos, ct_fuentes.ISO, 'test')


def cfg_min(**over):
    base = {
        'parametros_globales': {'silencio_horas': 24, 'min_n_default': 1,
                                'dias_recurrencia': 21},
        'responsables': {'MCR': 'MCR', 'CDR': 'CDR', 'Transporte': 'Transporte',
                         'Andreani': 'Andreani', 'Abastecimiento': 'Abast',
                         'Promesa': 'Promesa', 'Datos': 'Datos',
                         'Sucursal': 'Sucursal'},
        'reglas': [],
    }
    base.update(over)
    return base


def regla(rid, tipo, **kw):
    r = {'id': rid, 'nombre': rid, 'activa': True, 'tipo': tipo,
         'umbral': kw.pop('umbral', 1), 'umbral_cierre': 0,
         'severidad': kw.pop('severidad', {'critica': 100, 'alta': 10, 'media': 1}),
         'min_n': kw.pop('min_n', 1), 'accion': 'probar', 'responsable': 'por_nodo'}
    r.update(kw)
    return r


# =========================================================== 1. invariantes
@unittest.skipUnless(HAY_DATOS, 'sin el export no se puede')
class Invariantes(unittest.TestCase):

    def test_una_ut_una_sucursal(self):
        """Si esto falla, fact.ut deja de ser una unidad de reclamo valida."""
        m = modelo_real()
        malas = [u.nro for u in m.uts
                 if len({l['suc'] for l in u.lineas}) > 1]
        self.assertEqual(malas, [], 'hay UT que mezclan sucursales: %s' % malas[:5])

    def test_cadena_de_hitos_ordenada(self):
        """Los hitos de la cadena no pueden ir para atras.

        fecfinrecepcdr queda deliberadamente FUERA de la cadena: cierra por
        lote de la expedicion de entrada y es posterior a fecsalidacdr en
        uno de cada cuatro envios. Por eso no se lo mide.
        """
        m = modelo_real()
        pares = [('f_planificacion', 'f_picking'), ('f_picking', 'f_control'),
                 ('f_llegada_cdr', 'f_inirec_cdr'), ('f_inirec_cdr', 'f_salida_cdr'),
                 ('f_salida_cdr', 'f_rec_caja'), ('f_rec_caja', 'f_rec_item')]
        for a, b in pares:
            inv = sum(1 for l in m.lineas if l[a] and l[b] and l[b] < l[a])
            n = sum(1 for l in m.lineas if l[a] and l[b])
            self.assertLess(100.0 * inv / max(n, 1), 0.5,
                            '%s -> %s invertido en %d de %d' % (a, b, inv, n))

    def test_el_corte_no_es_hoy(self):
        """El corte sale del dato, no del reloj: si no, se inventan atrasos."""
        m = modelo_real()
        self.assertLess(m.corte, datetime.datetime.now())
        self.assertEqual(m.corte.year, 2026)

    def test_suma_de_etapas_igual_al_ciclo(self):
        """Las etapas tienen que cerrar contra el ciclo medido punta a punta.

        Si no cierra, hay tiempo que el tablero no le imputa a nadie.
        """
        m = modelo_real()
        tot_etapas = tot_ciclo = 0.0
        n = 0
        for l in m.lineas:
            if l.circuito != 'cdr' or l.anulada or not l['f_rec_item']:
                continue
            tramos = [(l[a], l[b]) for a, b, _, _ in ct_modelo.ETAPAS['cdr']]
            if any(x is None or y is None for x, y in tramos):
                continue
            s = sum((y - x).total_seconds() for x, y in tramos) / 3600
            c = (l['f_rec_item'] - l['f_planificacion']).total_seconds() / 3600
            tot_etapas += s
            tot_ciclo += c
            n += 1
        self.assertGreater(n, 1000)
        self.assertAlmostEqual(tot_etapas / n, tot_ciclo / n, places=4)

    def test_cobertura_minima(self):
        m = modelo_real()
        self.assertGreater(len(m.lineas), 50000)
        self.assertGreater(len(m.uts), 10000)
        # las lineas sin UT son un hallazgo, no un bug: hay que verlas
        self.assertLess(len(m.sin_ut) / len(m.lineas), 0.10)


# ================================================== 2. una prueba por regla
class ReglasSinteticas(unittest.TestCase):

    def _correr(self, lineas, reglas, corte=None):
        m = ct_modelo.Modelo(lineas, corte=corte or datetime.datetime(2026, 9, 1))
        mot = ct_motor.Motor(m, cfg_min(reglas=reglas))
        return mot.correr(), mot

    def test_R01_detecta_ut_detenida(self):
        ls = [linea(pedido='1', suc='010', ut='U1', f_alta='2026-08-01 10:00',
                    f_planificacion='2026-08-02 04:30', f_picking='2026-08-02 09:00',
                    f_control='2026-08-02 11:00')
              for _ in range(1)]
        ls[0].v['deposito3'] = '079'
        a, _ = self._correr(ls, [regla('R01', 'ut_detenida', umbral=5,
                                       severidad={'critica': 20, 'alta': 10, 'media': 5})])
        self.assertEqual(len(a), 1)
        self.assertEqual(a[0]['regla'], 'R01')
        self.assertGreater(a[0]['valor'], 5)
        self.assertIn('U1', a[0]['evidencia']['ut'])

    def test_R01_no_alerta_lo_que_cerro(self):
        l = linea(pedido='1', suc='010', ut='U1', f_alta='2026-08-01 10:00',
                  f_planificacion='2026-08-02 04:30', f_picking='2026-08-02 09:00',
                  f_control='2026-08-02 11:00', f_salida_mcr='2026-08-02 20:00',
                  f_llegada_cdr='2026-08-03 08:00', f_salida_cdr='2026-08-03 18:00',
                  f_rec_item='2026-08-04 09:00')
        l.v['deposito3'] = '079'
        a, _ = self._correr([l], [regla('R01', 'ut_detenida', umbral=5)])
        self.assertEqual(a, [])

    def test_R01_agrupa_en_vez_de_inundar(self):
        """20 UT detenidas en el mismo nodo deben dar UNA alerta, no 20."""
        ls = []
        for i in range(20):
            l = linea(pedido=str(i), suc='010', ut='U%d' % i,
                      f_alta='2026-08-01 10:00', f_planificacion='2026-08-02 04:30',
                      f_picking='2026-08-02 09:00', f_control='2026-08-02 11:00')
            l.v['deposito3'] = '079'
            ls.append(l)
        a, _ = self._correr(ls, [regla('R01', 'ut_detenida', umbral=5,
                                       agrupar_si_mas_de=15)])
        self.assertEqual(len(a), 1)
        self.assertTrue(a[0]['agregada'])
        self.assertEqual(a[0]['evidencia']['total_ut'], 20)

    def test_R02_pedido_sin_circuito(self):
        l = linea(pedido='9', suc='010', f_alta='2026-08-01 10:00')
        l.v['deposito1'] = ''
        self.assertEqual(l.circuito, 'sin_origen')
        a, _ = self._correr([l], [regla('R02', 'sin_circuito', umbral=7,
                                        severidad={'critica': 30, 'alta': 15, 'media': 7})])
        self.assertEqual(len(a), 1)
        self.assertEqual(a[0]['nodo'], 'Abastecimiento')

    def test_R03_detecta_una_cola_que_crece(self):
        """La regla del pulmon no se disparo con datos reales: hay que
        demostrar que se dispara cuando la cola efectivamente crece."""
        ls = []
        base = datetime.datetime(2026, 6, 1)
        # 70 dias de 2 lineas por dia que se resuelven al dia siguiente
        for d in range(70):
            f = base + datetime.timedelta(days=d)
            for k in range(2):
                l = linea(pedido='b%d_%d' % (d, k), suc='010', ut='B%d_%d' % (d, k),
                          f_alta=f.strftime('%Y-%m-%d 10:00:00'),
                          f_planificacion=f.strftime('%Y-%m-%d 04:30:00'),
                          f_picking=(f + datetime.timedelta(days=1)).strftime('%Y-%m-%d 09:00:00'))
                l.v['deposito3'] = '079'
                ls.append(l)
        # ultimos 12 dias: 60 lineas que entran y NO salen
        for d in range(70, 82):
            f = base + datetime.timedelta(days=d)
            for k in range(60):
                l = linea(pedido='x%d_%d' % (d, k), suc='010', ut='X%d_%d' % (d, k),
                          f_alta=f.strftime('%Y-%m-%d 10:00:00'),
                          f_planificacion=f.strftime('%Y-%m-%d 04:30:00'))
                l.v['deposito3'] = '079'
                ls.append(l)
        r = regla('R03', 'wip_anomalo', umbral=3.0, min_n=30,
                  ventana_base_dias=56, metodo='mad',
                  severidad={'critica': 6.0, 'alta': 4.0, 'media': 3.0})
        a, _ = self._correr(ls, [r], corte=base + datetime.timedelta(days=82))
        pulmon = [x for x in a if 'picking' in x['evidencia'].get('etapa', '')]
        self.assertTrue(pulmon, 'la regla del pulmon no detecto una cola que crecio 30x')
        self.assertGreaterEqual(pulmon[0]['valor'], 3.0)

    def test_R05_separa_promesa_mala_de_operacion_mala(self):
        ls = []
        for i in range(40):                      # promesa imposible: promete 3, tarda 9
            ls.append(linea(pedido='a%d' % i, suc='900', suc_nombre='MALA PROMESA',
                            ut='A%d' % i, lt_total='3',
                            f_alta='2026-08-01 10:00', f_rec_item='2026-08-10 10:00'))
        for i in range(40):                      # promesa sana: promete 9, tarda 4
            ls.append(linea(pedido='b%d' % i, suc='901', suc_nombre='SANA',
                            ut='B%d' % i, lt_total='9',
                            f_alta='2026-08-01 10:00', f_rec_item='2026-08-05 10:00'))
        a, _ = self._correr(ls, [regla('R05', 'promesa_descalibrada', umbral=0,
                                       min_n=30, responsable='Promesa',
                                       severidad={'critica': -3, 'alta': -1, 'media': 0})])
        self.assertEqual(len(a), 1)
        self.assertIn('900', a[0]['evidencia']['sucursal'])
        self.assertEqual(a[0]['evidencia']['holgura_dias'], -6)

    def test_R06_campo_clave_faltante(self):
        ls = [linea(pedido=str(i), suc='010', ut='' if i < 30 else 'U%d' % i,
                    f_alta='2026-08-01 10:00') for i in range(100)]
        for l in ls:
            l.v['deposito3'] = '079'
        a, _ = self._correr(ls, [regla('R06', 'datos_incompletos', umbral=2.0,
                                       min_n=50, campos_clave=['ut'],
                                       responsable='Datos',
                                       severidad={'critica': 10.0, 'alta': 5.0, 'media': 2.0})])
        self.assertEqual(len(a), 1)
        self.assertAlmostEqual(a[0]['valor'], 30.0, places=1)

    def test_R08_cuenta_intentos_no_lineas(self):
        """Dos lineas del mismo pedido en la misma fecha NO son un reenvio."""
        ls = [linea(pedido='7', **{'linea':'1'}, suc='010', ut='U1', f_alta='2026-08-01 10:00'),
              linea(pedido='7', **{'linea':'2'}, suc='010', ut='U1', f_alta='2026-08-01 10:00')]
        a, _ = self._correr(ls, [regla('R08', 'reenvio', umbral=2,
                                       severidad={'critica': 3, 'alta': 2, 'media': 2})])
        self.assertEqual(a, [], 'conto dos lineas del mismo envio como reenvio')
        ls.append(linea(pedido='7', **{'linea':'1'}, suc='010', ut='U2',
                        f_alta='2026-08-09 10:00'))
        a, _ = self._correr(ls, [regla('R08', 'reenvio', umbral=2,
                                       severidad={'critica': 3, 'alta': 2, 'media': 2})])
        self.assertEqual(len(a), 1)
        self.assertEqual(a[0]['evidencia']['intentos'], 2)

    def test_R09_backorder(self):
        l = linea(pedido='5', suc='010', ut='U1', f_alta='2026-08-01 10:00',
                  cant_backorder='2')
        l.v['deposito3'] = '079'
        a, _ = self._correr([l], [regla('R09', 'backorder', umbral=10,
                                        severidad={'critica': 30, 'alta': 20, 'media': 10})])
        self.assertEqual(len(a), 1)


# ============================================== 3. ciclo de vida y anti-ruido
class CicloDeVida(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.estado = os.path.join(self.tmp, 'estado.json')
        l = linea(pedido='1', suc='010', ut='U1', f_alta='2026-08-01 10:00',
                  f_planificacion='2026-08-02 04:30', f_picking='2026-08-02 09:00',
                  f_control='2026-08-02 11:00')
        l.v['deposito3'] = '079'
        self.lineas = [l]
        self.reglas = [regla('R01', 'ut_detenida', umbral=5,
                             severidad={'critica': 20, 'alta': 10, 'media': 5})]

    def _corrida(self, corte, lineas=None):
        m = ct_modelo.Modelo(lineas or self.lineas, corte=corte)
        mot = ct_motor.Motor(m, cfg_min(reglas=self.reglas), estado_path=self.estado)
        a = mot.correr()
        mot.guardar_estado()
        return a, mot

    def test_la_alerta_conserva_identidad_entre_corridas(self):
        a1, _ = self._corrida(datetime.datetime(2026, 8, 10))
        a2, _ = self._corrida(datetime.datetime(2026, 8, 20))
        self.assertEqual(a1[0]['id'], a2[0]['id'], 'la misma alerta cambio de id')
        self.assertEqual(a2[0]['veces_vista'], 2)
        self.assertEqual(a1[0]['detectada'], a2[0]['detectada'])

    def test_escalamiento_queda_en_el_historial(self):
        self._corrida(datetime.datetime(2026, 8, 10))     # 8 dias -> media
        a2, _ = self._corrida(datetime.datetime(2026, 8, 25))  # 23 dias -> critica
        self.assertEqual(a2[0]['severidad'], 'critica')
        self.assertTrue(any(h['ev'] == 'escala' for h in a2[0]['historial']))

    def test_lo_que_se_resolvio_se_marca_resuelto(self):
        self._corrida(datetime.datetime(2026, 8, 10))
        cerrada = linea(pedido='1', suc='010', ut='U1', f_alta='2026-08-01 10:00',
                        f_planificacion='2026-08-02 04:30', f_picking='2026-08-02 09:00',
                        f_control='2026-08-02 11:00', f_rec_item='2026-08-12 10:00')
        cerrada.v['deposito3'] = '079'
        a2, mot = self._corrida(datetime.datetime(2026, 8, 20), [cerrada])
        self.assertEqual(a2, [])
        guardadas = list(mot.estado['alertas'].values())
        self.assertEqual(guardadas[0]['estado'], 'resuelta')


    def test_no_repite_la_notificacion(self):
        """La segunda corrida sobre los mismos datos no vuelve a notificar.

        Es el anti-ruido mas importante: sin esto, una UT detenida 40 dias
        manda 40 mensajes y la gente deja de leerlos.
        """
        a1, _ = self._corrida(datetime.datetime(2026, 8, 10))
        self.assertTrue(a1[0]['notificar'])
        self.assertEqual(a1[0]['estado'], 'nueva')
        a2, _ = self._corrida(datetime.datetime(2026, 8, 10, 6))
        self.assertFalse(a2[0]['notificar'], 'repitio la notificacion dentro del silencio')
        self.assertEqual(a2[0]['estado'], 'abierta')

    def test_el_escalamiento_rompe_el_silencio(self):
        """Lo que empeora se avisa aunque este dentro de la ventana."""
        self._corrida(datetime.datetime(2026, 8, 10))          # media
        a2, _ = self._corrida(datetime.datetime(2026, 8, 10, 3))  # igual -> callado
        self.assertFalse(a2[0]['notificar'])
        a3, _ = self._corrida(datetime.datetime(2026, 8, 25))  # critica -> avisa
        self.assertEqual(a3[0]['severidad'], 'critica')
        self.assertTrue(a3[0]['notificar'], 'no aviso un escalamiento')

    def test_no_pisa_el_estado_que_puso_una_persona(self):
        import json
        self._corrida(datetime.datetime(2026, 8, 10))
        with open(self.estado, encoding='utf-8') as fh:
            e = json.load(fh)
        fid = list(e['alertas'])[0]
        e['alertas'][fid]['estado'] = 'en_gestion'
        with open(self.estado, 'w', encoding='utf-8') as fh:
            json.dump(e, fh)
        a2, _ = self._corrida(datetime.datetime(2026, 8, 20))
        self.assertEqual(a2[0]['estado'], 'en_gestion')

    def test_recurrencia_escala_sola(self):
        self.reglas.append(regla('R07', 'recurrencia', umbral=3,
                                 severidad={'critica': 6, 'alta': 4, 'media': 3}))
        for semana in range(4):
            a, _ = self._corrida(datetime.datetime(2026, 8, 3)
                                 + datetime.timedelta(weeks=semana))
        rec = [x for x in a if x['regla'] == 'R07']
        self.assertTrue(rec, 'no escalo un problema repetido 4 semanas')
        self.assertGreaterEqual(rec[0]['valor'], 3)


# ================================================== 4. paridad con SQL
@unittest.skipUnless(HAY_DATOS, 'sin el export no se puede')
class ParidadSQL(unittest.TestCase):
    """La misma pregunta, resuelta por los dos caminos, tiene que dar igual.

    El SQL de sql/ esta escrito en T-SQL para SQL Server y aqui no hay un
    SQL Server, asi que NO se ejecuta ese archivo tal cual. Lo que se
    ejecuta es la MISMA logica en SQLite sobre los datos reales: si el
    motor en Python y una consulta SQL no coinciden en el numero de UT
    detenidas, uno de los dos esta mal.
    """

    def test_pendientes_coinciden(self):
        m = modelo_real()
        corte = m.corte
        cx = sqlite3.connect(':memory:')
        cx.execute("""CREATE TABLE l (ut TEXT, suc TEXT, anulada INT,
            f_plan TEXT, f_pick TEXT, f_ctrl TEXT, f_salmcr TEXT,
            f_llegcdr TEXT, f_inirec TEXT, f_salcdr TEXT, f_reccaja TEXT,
            f_recitem TEXT, f_alta TEXT)""")
        def s(x):
            return x.strftime('%Y-%m-%d %H:%M:%S') if x else None
        cx.executemany('INSERT INTO l VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [
            (l['ut'], l['suc'], 1 if l.anulada else 0,
             s(l['f_planificacion']), s(l['f_picking']), s(l['f_control']),
             s(l['f_salida_mcr']), s(l['f_llegada_cdr']), s(l['f_inirec_cdr']),
             s(l['f_salida_cdr']), s(l['f_rec_caja']), s(l['f_rec_item']),
             s(l['f_alta']))
            for l in m.lineas if l['ut']])
        cx.execute("""CREATE VIEW ut AS SELECT ut,
            MIN(anulada) AS todas_anuladas,
            MAX(f_recitem) AS f_recitem,
            COALESCE(MAX(f_recitem),MAX(f_reccaja),MAX(f_salcdr),MAX(f_inirec),
                     MAX(f_llegcdr),MAX(f_salmcr),MAX(f_ctrl),MAX(f_pick),
                     MAX(f_plan),MIN(f_alta)) AS f_ultimo
            FROM l GROUP BY ut""")
        q = """SELECT COUNT(*) FROM ut
               WHERE f_recitem IS NULL AND todas_anuladas = 0
                 AND CAST(julianday(?) - julianday(f_ultimo) AS INTEGER) > ?"""
        for umbral in (5, 10, 20):
            sql_n = cx.execute(q, (s(corte), umbral)).fetchone()[0]
            py_n = sum(1 for u in m.uts if not u.cerrada and not u.anulada
                       and u.dias_detenida > umbral)
            # Los dos truncan a dias enteros, asi que tienen que dar IGUAL.
            self.assertEqual(
                sql_n, py_n,
                'umbral %d: SQL dice %d y Python dice %d' % (umbral, sql_n, py_n))
        cx.close()


if __name__ == '__main__':
    if '--rapido' in sys.argv:
        sys.argv.remove('--rapido')
        HAY_DATOS = False
    unittest.main(verbosity=2)
