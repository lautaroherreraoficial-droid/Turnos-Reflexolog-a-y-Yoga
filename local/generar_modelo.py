"""Modelo de la casa + local (servicios, tienda y venta online).

Genera dos archivos a partir de las medidas de abajo:
  - casa-negocio.ifc : modelo BIM. Se abre en Revit (Archivo > Abrir > IFC),
                       ArchiCAD, SketchUp o visores gratis como BIMvision.
  - modelo.json      : los mismos datos para el visor 3D web.
  - visor.html       : el visor 3D con el plan de negocio (sale de visor_plantilla.html).

Uso:  pip install ifcopenshell  &&  python generar_modelo.py
Medidas en metros. Plano visto desde arriba: x crece a la derecha,
y crece hacia la calle (y=0 fondo del terreno, y=11 linea municipal).
"""
import json
import os

import numpy as np
import ifcopenshell
import ifcopenshell.api as api
import ifcopenshell.api.aggregate, ifcopenshell.api.context, ifcopenshell.api.feature  # noqa: E401
import ifcopenshell.api.geometry, ifcopenshell.api.project, ifcopenshell.api.pset  # noqa: E401
import ifcopenshell.api.root, ifcopenshell.api.spatial, ifcopenshell.api.unit  # noqa: E401
from ifcopenshell.util.shape_builder import ShapeBuilder

ANCHO = 10.5   # frente del terreno
FONDO = 11.0   # profundidad
ALTO = 2.6     # altura de paredes
EXT = 0.2      # espesor pared exterior
INT = 0.12     # espesor tabique interior

# ---------------------------------------------------------------- ambientes
# zona: servicio | tienda | ecommerce | casa | exterior
AMBIENTES = [
    dict(id="dorm", num="1", nombre="Dormitorio principal", zona="casa",
         rects=[(0, 0, 4.4, 3.8)],
         info="Queda igual. Es la parte más privada, lejos del local."),
    dict(id="ofi", num="2", nombre="Oficina + depósito", zona="ecommerce",
         rects=[(0, 3.8, 3.4, 7.2)],
         info="El motor de la venta online: stock en estantería, mesa de empaque, "
              "rincón para sacar fotos y la compu para responder pedidos. "
              "Tiene puerta directa a la tienda."),
    dict(id="bano", num="3", nombre="Baño", zona="casa",
         rects=[(3.4, 4.8, 4.9, 7.2)],
         info="Lo usan también los clientes del gabinete."),
    dict(id="coc", num="4", nombre="Cocina", zona="casa",
         rects=[(4.4, 0, 8.0, 3.8)],
         info="Abierta al living. Ventana al patio."),
    dict(id="tienda", num="5a", nombre="Tienda", zona="tienda",
         rects=[(0, 7.2, 4.3, 11)],
         info="Local a la calle: vidriera, góndola de productos, mesa de kits y "
              "mostrador donde se cobra y se retiran pedidos online. "
              "También es la sala de espera del gabinete."),
    dict(id="gab", num="5b", nombre="Gabinete", zona="servicio",
         rects=[(4.3, 7.2, 8.0, 11)],
         info="Masajes y reflexología. Separado de la tienda con tabique y puerta "
              "para que haya silencio y privacidad. Ventana alta esmerilada."),
    dict(id="living", num="6", nombre="Living comedor", zona="casa",
         rects=[(4.4, 3.8, 8.0, 4.8), (4.9, 4.8, 8.0, 7.2)],
         info="Conecta la casa con el gabinete (puerta privada) y con el ingreso."),
    dict(id="paso", num="", nombre="Paso", zona="casa",
         rects=[(3.4, 3.8, 4.4, 4.8)], info="Distribuidor de 1 × 1 m."),
    dict(id="patio", num="", nombre="Patio", zona="exterior",
         rects=[(8.0, 0, 10.5, 6.0)],
         info="15 m². Entran 2 o 3 colchonetas: clases de yoga individuales o de a dos."),
    dict(id="ingreso", num="", nombre="Ingreso y despacho", zona="exterior",
         rects=[(8.0, 6.0, 10.5, 11)],
         info="Por el portón entra la gente de la casa y sale la mercadería: el correo o la moto "
              "retira los pedidos sin pasar por el local."),
]

# ------------------------------------------------------------------ paredes
# (x0, y0, x1, y1, espesor, aberturas)
# abertura: (desde, hasta, antepecho, dintel, tipo, nombre) medida sobre la pared
# tipo: puerta | ventana | porton | pase
PAREDES = [
    (0, 0, ANCHO, 0, EXT, [(1.2, 3.2, 1.0, 2.2, "ventana", "Ventana dormitorio"),
                           (5.2, 6.7, 1.1, 2.1, "ventana", "Ventana cocina")]),
    (0, 0, 0, FONDO, EXT, []),
    (ANCHO, 0, ANCHO, FONDO, EXT, []),
    (0, FONDO, ANCHO, FONDO, EXT, [(0.3, 2.5, 0.3, 2.4, "ventana", "Vidriera"),
                                   (2.8, 3.7, 0, 2.2, "puerta", "Puerta del local"),
                                   (4.9, 7.4, 1.5, 2.2, "ventana", "Ventana alta gabinete"),
                                   (8.2, 10.3, 0, 2.2, "porton", "Portón")]),
    (8.0, 0, 8.0, FONDO, EXT, [(1.2, 2.4, 1.0, 2.1, "ventana", "Ventana cocina al patio"),
                               (4.0, 4.9, 0, 2.1, "puerta", "Puerta ventana al patio"),
                               (6.2, 7.0, 0, 2.1, "puerta", "Puerta de la casa")]),
    (0, 3.8, 8.0, 3.8, INT, [(3.5, 4.3, 0, 2.05, "puerta", "Puerta dormitorio"),
                             (5.6, 7.2, 0, 2.1, "pase", "Pase cocina-living")]),
    (4.4, 0, 4.4, 3.8, INT, []),
    (3.4, 3.8, 3.4, 7.2, INT, [(0.1, 0.9, 0, 2.05, "puerta", "Puerta oficina")]),
    (3.4, 4.8, 4.9, 4.8, INT, [(0.05, 0.7, 0, 2.05, "puerta", "Puerta baño")]),
    (4.9, 4.8, 4.9, 7.2, INT, []),
    (0, 7.2, 8.0, 7.2, INT, [(2.2, 3.0, 0, 2.05, "puerta", "Puerta depósito-tienda"),
                             (5.4, 6.2, 0, 2.05, "puerta", "Puerta privada al gabinete")]),
    (4.3, 7.2, 4.3, FONDO, INT, [(0.8, 1.6, 0, 2.05, "puerta", "Puerta del gabinete")]),
]

# ------------------------------------------------------------------ muebles
# (id, nombre, zona, x0, y0, x1, y1, z, alto, tipo, info)
# tipo (para el visor): madera | blanco | tela | gris | mesa | mesa_blanca | cama |
#                       estante | camilla | mat | cajas | panel | planta | cilindro
MUEBLES = [
    # dormitorio
    ("cama", "Cama 2 plazas", "casa", 1.4, 0.15, 3.0, 2.15, 0, 0.5, "cama", ""),
    ("luz1", "Mesa de luz", "casa", 0.85, 0.15, 1.3, 0.6, 0, 0.5, "madera", ""),
    ("luz2", "Mesa de luz", "casa", 3.1, 0.15, 3.55, 0.6, 0, 0.5, "madera", ""),
    ("placard", "Placard", "casa", 3.75, 0.9, 4.32, 3.0, 0, 2.2, "madera", ""),
    # oficina + deposito
    ("stock", "Estantería de stock", "ecommerce", 0.1, 3.9, 2.5, 4.35, 0, 2.0, "estante",
     "2,40 m · 5 estantes con cajas rotuladas por producto. Acá vive todo lo que se vende online."),
    ("escritorio", "Escritorio y compu", "ecommerce", 0.1, 4.6, 0.8, 6.0, 0, 0.75, "mesa",
     "Para responder WhatsApp, cargar productos a la tienda online e imprimir etiquetas."),
    ("silla", "Silla", "ecommerce", 0.95, 5.05, 1.4, 5.5, 0, 0.45, "tela", ""),
    ("empaque", "Mesa de empaque", "ecommerce", 2.75, 5.0, 3.35, 6.4, 0, 0.9, "mesa_blanca",
     "Cajas, cinta, papel de seda, tarjetita escrita a mano y etiqueta de envío."),
    ("fotos", "Rincón de fotos", "ecommerce", 0.15, 6.35, 0.85, 7.05, 0, 0.75, "mesa_blanca",
     "Mesita con fondo blanco y una luz. Con fotos parejas, la tienda online se ve profesional."),
    ("fondo", "Fondo blanco", "ecommerce", 0.1, 6.3, 0.16, 7.1, 0.75, 0.9, "panel", ""),
    ("cajas", "Cajas de envío", "ecommerce", 1.2, 6.55, 1.8, 7.05, 0, 0.5, "cajas", ""),
    # bano
    ("inodoro", "Inodoro", "casa", 3.55, 6.5, 3.95, 7.1, 0, 0.4, "blanco", ""),
    ("lavatorio", "Lavatorio", "casa", 4.35, 6.6, 4.82, 7.08, 0, 0.85, "blanco", ""),
    ("ducha", "Ducha", "casa", 4.15, 4.88, 4.82, 5.9, 0, 0.06, "blanco", ""),
    # cocina
    ("mesada", "Mesada", "casa", 4.5, 0.1, 7.2, 0.7, 0, 0.9, "blanco", ""),
    ("heladera", "Heladera", "casa", 7.3, 0.1, 7.9, 0.75, 0, 1.8, "gris", ""),
    ("desayunador", "Desayunador", "casa", 5.6, 2.2, 6.8, 2.9, 0, 0.9, "mesa", ""),
    # living
    ("sofa", "Sofá", "casa", 4.98, 5.2, 5.8, 6.9, 0, 0.8, "tela", ""),
    ("ratona", "Mesa ratona", "casa", 6.0, 5.7, 6.5, 6.5, 0, 0.4, "mesa", ""),
    ("comedor", "Mesa comedor", "casa", 6.4, 4.3, 7.4, 5.1, 0, 0.75, "mesa", ""),
    # tienda
    ("gondola", "Góndola de productos", "tienda", 0.1, 7.45, 0.5, 10.3, 0, 2.1, "estante",
     "5 estantes a la vista: aceites, cremas, velas, sahumerios y accesorios de yoga."),
    ("vidriera", "Exhibidor de vidriera", "tienda", 0.4, 10.45, 2.4, 10.85, 0, 0.45, "madera",
     "Tarima baja detrás del vidrio. Se cambia según la fecha: Navidad, Día de la Madre, invierno."),
    ("kits", "Mesa de kits y regalos", "tienda", 1.1, 8.5, 2.3, 9.5, 0, 0.85, "mesa",
     "Kits armados y gift cards a la mano: lo que se lleva alguien que entra a mirar."),
    ("mostrador", "Mostrador", "tienda", 3.35, 8.9, 4.2, 10.2, 0, 1.0, "blanco",
     "Caja con QR de Mercado Pago, bolsas y el estante de pedidos online listos para retirar."),
    ("banco", "Banco de espera", "tienda", 3.15, 7.3, 4.2, 7.72, 0, 0.45, "tela",
     "Quien espera su turno mira los productos. La espera también vende."),
    ("planta1", "Planta", "tienda", 2.45, 10.45, 2.75, 10.75, 0, 1.1, "planta", ""),
    # gabinete
    ("camilla", "Camilla de masajes", "servicio", 5.7, 8.3, 6.4, 10.2, 0, 0.75, "camilla",
     "Con 70 cm libres alrededor para moverse cómoda."),
    ("reflexo", "Sillón de reflexología", "servicio", 7.0, 7.6, 7.8, 9.2, 0, 0.6, "tela",
     "Reclinable, con los pies a la altura de las manos."),
    ("banqueta", "Banqueta con ruedas", "servicio", 6.6, 9.6, 6.95, 9.95, 0, 0.5, "cilindro", ""),
    ("apoyo", "Mueble de apoyo", "servicio", 4.45, 9.5, 4.9, 10.8, 0, 0.9, "madera",
     "Toallas, aceites en uso, parlante. Lo que se usa en la sesión se puede comprar en la tienda."),
    ("planta2", "Planta", "servicio", 7.45, 10.35, 7.8, 10.7, 0, 1.2, "planta", ""),
    # patio
    ("mat1", "Colchoneta de yoga", "servicio", 8.35, 0.8, 8.95, 2.6, 0, 0.01, "mat",
     "En el patio entran 2 o 3 colchonetas para clases individuales o de a dos."),
    ("mat2", "Colchoneta de yoga", "servicio", 9.5, 0.8, 10.1, 2.6, 0, 0.01, "mat", ""),
    ("planta3", "Planta", "exterior", 8.2, 5.3, 8.6, 5.7, 0, 1.0, "planta", ""),
    ("planta4", "Planta", "exterior", 9.95, 5.3, 10.3, 5.65, 0, 0.9, "planta", ""),
    # ingreso
    ("despacho", "Pedidos listos para despachar", "ecommerce", 9.85, 8.9, 10.35, 10.0, 0, 0.6, "cajas",
     "El correo o la moto retiran por el portón sin entrar al local."),
]

ZONAS = {
    "servicio": "Servicio",
    "tienda": "Tienda",
    "ecommerce": "Venta online",
    "casa": "Casa",
    "exterior": "Exterior",
}


def area(rects):
    return round(sum((x1 - x0) * (y1 - y0) for x0, y0, x1, y1 in rects), 1)


def a_json(destino):
    datos = {
        "ancho": ANCHO, "fondo": FONDO, "alto": ALTO,
        "zonas": ZONAS,
        "ambientes": [dict(a, area=area(a["rects"])) for a in AMBIENTES],
        "paredes": [dict(x0=p[0], y0=p[1], x1=p[2], y1=p[3], t=p[4],
                         aberturas=[dict(a=o[0], b=o[1], antepecho=o[2], dintel=o[3],
                                         tipo=o[4], nombre=o[5]) for o in p[5]])
                    for p in PAREDES],
        "muebles": [dict(id=m[0], nombre=m[1], zona=m[2], x0=m[3], y0=m[4], x1=m[5], y1=m[6],
                         z=m[7], h=m[8], tipo=m[9], info=m[10]) for m in MUEBLES],
    }
    with open(destino, "w", encoding="utf-8") as fh:
        json.dump(datos, fh, ensure_ascii=False, indent=1)


# --------------------------------------------------------------------- IFC
def matriz(x, y, z=0.0, angulo=0.0):
    """Ubicacion en coordenadas IFC. El IFC usa Y hacia el fondo, asi que se invierte."""
    m = np.eye(4)
    c, s = np.cos(angulo), np.sin(angulo)
    m[0][0], m[0][1], m[1][0], m[1][1] = c, -s, s, c
    m[0][3], m[1][3], m[2][3] = x, FONDO - y, z
    return m


def a_ifc(destino):
    f = api.project.create_file(version="IFC4")
    proyecto = api.root.create_entity(f, ifc_class="IfcProject", name="Casa + negocio")
    unidades = [api.unit.add_si_unit(f, unit_type=t) for t in ("LENGTHUNIT", "AREAUNIT", "VOLUMEUNIT")]
    api.unit.assign_unit(f, units=unidades)
    modelo = api.context.add_context(f, context_type="Model")
    cuerpo = api.context.add_context(f, context_type="Model", context_identifier="Body",
                                     target_view="MODEL_VIEW", parent=modelo)
    sitio = api.root.create_entity(f, ifc_class="IfcSite", name="Terreno")
    edificio = api.root.create_entity(f, ifc_class="IfcBuilding", name="Casa + negocio")
    planta = api.root.create_entity(f, ifc_class="IfcBuildingStorey", name="Planta baja")
    api.aggregate.assign_object(f, products=[sitio], relating_object=proyecto)
    api.aggregate.assign_object(f, products=[edificio], relating_object=sitio)
    api.aggregate.assign_object(f, products=[planta], relating_object=edificio)
    sb = ShapeBuilder(f)
    contenidos = []

    def caja(clase, nombre, x0, y0, x1, y1, z, h, tipo_obj=None):
        el = api.root.create_entity(f, ifc_class=clase, name=nombre)
        if tipo_obj:
            el.ObjectType = tipo_obj
        perfil = sb.rectangle(size=(x1 - x0, y1 - y0))
        rep = sb.get_representation(cuerpo, [sb.extrude(perfil, magnitude=h)])
        api.geometry.assign_representation(f, product=el, representation=rep)
        api.geometry.edit_object_placement(f, product=el, matrix=matriz(x0, y1, z))
        return el

    # losa
    contenidos.append(caja("IfcSlab", "Contrapiso", 0, 0, ANCHO, FONDO, -0.15, 0.15))

    # paredes con aberturas, puertas y ventanas
    for x0, y0, x1, y1, t, aberturas in PAREDES:
        largo = abs(x1 - x0) + abs(y1 - y0)
        # en IFC la y esta invertida: pared horizontal va +X, vertical va -Y
        ang = 0.0 if y0 == y1 else -np.pi / 2
        extra = t / 2 if t == EXT else 0.0
        pared = api.root.create_entity(f, ifc_class="IfcWall",
                                       name="Pared exterior" if t == EXT else "Tabique")
        rep = api.geometry.add_wall_representation(f, context=cuerpo, length=largo + 2 * extra,
                                                   height=ALTO, thickness=t, offset=-t / 2)
        api.geometry.assign_representation(f, product=pared, representation=rep)
        dx, dy = (1, 0) if y0 == y1 else (0, 1)
        api.geometry.edit_object_placement(f, product=pared,
                                           matrix=matriz(x0 - dx * extra, y0 - dy * extra, 0, ang))
        contenidos.append(pared)
        for a, b, ante, dintel, tipo, nombre in aberturas:
            ancho, alto = b - a, dintel - ante
            ox, oy = x0 + dx * a, y0 + dy * a
            hueco = api.root.create_entity(f, ifc_class="IfcOpeningElement", name=nombre)
            rep = api.geometry.add_wall_representation(f, context=cuerpo, length=ancho, height=alto,
                                                       thickness=t + 0.1, offset=-(t + 0.1) / 2)
            api.geometry.assign_representation(f, product=hueco, representation=rep)
            api.geometry.edit_object_placement(f, product=hueco, matrix=matriz(ox, oy, ante, ang))
            api.feature.add_feature(f, feature=hueco, element=pared)
            if tipo == "pase":
                continue
            if tipo == "ventana":
                el = api.root.create_entity(f, ifc_class="IfcWindow", name=nombre)
                rep = api.geometry.add_window_representation(f, context=cuerpo, overall_height=alto,
                                                             overall_width=ancho)
                el.OverallHeight, el.OverallWidth = alto, ancho
            else:
                el = api.root.create_entity(f, ifc_class="IfcDoor", name=nombre)
                op = "DOUBLE_DOOR_SINGLE_SWING" if tipo == "porton" else "SINGLE_SWING_LEFT"
                rep = api.geometry.add_door_representation(f, context=cuerpo, overall_height=alto,
                                                           overall_width=ancho, operation_type=op)
                el.OverallHeight, el.OverallWidth = alto, ancho
            api.geometry.assign_representation(f, product=el, representation=rep)
            # el marco queda centrado en el espesor de la pared
            nx, ny = (0, -1) if y0 == y1 else (1, 0)   # normal en coordenadas del plano
            api.geometry.edit_object_placement(
                f, product=el, matrix=matriz(ox - nx * 0.05, oy - ny * 0.05, ante, ang))
            api.feature.add_filling(f, opening=hueco, element=el)
            contenidos.append(el)

    # locales (IfcSpace), con su zona como propiedad
    for amb in AMBIENTES:
        esp = api.root.create_entity(f, ifc_class="IfcSpace", name=amb["num"] or amb["nombre"])
        esp.LongName = amb["nombre"]
        items = [sb.extrude(sb.rectangle(size=(x1 - x0, y1 - y0), position=(x0, FONDO - y1)),
                            magnitude=ALTO) for x0, y0, x1, y1 in amb["rects"]]
        api.geometry.assign_representation(f, product=esp,
                                           representation=sb.get_representation(cuerpo, items))
        api.geometry.edit_object_placement(f, product=esp, matrix=np.eye(4))
        api.aggregate.assign_object(f, products=[esp], relating_object=planta)
        pset = api.pset.add_pset(f, product=esp, name="Casa_Negocio")
        api.pset.edit_pset(f, pset=pset, properties={"Zona": ZONAS[amb["zona"]],
                                                     "Area_m2": area(amb["rects"]),
                                                     "Uso": amb["info"]})

    # muebles
    for mid, nombre, zona, x0, y0, x1, y1, z, h, tipo, info in MUEBLES:
        el = caja("IfcFurniture", nombre, x0, y0, x1, y1, z, max(h, 0.01), tipo_obj=nombre)
        pset = api.pset.add_pset(f, product=el, name="Casa_Negocio")
        api.pset.edit_pset(f, pset=pset, properties={"Zona": ZONAS[zona], "Uso": info or nombre})
        contenidos.append(el)

    api.spatial.assign_container(f, products=contenidos, relating_structure=planta)
    f.write(destino)


def a_visor(aqui):
    """Mete los datos del modelo adentro de la pagina del visor."""
    with open(os.path.join(aqui, "modelo.json"), encoding="utf-8") as fh:
        datos = json.dumps(json.load(fh), ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(aqui, "visor_plantilla.html"), encoding="utf-8") as fh:
        pagina = fh.read().replace("__MODELO__", datos.replace("</", "<\\/"))
    with open(os.path.join(aqui, "visor.html"), "w", encoding="utf-8") as fh:
        fh.write(pagina)


if __name__ == "__main__":
    aqui = os.path.dirname(os.path.abspath(__file__))
    a_json(os.path.join(aqui, "modelo.json"))
    a_ifc(os.path.join(aqui, "casa-negocio.ifc"))
    a_visor(aqui)
    print("Listo: modelo.json, casa-negocio.ifc y visor.html")
