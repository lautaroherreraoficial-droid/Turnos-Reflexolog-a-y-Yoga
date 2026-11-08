# Casa + negocio: modelo 3D y plan del local

Esta carpeta no tiene nada que ver con el bot ni con el servidor. Es el diseño del local que
va en la casa: una parte para dar el **servicio** (gabinete de masajes y reflexología), una
**tienda** en la esquina, con la entrada en la ochava (la pared en diagonal), y la oficina
convertida en **depósito** para vender online.

La página se puede **editar**: botón «Editar plano» → pestañas Muebles, Paredes y Pisos.
Lo que se cambia queda guardado en la base de la propia página (documento `planos/actual`),
así que se ve igual en el celu y en la PC.

Página con el modelo 3D y el plan completo: https://claude.ai/artifact/QdHqXFLhr8wXBGwt1suP6x

## Qué hay acá

| Archivo | Para qué sirve |
| --- | --- |
| `casa-negocio.ifc` | El modelo para **Revit** (o ArchiCAD, SketchUp, BIMvision). |
| `visor.html` | La página del modelo 3D con el plan de negocio. Es lo que está publicado. |
| `modelo.json` | El plano de partida: ambientes (polígonos), paredes (en cualquier ángulo) y muebles (con giro). |
| `generar_modelo.py` | Lee `modelo.json` y genera el IFC y `visor.html`. |
| `visor_plantilla.html` | El diseño de la página (sin los datos). |

## Abrirlo en Revit

1. Archivo → Abrir → IFC → elegí `casa-negocio.ifc`.
2. Trae paredes, 10 puertas, 5 ventanas, 10 ambientes con sus m² y 36 muebles.
3. Cada ambiente y mueble tiene la propiedad `Casa_Negocio → Zona`
   (Servicio, Tienda, Venta online, Casa) para filtrar o armar tablas.
4. Guardalo como `.rvt` y seguí trabajando ahí.

## Pasar a Revit lo editado en la página

1. Bajar el documento `planos/actual` de la base del artifact (Claude lo hace con su
   herramienta de datos del artifact) a un archivo, por ejemplo `plano.json`.
2. Correr:

```bash
pip install ifcopenshell
python generar_modelo.py --desde plano.json
```

Eso actualiza `modelo.json`, el IFC y `visor.html` (que queda como nuevo plano de partida).

## El plan en tres líneas

1. **Vender ya:** gift cards y packs de sesiones para Navidad (sin stock, link de Mercado Pago).
2. **Producto propio:** kit "Reflexología en casa" con video por QR. Después aceites y cremas
   con ANMAT, aromas, almohadillas de semillas. Accesorios de yoga solo en el local.
3. **Canales:** catálogo de WhatsApp + Instagram + Mercado Pago. Tiendanube cuando WhatsApp
   no dé abasto. Antes de gastar en obra: habilitación municipal y monotributo.
