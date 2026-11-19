#!/usr/bin/env node
/**
 * Generador de la vista del tablero Trello.
 *
 * Lee data/tablero-trello.json (fuente de verdad) y produce site/trello.html.
 * Aquí no se escribe contenido: solo la presentación. Los totales se
 * recalculan desde las tarjetas y se comparan con los del JSON.
 *
 * Uso:  node build/generar-trello.js
 */

const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const ORIGEN = path.join(RAIZ, "data", "tablero-trello.json");
const SALIDA = path.join(RAIZ, "site", "trello.html");

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const esc = (v) =>
  String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function fechaLarga(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return iso || "";
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
}

function diaSemana(iso) {
  return DIAS[new Date(`${iso}T12:00:00`).getDay()];
}

const capitalizar = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ------------------------------------------------------------------ */
/* Datos                                                               */
/* ------------------------------------------------------------------ */

const spec = JSON.parse(fs.readFileSync(ORIGEN, "utf8"));
const etiquetas = Object.fromEntries(spec.etiquetas.map((e) => [e.id, e]));
const listas = spec.listas;
const tarjetas = spec.tarjetas;

const historias = tarjetas.filter((t) => t.estimacionPuntos != null);
const puntos = historias.reduce((n, t) => n + t.estimacionPuntos, 0);
const horas = historias.reduce((n, t) => n + t.tiempoEstimadoHoras, 0);
const items = tarjetas.flatMap((t) => (t.checklists || []).flatMap((c) => c.items));
const itemsHechos = items.filter((i) => i.hecho).length;

// Consistencia: los totales del JSON deben coincidir con los de las tarjetas.
const avisos = [];
if (spec.totales.puntos !== puntos) avisos.push(`puntos: JSON ${spec.totales.puntos} vs tarjetas ${puntos}`);
if (spec.totales.horasDesarrollo !== horas) avisos.push(`horas: JSON ${spec.totales.horasDesarrollo} vs tarjetas ${horas}`);
if (spec.totales.historias !== historias.length) avisos.push(`historias: JSON ${spec.totales.historias} vs tarjetas ${historias.length}`);

/* ------------------------------------------------------------------ */
/* Bloques                                                             */
/* ------------------------------------------------------------------ */

function etiquetasHtml(ids) {
  if (!ids || !ids.length) return '<span class="tb-sin">Sin etiquetas</span>';
  return ids
    .map((id) => `<span class="tb-etiqueta tb-${esc(id)}">${esc(etiquetas[id].nombre)}</span>`)
    .join(" ");
}

function checklistHtml(c) {
  const hechos = c.items.filter((i) => i.hecho).length;
  const filas = c.items
    .map(
      (i) =>
        `<li><span class="tb-marca ${i.hecho ? "hecho" : "pendiente"}">${i.hecho ? "Hecho" : "Pendiente"}</span> <span>${esc(i.texto)}</span></li>`
    )
    .join("\n");
  return `<h5>${esc(c.titulo)} · ${hechos} de ${c.items.length}</h5>
<ul class="tb-checklist">
${filas}
</ul>`;
}

function tarjetaHtml(t) {
  const id = esc(t.id);
  const meta = [
    ["Lista", listas.find((l) => l.id === t.lista).nombre],
    ["Miembro", t.miembro || "Sin asignar"],
    ["Vence", t.vence ? `${fechaLarga(t.vence)} (${diaSemana(t.vence)})` : "Sin fecha"],
  ];
  if (t.estimacionPuntos != null) meta.push(["Estimación", `${t.estimacionPuntos} puntos de historia`]);
  if (t.tiempoEstimadoHoras != null) meta.push(["Tiempo estimado", `${t.tiempoEstimadoHoras} horas`]);
  if (t.prioridad) meta.push(["Prioridad", capitalizar(t.prioridad)]);
  if (t.valorNegocio) meta.push(["Valor de negocio", t.valorNegocio]);

  const cuerpo = t.historia ? t.historia : t.descripcion || "";
  const checklists = (t.checklists || []).map(checklistHtml).join("\n");
  const comentarios = (t.comentarios || []).length
    ? `<h5>Comentarios · ${t.comentarios.length}</h5>
<ul class="tb-comentarios">
${t.comentarios.map((c) => `<li><strong>${esc(c.autor)}</strong>: ${esc(c.texto)}</li>`).join("\n")}
</ul>`
    : "";

  return `<article class="tb-tarjeta" id="${id}" aria-labelledby="${id}-titulo">
<h4 id="${id}-titulo">${esc(t.titulo)}</h4>
<div class="tb-etiquetas">${etiquetasHtml(t.etiquetas)}</div>
<dl class="tb-meta">
${meta.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("\n")}
</dl>
<p>${esc(cuerpo)}</p>
${checklists}
${comentarios}
</article>`;
}

function columnaHtml(l) {
  const cards = tarjetas.filter((t) => t.lista === l.id);
  const cuerpo = cards.length
    ? cards.map(tarjetaHtml).join("\n")
    : '<p class="tb-vacia">Sin tarjetas.</p>';
  return `<section class="tb-columna" aria-labelledby="col-${esc(l.id)}">
<h3 id="col-${esc(l.id)}">${esc(l.nombre)} <span class="tb-conteo">(${cards.length})</span></h3>
${cuerpo}
</section>`;
}

function tablaResumenHtml() {
  const filas = historias
    .map(
      (t) => `<tr>
<td>${esc(t.titulo)}</td>
<td>${esc(t.miembro)}</td>
<td>${esc(capitalizar(t.prioridad))}</td>
<td>${t.estimacionPuntos}</td>
<td>${t.tiempoEstimadoHoras} horas</td>
<td>${esc(fechaLarga(t.vence))}</td>
<td>${esc(listas.find((l) => l.id === t.lista).nombre)}</td>
<td>${t.estado === "hecho" ? "Hecho" : "Pendiente"}</td>
</tr>`
    )
    .join("\n");
  return `<div class="tabla-envoltura"><table>
<caption>Historias del Sprint 1</caption>
<thead><tr>
<th scope="col">Historia de usuario</th>
<th scope="col">Miembro</th>
<th scope="col">Prioridad</th>
<th scope="col">Puntos</th>
<th scope="col">Tiempo estimado</th>
<th scope="col">Vence</th>
<th scope="col">Lista</th>
<th scope="col">Estado</th>
</tr></thead>
<tbody>
${filas}
<tr class="tb-total">
<th scope="row" colspan="3">Total del Sprint 1</th>
<td>${puntos}</td>
<td>${horas} horas</td>
<td colspan="3"></td>
</tr>
</tbody>
</table></div>`;
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

function pagina() {
  const t = spec.totales;
  const listasHtml = listas.map((l) => `<li>${esc(l.nombre)}</li>`).join("\n");
  const leyenda = spec.etiquetas
    .map((e) => `<li><span class="tb-etiqueta tb-${esc(e.id)}">${esc(e.nombre)}</span> · ${esc(e.color)}</li>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(spec.titulo)} · Proyecto Integrador T1</title>
<meta name="description" content="Especificación del tablero Trello del Sprint 1 de StockFlow, con listas, etiquetas, tarjetas, checklists y comentarios.">
<link rel="stylesheet" href="assets/estilos.css">
</head>
<body>
<a class="salto" href="#contenido">Saltar al contenido</a>

<header class="cabecera">
  <div class="contenedor">
    <a class="marca" href="index.html">Proyecto Integrador T1 <span>· Tablero Trello</span></a>
    <span class="meta">${esc(spec.tablero)}</span>
  </div>
</header>

<main id="contenido">
<div class="portada-indice">
  <div class="contenedor">
    <p class="etiqueta">Sprint 1 · Scrum</p>
    <h1>${esc(spec.titulo)}</h1>
    <p class="bajada">${esc(spec.nota)}</p>
    <dl class="datos">
      <div><dt>Tablero</dt><dd>${esc(spec.tablero)}</dd></div>
      <div><dt>Tarjetas</dt><dd>${tarjetas.length}</dd></div>
      <div><dt>Actualizado</dt><dd>${esc(fechaLarga(spec.actualizado))}</dd></div>
      <div><dt>Checklists</dt><dd>${itemsHechos} de ${items.length} ítems</dd></div>
    </dl>
  </div>
</div>

<div class="contenedor tb-contenido">
  <section aria-labelledby="listas-etiquetas">
    <h2 id="listas-etiquetas">Listas y etiquetas</h2>
    <div class="tb-doble">
      <div>
        <h3>Listas, en orden</h3>
        <ol class="tb-listas">
${listasHtml}
        </ol>
      </div>
      <div>
        <h3>Etiquetas</h3>
        <ul class="tb-leyenda">
${leyenda}
        </ul>
      </div>
    </div>
  </section>

  <section aria-labelledby="resumen">
    <h2 id="resumen">Resumen del Sprint 1</h2>
    <dl class="datos tb-totales">
      <div><dt>Historias</dt><dd>${historias.length}</dd></div>
      <div><dt>Puntos de historia</dt><dd>${puntos}</dd></div>
      <div><dt>Horas de desarrollo</dt><dd>${horas}</dd></div>
      <div><dt>Esfuerzo total del Sprint</dt><dd>${t.horasEsfuerzoTotalSprint} horas</dd></div>
      <div><dt>Daily Scrum</dt><dd>${t.dailyScrum} sesiones</dd></div>
    </dl>
    ${tablaResumenHtml()}
  </section>

  <section aria-labelledby="tablero">
    <h2 id="tablero">Tablero</h2>
    <p class="tb-nota">Cada tarjeta muestra su lista, miembro, fecha, etiquetas, checklists y comentarios. Las marcas «Hecho» y «Pendiente» van en texto, no solo en color. Las figuras 1 y 2 del informe se toman de este tablero: la especificación de ambas está en <a href="incremento.html">Incremento del producto</a>.</p>
    <div class="tb-tablero">
${listas.map(columnaHtml).join("\n")}
    </div>
  </section>
</div>
</main>

<footer class="pie">
  <div class="contenedor">
    <span>Proyecto Integrador · SPTI02423 · Cibertec · Sección T6HO</span>
    <a href="index.html">Volver al índice</a>
  </div>
</footer>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */

fs.writeFileSync(SALIDA, pagina(), "utf8");
console.log(`site/trello.html  (${tarjetas.length} tarjetas, ${historias.length} historias, ${itemsHechos}/${items.length} ítems de checklist)`);
if (avisos.length) {
  console.warn(`Avisos de consistencia: ${avisos.join("; ")}`);
  process.exitCode = 1;
}
