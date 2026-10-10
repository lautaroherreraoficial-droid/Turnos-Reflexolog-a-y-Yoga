/* =====================================================================
   OI CONTROL TOWER - 00. Capa de staging
   ---------------------------------------------------------------------
   Dialecto: T-SQL (SQL Server). Para otro motor cambian los tipos y
   DATEDIFF; la logica no.

   QUE ES ESTO Y QUE NO ES
   Esta tabla es el espejo FIEL del export del circuito 1060 tal como se
   entrega hoy. Los nombres de columna estan VERIFICADOS contra los dos
   formatos del export (jun-jul y ago de 2026). No es un esquema inventado:
   es el que ya existe, solo que escrito como tabla.

   Lo que SI esta verificado: los 58 campos, su orden, su significado
   funcional y el hecho de que ambos formatos traen los mismos datos en las
   mismas posiciones con 7 nombres distintos.

   Lo que NO se sabe y hay que confirmar con Sistemas:
     - el nombre de la tabla/vista de origen en el ERP;
     - si existe una vista ya publicada o si hay que pedir una;
     - la frecuencia real de actualizacion (de eso depende cada cuanto
       puede correr el motor, y por lo tanto que se le puede prometer al
       negocio en materia de "tiempo real": ver docs/09-datos-que-faltan.md).

   Mientras eso no exista, el motor lee los mismos campos desde el archivo
   (engine/ct_fuentes.py) y el resto del sistema no cambia.
   ===================================================================== */

IF OBJECT_ID('stg.circuito_1060', 'U') IS NOT NULL DROP TABLE stg.circuito_1060;
GO

CREATE TABLE stg.circuito_1060 (
    -- identificacion
    nropedidoweb        VARCHAR(20)   NOT NULL,
    idpedidomeli        VARCHAR(30)   NULL,
    codsuc              VARCHAR(5)    NOT NULL,  -- sucursal de destino
    nombre_suc          VARCHAR(80)   NULL,
    fecaltaped          DATETIME2(0)  NULL,      -- alta del pedido
    -- articulo
    codart              VARCHAR(20)   NULL,
    descripcion         VARCHAR(120)  NULL,
    marca               VARCHAR(60)   NULL,
    contenido           VARCHAR(20)   NULL,
    codmedida           VARCHAR(10)   NULL,
    -- promesa
    leadtimetotal       INT           NULL,      -- plazo prometido, dias calendario
    leadtimevtaverde    INT           NULL,      -- parte del plazo que aporta el proveedor
    precioventa         DECIMAL(14,2) NULL,
    nrosurtido          VARCHAR(20)   NULL,
    nrolinea            INT           NULL,
    orden               INT           NULL,
    nroprovisionlocal   VARCHAR(20)   NULL,
    -- hitos en MCR (deposito 940)
    fecplanificacion    DATETIME2(0)  NULL,      -- batch de las 04:30
    fecpicking          DATETIME2(0)  NULL,
    feccontrolado       DATETIME2(0)  NULL,
    -- consolidacion fisica
    unidadtransporte    VARCHAR(20)   NULL,      -- UT. La clave operativa.
    codart_ut           VARCHAR(20)   NULL,
    nroexpddecdrweb     VARCHAR(20)   NULL,      -- expedicion MCR -> CDR
    coddeposito1        VARCHAR(5)    NULL,      -- origen (940 = MCR)
    codsuc1             VARCHAR(5)    NULL,
    fecsalidacdrweb     DATETIME2(0)  NULL,      -- salida de MCR
    -- base de transferencia (poco usada: 470 lineas en jun-ago 2026)
    fecllegadabt        DATETIME2(0)  NULL,
    nroexpeddebt        VARCHAR(20)   NULL,
    nrocc               VARCHAR(20)   NULL,
    coddeposito2        VARCHAR(5)    NULL,
    codsuc2             VARCHAR(5)    NULL,
    fecsalidabt         DATETIME2(0)  NULL,
    -- CDR de zona
    fecllegadacdr       DATETIME2(0)  NULL,
    fecinirecepcdr      DATETIME2(0)  NULL,
    fecfinrecepcdr      DATETIME2(0)  NULL,      -- OJO: cierra por lote, ver 06
    nroexpddecdr        VARCHAR(20)   NULL,      -- expedicion CDR -> sucursal
    coddeposito3        VARCHAR(5)    NULL,      -- CDR de zona
    codsuc3             VARCHAR(5)    NULL,
    fecsalidacdr        DATETIME2(0)  NULL,
    -- sucursal
    fecrec_art8         DATETIME2(0)  NULL,      -- recepcion de la caja contenedora
    fecrec_item         DATETIME2(0)  NULL,      -- FIN DE LA RESPONSABILIDAD LOGISTICA
    fecentregado        DATETIME2(0)  NULL,      -- lo retira el cliente: no es nuestro tiempo
    -- marcas
    fecanulado          DATETIME2(0)  NULL,
    anulporreenvio      CHAR(1)       NULL,
    reenvio             CHAR(1)       NULL,
    cantbackorder       INT           NULL,
    provisionlocal      CHAR(1)       NULL,
    andreani            CHAR(1)       NULL,
    bigger              CHAR(1)       NULL,
    tipoenvio           VARCHAR(10)   NULL,
    estadoandreani      VARCHAR(40)   NULL,
    oc_ventaverde       VARCHAR(20)   NULL,
    fechaliberacion     DATETIME2(0)  NULL,
    -- datos personales: NO se cargan. Ver RESTRICCIONES en el README.
    -- apellido / nombre / telefono / tipodocumento / nrodocumento quedan
    -- fuera del staging: el control tower no los necesita para nada.
    carga_ts            DATETIME2(0)  NOT NULL CONSTRAINT DF_stg_1060_ts DEFAULT SYSDATETIME(),
    carga_origen        VARCHAR(120)  NULL
);
GO

CREATE INDEX IX_stg1060_ut    ON stg.circuito_1060 (unidadtransporte);
CREATE INDEX IX_stg1060_ped   ON stg.circuito_1060 (nropedidoweb, fecaltaped);
CREATE INDEX IX_stg1060_suc   ON stg.circuito_1060 (codsuc, fecaltaped);
CREATE INDEX IX_stg1060_cdr   ON stg.circuito_1060 (coddeposito3, fecaltaped);
GO

/* ---------------------------------------------------------------------
   Vista normalizada: una sola definicion de "circuito" y de "cerrado"
   para que ninguna consulta de aguas abajo la reinvente distinto.
   --------------------------------------------------------------------- */
CREATE OR ALTER VIEW stg.v_1060 AS
SELECT
    s.*,
    CAST(CASE
        WHEN s.provisionlocal = 'S'   THEN 'local'
        WHEN s.andreani       = 'S'   THEN 'andreani'
        WHEN s.coddeposito1  <> '940' OR s.coddeposito1 IS NULL THEN 'sin_origen'
        WHEN s.coddeposito3 IS NOT NULL AND s.coddeposito3 <> '' THEN 'cdr'
        ELSE 'directo'
    END AS VARCHAR(12))                                        AS circuito,
    CAST(CASE WHEN s.fecanulado  IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS es_anulada,
    CAST(CASE WHEN s.fecrec_item IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS es_cerrada,
    /* El reloj logistico termina en fecrec_item. fecentregado depende de
       cuando el cliente pasa a buscarlo y no es tiempo nuestro. */
    DATEDIFF(DAY, s.fecaltaped, s.fecrec_item)                 AS dias_ciclo,
    CASE WHEN s.fecrec_item IS NOT NULL AND s.leadtimetotal IS NOT NULL
         THEN DATEDIFF(DAY, s.fecaltaped, s.fecrec_item) - s.leadtimetotal
    END                                                        AS dias_atraso
FROM stg.circuito_1060 s;
GO
