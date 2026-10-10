# -*- coding: utf-8 -*-
"""Bandeja de alertas: un HTML de un archivo, sin dependencias, para repartir.

No es un tablero de metricas. Es una bandeja de trabajo: cada fila es algo que
alguien tiene que hacer, con la evidencia adentro y el texto listo para enviar.

Colores de severidad: paleta de estado reservada (critica / alta / media /
resuelta). Siempre acompanados de icono y etiqueta, nunca color solo.
"""
import html, json

SEV = [('critica', 'Critica', '#d03b3b', '!'),
       ('alta', 'Alta', '#ec835a', '!'),
       ('media', 'Media', '#fab219', '~'),
       ('resuelta', 'Resuelta', '#0ca30c', 'v')]
SEV_COL = {k: c for k, _, c, _ in SEV}

CSS = """
*{box-sizing:border-box}
:root{
 color-scheme:light;
 --bg:#f9f9f7; --card:#fcfcfb; --ink:#0b0b0b; --ink2:#52514e; --mut:#898781;
 --line:#e1e0d9; --ring:rgba(11,11,11,.10); --accent:#2a78d6;
 --crit:#d03b3b; --alta:#ec835a; --media:#fab219; --ok:#0ca30c;
 --r:18px;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
 color-scheme:dark;
 --bg:#0d0d0d; --card:#1a1a19; --ink:#f0efec; --ink2:#c3c2b7; --mut:#898781;
 --line:#2c2c2a; --ring:rgba(255,255,255,.10); --accent:#3987e5;
}}
:root[data-theme="dark"]{
 color-scheme:dark;
 --bg:#0d0d0d; --card:#1a1a19; --ink:#f0efec; --ink2:#c3c2b7; --mut:#898781;
 --line:#2c2c2a; --ring:rgba(255,255,255,.10); --accent:#3987e5;
}
body{margin:0;background:var(--bg);color:var(--ink);
 font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;
 -webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:0 16px 72px}
header{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 82%,transparent);
 backdrop-filter:saturate(180%) blur(20px);border-bottom:1px solid var(--line);
 padding:14px 0 12px;margin-bottom:22px}
header .wrap{padding-bottom:0}
h1{font-size:21px;letter-spacing:-.02em;margin:0 0 2px;font-weight:650}
.sub{color:var(--mut);font-size:13px}
.kpis{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 20px}
.kpi{background:var(--card);border:1px solid var(--ring);border-radius:14px;
 padding:11px 15px;min-width:108px}
.kpi b{display:block;font-size:25px;letter-spacing:-.02em;line-height:1.15}
.kpi span{font-size:11.5px;color:var(--mut);text-transform:uppercase;letter-spacing:.05em}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 18px;
 max-width:100%;min-width:0;
 background:var(--card);border:1px solid var(--ring);border-radius:14px;padding:9px 11px}
.bar .lab{font-size:11.5px;color:var(--mut);text-transform:uppercase;
 letter-spacing:.05em;margin-right:2px}
.seg{display:inline-flex;background:color-mix(in srgb,var(--ink) 6%,transparent);
 border-radius:9px;padding:2px;max-width:100%;overflow-x:auto;
 scrollbar-width:none;-webkit-overflow-scrolling:touch}
.seg::-webkit-scrollbar{display:none}
.seg button{border:0;background:none;color:var(--ink2);font:inherit;font-size:13px;
 padding:5px 11px;border-radius:7px;cursor:pointer;white-space:nowrap}
.seg button[aria-pressed="true"]{background:var(--card);color:var(--ink);
 box-shadow:0 1px 3px rgba(0,0,0,.09);font-weight:550}
.grow{flex:1}
.lnk{border:0;background:none;color:var(--accent);font:inherit;font-size:13px;cursor:pointer;padding:5px 8px}
.a{background:var(--card);border:1px solid var(--ring);border-radius:var(--r);
 margin:0 0 10px;overflow:hidden}
.a>summary{list-style:none;cursor:pointer;padding:14px 16px;display:grid;
 grid-template-columns:auto 1fr auto;gap:13px;align-items:start}
.a>summary::-webkit-details-marker{display:none}
.dot{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;
 font-size:13px;font-weight:700;color:#fff;margin-top:1px;flex:0 0 auto}
.ttl{font-weight:560;letter-spacing:-.01em}
.meta{color:var(--mut);font-size:12.5px;margin-top:3px}
.meta b{color:var(--ink2);font-weight:550}
.tag{display:inline-block;font-size:11px;padding:2px 7px;border-radius:6px;
 border:1px solid var(--ring);color:var(--ink2);margin-right:5px;white-space:nowrap}
.right{text-align:right;font-size:12.5px;color:var(--mut);white-space:nowrap}
.val{font-size:19px;font-weight:620;color:var(--ink);letter-spacing:-.02em;
 font-variant-numeric:tabular-nums}
.body{padding:0 16px 16px;border-top:1px solid var(--line);margin-top:2px;padding-top:14px}
.row{display:grid;grid-template-columns:150px 1fr;gap:4px 14px;font-size:13.5px;
 padding:5px 0;border-bottom:1px solid var(--line)}
.row:last-child{border:0}
.row span:first-child{color:var(--mut)}
.row span:last-child{overflow-wrap:anywhere}
.acc{background:color-mix(in srgb,var(--accent) 7%,transparent);
 border-left:3px solid var(--accent);padding:10px 13px;border-radius:0 9px 9px 0;
 font-size:13.5px;margin:13px 0}
.acc b{display:block;font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;
 color:var(--mut);margin-bottom:3px}
.tw{overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:11px;
 border:1px solid var(--line);border-radius:10px}
table{width:100%;border-collapse:collapse;font-size:12.5px;min-width:520px}
th:first-child,td:first-child{padding-left:12px}
th,td{text-align:left;padding:6px 9px;border-bottom:1px solid var(--line);
 white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
tbody tr:last-child td{border-bottom:0}
th{color:var(--mut);font-weight:550;font-size:11px;text-transform:uppercase;
 letter-spacing:.04em}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
tbody tr:hover{background:color-mix(in srgb,var(--ink) 3.5%,transparent)}
.spark{margin-top:11px}
.h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);
 margin:26px 0 9px;font-weight:600}
.empty{color:var(--mut);padding:26px;text-align:center;background:var(--card);
 border:1px dashed var(--ring);border-radius:var(--r)}
.foot{color:var(--mut);font-size:12px;margin-top:30px;line-height:1.7;
 border-top:1px solid var(--line);padding-top:16px}
.cp{border:1px solid var(--ring);background:var(--card);color:var(--ink2);
 font:inherit;font-size:12px;padding:5px 10px;border-radius:8px;cursor:pointer;margin-top:11px}
.cp:hover{color:var(--ink)}
@media(max-width:720px){
 .a>summary{grid-template-columns:auto 1fr;}
 .right{grid-column:2;text-align:left;margin-top:5px}
 .row{grid-template-columns:1fr}
 .row span:first-child{font-size:11.5px;text-transform:uppercase;letter-spacing:.04em}
}
"""

JS = """
const A=__ALERTAS__;
const F={sev:'todas',nodo:'todos',estado:'activas'};
const SEVCOL={critica:'var(--crit)',alta:'var(--alta)',media:'var(--media)'};
const SEVICO={critica:'!',alta:'!',media:'~'};
const ORD={critica:0,alta:1,media:2};
function esc(s){const d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML}
function sparkline(serie){
  if(!serie||serie.length<3)return '';
  const v=serie.map(p=>p.cola),W=560,H=54,P=4;
  const mx=Math.max(...v)||1;
  const x=i=>P+i*(W-2*P)/(v.length-1), y=k=>H-P-(k/mx)*(H-2*P);
  const d=v.map((k,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(k).toFixed(1)).join(' ');
  return '<svg class="spark" viewBox="0 0 '+W+' '+H+'" width="100%" height="'+H+
   '" role="img" aria-label="cola por semana"><path d="'+d+
   '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>'+
   v.map((k,i)=>'<circle cx="'+x(i).toFixed(1)+'" cy="'+y(k).toFixed(1)+
     '" r="3" fill="var(--accent)"><title>'+esc(serie[i].dia)+': '+k+
     ' lineas</title></circle>').join('')+
   '<text x="'+P+'" y="12" font-size="10" fill="var(--mut)">max '+mx+'</text></svg>';
}
function tabla(filas){
  if(!filas||!filas.length)return '';
  const cols=Object.keys(filas[0]);
  return '<div class="tw"><table><thead><tr>'+cols.map(c=>'<th class="'+
    (typeof filas[0][c]==='number'?'n':'')+'">'+esc(c.replace(/_/g,' '))+'</th>').join('')+
    '</tr></thead><tbody>'+filas.map(f=>'<tr>'+cols.map(c=>'<td class="'+
    (typeof f[c]==='number'?'n':'')+'">'+esc(Array.isArray(f[c])?f[c].join(', '):f[c])+
    '</td>').join('')+'</tr></tbody>').join('')+'</table></div>';
}
function detalle(a){
  const e=a.evidencia||{};
  let h='';
  const det=e.detalle, serie=e.serie_semanal;
  for(const k of Object.keys(e)){
    if(k==='detalle'||k==='serie_semanal')continue;
    let v=e[k];
    if(Array.isArray(v))v=v.join(', ');
    if(v===null||v==='')v='-';
    h+='<div class="row"><span>'+esc(k.replace(/_/g,' '))+'</span><span>'+esc(v)+'</span></div>';
  }
  h+='<div class="acc"><b>Accion sugerida</b>'+esc(a.accion)+'</div>';
  h+='<div class="row"><span>responsable</span><span>'+esc(a.responsable)+'</span></div>';
  h+='<div class="row"><span>regla / umbral</span><span>'+esc(a.regla)+' - '+
     esc(a.regla_nombre)+' (umbral '+esc(a.umbral)+')</span></div>';
  h+='<div class="row"><span>detectada</span><span>'+esc(a.detectada)+
     ' - vista '+esc(a.veces_vista)+' vez(ces)</span></div>';
  if(serie)h+=sparkline(serie);
  if(det)h+=tabla(det);
  h+='<button class="cp" data-id="'+esc(a.id)+'">Copiar para enviar</button>';
  return h;
}
function texto(a){
  const e=a.evidencia||{};
  const l=['['+a.severidad.toUpperCase()+'] '+a.titulo,
    'Alerta '+a.id+' - regla '+a.regla+' ('+a.regla_nombre+')',
    'Nodo: '+a.nodo+'   Responsable: '+a.responsable,
    'Detectada: '+a.detectada+'   Valor: '+a.valor+'   Umbral: '+a.umbral,'','Evidencia:'];
  for(const k of Object.keys(e)){
    if(k==='detalle'||k==='serie_semanal')continue;
    l.push('  - '+k.replace(/_/g,' ')+': '+(Array.isArray(e[k])?e[k].join(', '):e[k]));
  }
  if(e.detalle&&e.detalle.length){
    l.push('','Detalle (primeros '+Math.min(10,e.detalle.length)+'):');
    e.detalle.slice(0,10).forEach(d=>l.push('  - '+Object.values(d).join(' | ')));
  }
  l.push('','Accion sugerida: '+a.accion);
  return l.join('\\n');
}
function pintar(){
  const cont=document.getElementById('lista');
  let xs=A.filter(a=>{
    if(F.sev!=='todas'&&a.severidad!==F.sev)return false;
    if(F.nodo!=='todos'&&a.nodo!==F.nodo)return false;
    if(F.estado==='activas'&&a.estado==='resuelta')return false;
    if(F.estado==='nuevas'&&a.estado!=='nueva')return false;
    if(F.estado==='notificar'&&!a.notificar)return false;
    return true;
  });
  xs.sort((p,q)=>(ORD[p.severidad]-ORD[q.severidad])||(q.veces_vista-p.veces_vista));
  document.getElementById('cnt').textContent=xs.length+' de '+A.length+' alertas';
  if(!xs.length){cont.innerHTML='<div class="empty">Ninguna alerta con estos filtros.</div>';return}
  let h='',reg='';
  for(const a of xs){
    if(a.regla!==reg){reg=a.regla;
      h+='<div class="h2">'+esc(a.regla)+' &middot; '+esc(a.regla_nombre)+'</div>';}
    h+='<details class="a"><summary>'+
      '<span class="dot" style="background:'+(SEVCOL[a.severidad]||'var(--media)')+'">'+
      (SEVICO[a.severidad]||'~')+'</span>'+
      '<span><span class="ttl">'+esc(a.titulo)+'</span>'+
      '<div class="meta"><span class="tag">'+esc(a.severidad)+'</span>'+
      '<span class="tag">'+esc(a.nodo)+'</span>'+
      (a.agregada?'<span class="tag">agrupada</span>':'')+
      (a.estado==='nueva'?'<span class="tag">nueva</span>':'')+
      (a.semanas&&a.semanas.length>2?'<span class="tag">'+a.semanas.length+' semanas</span>':'')+
      ' <b>'+esc(a.responsable)+'</b></div></span>'+
      '<span class="right"><span class="val">'+esc(a.valor)+'</span><br>umbral '+esc(a.umbral)+'</span>'+
      '</summary><div class="body">'+detalle(a)+'</div></details>';
  }
  cont.innerHTML=h;
  cont.querySelectorAll('.cp').forEach(b=>b.onclick=ev=>{
    ev.preventDefault();
    const a=A.find(x=>x.id===b.dataset.id);
    const t=texto(a);
    (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject())
      .then(()=>{b.textContent='Copiado';setTimeout(()=>b.textContent='Copiar para enviar',1600)})
      .catch(()=>{const ta=document.createElement('textarea');ta.value=t;
        document.body.appendChild(ta);ta.select();
        try{document.execCommand('copy');b.textContent='Copiado'}catch(e){b.textContent='No se pudo copiar'}
        ta.remove();setTimeout(()=>b.textContent='Copiar para enviar',1600)});
  });
}
function segmento(id,clave,opciones){
  const el=document.getElementById(id);
  el.innerHTML=opciones.map(o=>'<button aria-pressed="'+(F[clave]===o[0])+
    '" data-v="'+esc(o[0])+'">'+esc(o[1])+'</button>').join('');
  el.onclick=ev=>{const b=ev.target.closest('button');if(!b)return;
    F[clave]=b.dataset.v;
    el.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));
    pintar();};
}
document.addEventListener('DOMContentLoaded',()=>{
  segmento('fsev','sev',[['todas','Todas'],['critica','Criticas'],['alta','Altas'],['media','Medias']]);
  const nodos=[...new Set(A.map(a=>a.nodo))].sort();
  segmento('fnodo','nodo',[['todos','Todos']].concat(nodos.map(n=>[n,n])));
  segmento('festado','estado',[['activas','Activas'],['nuevas','Nuevas'],
    ['notificar','A notificar'],['todas','Con resueltas']]);
  document.getElementById('tema').onclick=()=>{
    const r=document.documentElement;
    r.dataset.theme=r.dataset.theme==='dark'?'light':'dark';};
  pintar();
});
"""


def render(alertas, resumen, modelo, cfg):
    livianas = []
    for a in alertas:
        b = {k: v for k, v in a.items() if k != 'historial'}
        ev = dict(b.get('evidencia') or {})
        if 'detalle' in ev:
            ev['detalle'] = ev['detalle'][:40]
        b['evidencia'] = ev
        livianas.append(b)
    datos = json.dumps(livianas, ensure_ascii=False, default=str)
    rs = resumen
    sev = rs.get('por_severidad', {})
    kpis = [
        (rs['alertas'], 'alertas'),
        (sev.get('critica', 0), 'criticas'),
        (sev.get('alta', 0), 'altas'),
        (rs['nuevas'], 'nuevas'),
        (rs['a_notificar'], 'a notificar'),
        (len(modelo.uts), 'UT en la ventana'),
    ]
    k = ''.join('<div class="kpi"><b>%s</b><span>%s</span></div>' % (v, n)
                for v, n in kpis)
    return """<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Control Tower - Bandeja de alertas</title>
<style>%s</style></head><body>
<header><div class="wrap">
<h1>OI Control Tower &middot; bandeja de alertas</h1>
<div class="sub">Corte %s &middot; <span id="cnt"></span> &middot;
 cada fila es una accion con responsable, no un indicador</div>
</div></header>
<div class="wrap">
<div class="kpis">%s</div>
<div class="bar"><span class="lab">Severidad</span><span class="seg" id="fsev"></span>
<span class="lab">Nodo</span><span class="seg" id="fnodo"></span></div>
<div class="bar"><span class="lab">Estado</span><span class="seg" id="festado"></span>
<span class="grow"></span><button class="lnk" id="tema">Tema</button></div>
<div id="lista"></div>
<div class="foot">
Motor de alertas del circuito 1060. Las severidades y umbrales salen de
<code>engine/reglas.yaml</code> y cada alerta lleva adentro el umbral que se le
aplico, para poder discutirla. Los umbrales de esta corrida son una propuesta
calibrada sobre la ventana observada: hay que validarlos con el responsable de
cada nodo antes de encender notificaciones automaticas.<br>
La referencia de cada etapa no es el promedio general sino la mediana de los
envios que llegaron en fecha: el promedio ya viene contaminado por los que se
pasan y volveria el umbral mas indulgente de lo que corresponde.
</div>
</div>
<script>%s</script></body></html>""" % (
        CSS, html.escape(rs['corte']), k, JS.replace('__ALERTAS__', datos))
