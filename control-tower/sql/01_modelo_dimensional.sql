/* =====================================================================
   OI CONTROL TOWER - 01. Modelo dimensional
   ---------------------------------------------------------------------
   Esquema estrella. Dos hechos, porque hay dos granos distintos y
   mezclarlos es el error clasico de este tipo de tablero:

     fact_envio_linea  grano: linea de un envio. Sirve para medir tiempos,
                       cumplimiento y volumen.
     fact_ut           grano: unidad de transporte. Sirve para gestionar
                       excepciones: es lo que una persona puede buscar,
                       reclamar y destrabar.

   Por que el envio y no el pedido: un mismo nropedidoweb genera varios
   envios cuando hubo reenvio (el original se anula con anulporreenvio='S'
   y nace una linea nueva con otra fecaltaped y su propio recorrido).
   Verificado sobre jun-ago 2026: 421 pedidos tienen mas de una fecha de
   alta y el 100% de ellos tiene marca de reenvio. Medir por pedido daba
   19 dias medianos en esos casos cuando el envio que llego tardo 7.
   ===================================================================== */

/* ---------------- dimensiones ---------------- */

CREATE OR ALTER VIEW dim.sucursal AS
SELECT DISTINCT
    codsuc                      AS cod_sucursal,
    MAX(nombre_suc)             AS sucursal,
    MAX(coddeposito3)           AS cod_cdr        -- CDR que la abastece
FROM stg.circuito_1060
WHERE codsuc IS NOT NULL
GROUP BY codsuc;
GO
/* NOTA: cod_cdr sale del propio movimiento. El maestro oficial de
   sucursal -> CDR -> zona esta en el archivo de abastecimiento y conviene
   cargarlo como tabla en vez de derivarlo, porque trae sucursales sin
   movimiento en la ventana. Ver docs/09-datos-que-faltan.md. */

CREATE OR ALTER VIEW dim.nodo AS
SELECT * FROM (VALUES
    ('MCR',            'Deposito 940',            'deposito'),
    ('CDR',            'Centro de distribucion',  'deposito'),
    ('Transporte',     'Tramos de viaje',         'transporte'),
    ('Andreani',       'Operador tercero',        'tercero'),
    ('Abastecimiento', 'Compras y reposicion',    'planeamiento'),
    ('Sucursal',       'Punto de entrega',        'sucursal')
) v(cod_nodo, nodo, tipo_nodo);
GO

CREATE OR ALTER VIEW dim.etapa AS
SELECT * FROM (VALUES
    (1,'Pulmon de picking MCR',   'MCR',        'trabajo',  'cdr,directo,andreani'),
    (2,'Control MCR',             'MCR',        'trabajo',  'cdr,directo'),
    (3,'Cola de despacho MCR',    'MCR',        'espera',   'cdr,directo,andreani'),
    (4,'Transito MCR a CDR',      'Transporte', 'transito', 'cdr'),
    (5,'Dentro del CDR',          'CDR',        'mixto',    'cdr'),
    (6,'Transito CDR a sucursal', 'Transporte', 'transito', 'cdr,local'),
    (7,'Transito MCR a sucursal', 'Transporte', 'transito', 'directo'),
    (8,'En Andreani',             'Andreani',   'tercero',  'andreani'),
    (9,'Sin circuito asignado',   'Abastecimiento','espera','sin_origen')
) v(orden_etapa, etapa, cod_nodo, tipo_etapa, circuitos);
GO

/* ---------------- hecho 1: linea de envio ---------------- */

CREATE OR ALTER VIEW fact.envio_linea AS
SELECT
    CONCAT(v.nropedidoweb,'-',CONVERT(CHAR(10), v.fecaltaped, 23)) AS id_envio,
    v.nropedidoweb, v.fecaltaped, v.nrolinea, v.codart, v.descripcion,
    v.codsuc, v.coddeposito3 AS cod_cdr, v.unidadtransporte AS ut,
    v.circuito, v.es_anulada, v.es_cerrada,
    v.leadtimetotal, v.leadtimevtaverde, v.cantbackorder,
    v.dias_ciclo, v.dias_atraso,
    CASE WHEN v.dias_atraso IS NULL THEN NULL
         WHEN v.dias_atraso <= 0 THEN 1 ELSE 0 END AS cumple_plazo,
    /* duracion de cada etapa en HORAS reales.
       Horas, no dias: la planificacion corre en un batch de las 04:30 y la
       gente compra a la tarde, asi que un tramo 18:20 -> 04:26 (10 horas)
       contado en dias calendario sumaba un dia entero que no existio.
       Para el CUMPLIMIENTO se usan dias calendario, porque asi esta
       expresada la promesa. Son dos relojes distintos y los dos hacen falta. */
    DATEDIFF(MINUTE, v.fecplanificacion, v.fecpicking)    / 60.0 AS h_picking,
    DATEDIFF(MINUTE, v.fecpicking,       v.feccontrolado) / 60.0 AS h_control,
    DATEDIFF(MINUTE, v.feccontrolado,    v.fecsalidacdrweb)/60.0 AS h_cola_despacho,
    DATEDIFF(MINUTE, v.fecsalidacdrweb,  v.fecllegadacdr) / 60.0 AS h_transito_cdr,
    DATEDIFF(MINUTE, v.fecllegadacdr,    v.fecsalidacdr)  / 60.0 AS h_dentro_cdr,
    DATEDIFF(MINUTE, v.fecsalidacdr,     v.fecrec_item)   / 60.0 AS h_ultimo_tramo,
    DATEDIFF(MINUTE, v.fecrec_art8,      v.fecrec_item)   / 60.0 AS h_recepcion_sucursal,
    DATEDIFF(MINUTE, v.fecaltaped,       v.fecplanificacion)/60.0 AS h_espera_planificacion
FROM stg.v_1060 v;
GO

/* ---------------- hecho 2: unidad de transporte ---------------- */
/* Verificado sobre jun-ago 2026: ninguna UT mezcla sucursales (14.123 UT,
   0 con mas de una). Una UT = una sucursal, y puede llevar varios pedidos
   (mediana 2 lineas, p90 13, maximo 157). Por eso la UT es la unidad de
   reclamo: identifica un bulto fisico con un destino unico. */

CREATE OR ALTER VIEW fact.ut AS
WITH h AS (
    SELECT
        unidadtransporte AS ut,
        MIN(codsuc)          AS codsuc,
        MIN(nombre_suc)      AS sucursal,
        MAX(coddeposito3)    AS cod_cdr,
        MIN(circuito)        AS circuito,
        COUNT(*)             AS lineas,
        COUNT(DISTINCT nropedidoweb) AS pedidos,
        MIN(fecaltaped)      AS f_alta,
        MIN(leadtimetotal)   AS lt_prometido,
        MAX(fecplanificacion) AS f_planificacion,
        MAX(fecpicking)       AS f_picking,
        MAX(feccontrolado)    AS f_control,
        MAX(fecsalidacdrweb)  AS f_salida_mcr,
        MAX(fecllegadacdr)    AS f_llegada_cdr,
        MAX(fecinirecepcdr)   AS f_inirec_cdr,
        MAX(fecsalidacdr)     AS f_salida_cdr,
        MAX(fecrec_art8)      AS f_rec_caja,
        MAX(fecrec_item)      AS f_rec_item,
        MIN(CASE WHEN fecanulado IS NULL THEN 0 ELSE 1 END) AS todas_anuladas
    FROM stg.v_1060
    WHERE unidadtransporte IS NOT NULL AND unidadtransporte <> ''
    GROUP BY unidadtransporte
)
SELECT h.*,
    /* ultimo hito alcanzado: define donde esta parada la UT */
    COALESCE(
        CASE WHEN h.f_rec_item    IS NOT NULL THEN 'recibida en sucursal' END,
        CASE WHEN h.f_rec_caja    IS NOT NULL THEN 'recibida en sucursal (caja)' END,
        CASE WHEN h.f_salida_cdr  IS NOT NULL THEN 'despachada del CDR' END,
        CASE WHEN h.f_inirec_cdr  IS NOT NULL THEN 'en recepcion del CDR' END,
        CASE WHEN h.f_llegada_cdr IS NOT NULL THEN 'llegada al CDR' END,
        CASE WHEN h.f_salida_mcr  IS NOT NULL THEN 'despachada de MCR' END,
        CASE WHEN h.f_control     IS NOT NULL THEN 'controlada' END,
        CASE WHEN h.f_picking     IS NOT NULL THEN 'pickeada' END,
        CASE WHEN h.f_planificacion IS NOT NULL THEN 'planificada' END,
        'sin planificar')                                   AS ultimo_hito,
    COALESCE(h.f_rec_item, h.f_rec_caja, h.f_salida_cdr, h.f_inirec_cdr,
             h.f_llegada_cdr, h.f_salida_mcr, h.f_control, h.f_picking,
             h.f_planificacion, h.f_alta)                   AS f_ultimo_hito,
    CAST(CASE WHEN h.f_rec_item IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS cerrada
FROM h;
GO
