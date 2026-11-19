#!/usr/bin/env node
/**
 * Generador de la vista del incremento del producto.
 *
 * Lee data/incremento.json (fuente de verdad) y produce site/incremento.html.
 * El estado de cada figura no se escribe a mano: se calcula comprobando si
 * el archivo existe en site/assets/evidencias/. Si existe, se muestra la
 * captura con su pie; si no, se muestra el marco pendiente con las tomas.
 *
 * Uso:  node build/generar-incremento.js
 */

const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const ORIGEN = path.join(RAIZ, "data", "incremento.json");
const TABLERO = path.join(RAIZ, "data", "tablero-trello.json");
const SALIDA = path.join(RAIZ, "site", "incremento.html");
const EVIDENCIAS_REL = "assets/evidencias";

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

function fechaLarga(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return iso || "";
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
}

/* ------------------------------------------------------------------ */
/* Datos                                                               */
/* ------------------------------------------------------------------ */

const spec = JSON.parse(fs.readFileSync(ORIGEN, "utf8"));
const figuras = spec.figuras;
const carpetaAbs = path.join(RAIZ, "site", EVIDENCIAS_REL);

/* El tablero es la fuente de verdad de las figuras 1 y 2: los mockups
   se construyen con las tarjetas reales, no con texto copiado a mano. */
const tablero = fs.existsSync(TABLERO)
  ? JSON.parse(fs.readFileSync(TABLERO, "utf8"))
  : { listas: [], etiquetas: [], tarjetas: [] };

figuras.forEach((f) => {
  f.rutaRel = `${EVIDENCIAS_REL}/${f.archivo}`;
  f.existe = fs.existsSync(path.join(carpetaAbs, f.archivo));
});

const capturadas = figuras.filter((f) => f.existe).length;
const pendientes = figuras.length - capturadas;

/* Consistencia: la numeración del pie debe coincidir con el campo numero. */
const avisos = [];
figuras.forEach((f) => {
  const esperado = `Figura ${f.numero}.`;
  if (!f.pie.startsWith(esperado)) {
    avisos.push(`${f.id}: el pie no empieza con "${esperado}"`);
  }
  if (figuras.filter((o) => o.numero === f.numero).length > 1) {
    avisos.push(`${f.id}: número de figura repetido (${f.numero})`);
  }
});

/* Consistencia: los movimientos de demostración deben apuntar a productos
   y figuras que existan en este mismo archivo. */
const skus = new Set(spec.datasetDemo.productos.map((p) => p.sku));
const idsFigura = new Set(figuras.map((f) => f.id));
spec.datasetDemo.movimientos.forEach((m) => {
  if (!skus.has(m.sku)) avisos.push(`movimiento ${m.orden}: el SKU ${m.sku} no está en el dataset`);
  if (!idsFigura.has(m.figura)) avisos.push(`movimiento ${m.orden}: la figura ${m.figura} no existe`);
});

/* ------------------------------------------------------------------ */
/* Bloques                                                             */
/* ------------------------------------------------------------------ */

function historiaMarca(id) {
  return `<span class="fig-hu">${esc(id)}</span>`;
}

/* ------------------------------------------------------------------ */
/* Muestras: cómo debería verse cada captura                           */
/* ------------------------------------------------------------------ */

const etiquetaTrello = (id) => {
  const e = (tablero.etiquetas || []).find((x) => x.id === id);
  return e ? { nombre: e.nombre, clase: `mk-et-${e.id}` } : null;
};

function mockTrelloCard(t) {
  const etiquetas = (t.etiquetas || [])
    .map((id) => {
      const e = etiquetaTrello(id);
      return e ? `<span class="mk-et ${e.clase}">${esc(e.nombre)}</span>` : "";
    })
    .join("");
  const iniciales = (t.miembro || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
  const hechos = (t.checklists || []).reduce(
    (n, c) => n + c.items.filter((i) => i.hecho).length,
    0
  );
  const total = (t.checklists || []).reduce((n, c) => n + c.items.length, 0);
  const progreso = total ? Math.round((hechos / total) * 100) : 0;

  return `<div class="mk-tarjeta">
<div class="mk-etiquetas">${etiquetas}</div>
<p class="mk-titulo">${esc(t.titulo)}</p>
<div class="mk-tarjeta-pie">
<span class="mk-avatar" title="${esc(t.miembro || "")}">${esc(iniciales)}</span>
${total ? `<span class="mk-progreso">☑ ${hechos}/${total}</span>` : ""}
</div>
</div>`;
}

function mockTablero(m) {
  const listas = tablero.listas || [];
  const columnas = listas
    .map((l) => {
      const tarjetas = (tablero.tarjetas || []).filter((t) => t.lista === l.id);
      const cuerpo = tarjetas.length
        ? tarjetas.map(mockTrelloCard).join("\n")
        : `<p class="mk-vacia">Sin tarjetas</p>`;
      return `<div class="mk-lista">
<p class="mk-lista-nombre">${esc(l.nombre)} <span>${tarjetas.length}</span></p>
${cuerpo}
</div>`;
    })
    .join("\n");

  return `<div class="mk-navegador mk-navegador-trello">
<div class="mk-barra"><span class="mk-punto"></span><span class="mk-punto"></span><span class="mk-punto"></span>
<span class="mk-url">trello.com/b/stockflow-sprint-1</span></div>
<div class="mk-tablero-cab">
<p class="mk-tablero-titulo">${esc(tablero.tablero || "StockFlow · Sprint 1")}</p>
<p class="mk-tablero-sub">Sprint 1 · cierre 13/11/2026</p>
</div>
<div class="mk-tablero">
${columnas}
</div>
</div>
<p class="mk-pista">${esc(m.pista || "")}</p>`;
}

function mockTarjeta(m) {
  const t = (tablero.tarjetas || []).find((x) => x.id === m.tarjetaId);
  if (!t) return `<p class="mk-pista">No se encontró la tarjeta ${esc(m.tarjetaId)} en tablero-trello.json.</p>`;

  const etiquetas = (t.etiquetas || [])
    .map((id) => {
      const e = etiquetaTrello(id);
      return e ? `<span class="mk-et ${e.clase}">${esc(e.nombre)}</span>` : "";
    })
    .join(" ");

  const listas = (t.checklists || [])
    .map((c) => {
      const hechos = c.items.filter((i) => i.hecho).length;
      const items = c.items
        .map(
          (i) => `<li>
<span class="mk-check ${i.hecho ? "hecho" : "pendiente"}">${i.hecho ? "✓" : ""}</span>
<span>${esc(i.texto)}</span>
</li>`
        )
        .join("\n");
      return `<div class="mk-checklist">
<p class="mk-checklist-titulo">${esc(c.titulo)} <span>${hechos}/${c.items.length}</span></p>
<ul>${items}</ul>
</div>`;
    })
    .join("\n");

  const comentarios = (t.comentarios || []).length
    ? `<div class="mk-checklists"><p class="mk-checklist-titulo">Comentarios</p>
${t.comentarios
  .map(
    (c) => `<div class="mk-comentario">
<p class="mk-comentario-autor">${esc(c.autor)}</p>
<p>${esc(c.texto)}</p>
</div>`
  )
  .join("\n")}
</div>`
    : "";

  return `<div class="mk-navegador mk-navegador-trello">
<div class="mk-barra"><span class="mk-punto"></span><span class="mk-punto"></span><span class="mk-punto"></span>
<span class="mk-url">trello.com/c/hu-03</span></div>
<div class="mk-modal">
<div class="mk-modal-etiquetas">${etiquetas}</div>
<h4 class="mk-modal-titulo">${esc(t.titulo)}</h4>
<div class="mk-modal-cols">
<div class="mk-modal-principal">
<p class="mk-rotulo">Descripción</p>
<p class="mk-descripcion">${esc(t.historia || "")}</p>
${listas}
${comentarios}
</div>
<aside class="mk-modal-lateral">
<p class="mk-rotulo">En la lista</p>
<p class="mk-valor">Done</p>
<p class="mk-rotulo">Miembros</p>
<p class="mk-valor"><span class="mk-avatar">${esc(
    (t.miembro || "").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("")
  )}</span> ${esc(t.miembro || "")}</p>
<p class="mk-rotulo">Fecha de vencimiento</p>
<p class="mk-valor">${esc(
    (t.vence || "").split("-").reverse().join("/")
  )}<span class="mk-vencido">completa</span></p>
<p class="mk-rotulo">Etiquetas</p>
<p class="mk-valor">${etiquetas}</p>
</aside>
</div>
</div>
</div>
<p class="mk-pista">${esc(m.pista || "")}</p>`;
}

function mockModelo(m) {
  const tablas = (m.tablas || [])
    .map(
      (t) => `<div class="mk-tabla-bd">
<p class="mk-tabla-bd-nombre">${esc(t.nombre)}</p>
<table class="mk-tabla-bd-campos">
<tbody>
${t.columnas
  .map(
    (c) => `<tr>
<td class="mk-campo">${esc(c.campo)}</td>
<td class="mk-tipo">${esc(c.tipo)}</td>
<td class="mk-marca">${esc(c.marca || "")}</td>
</tr>`
  )
  .join("\n")}
</tbody>
</table>
</div>`
    )
    .join('<div class="mk-flecha" aria-hidden="true">→</div>');

  return `<div class="mk-navegador mk-navegador-diagrama">
<div class="mk-barra"><span class="mk-punto"></span><span class="mk-punto"></span><span class="mk-punto"></span>
<span class="mk-url">StockFlow · modelo de datos</span></div>
<div class="mk-diagrama">
${tablas}
</div>
<p class="mk-leyenda">PK = clave primaria · FK = clave foránea · UNIQUE = valor único</p>
</div>
<p class="mk-pista">${esc(m.pista || "")}</p>`;
}

function mockLogin(m) {
  const campos = (m.campos || [])
    .map(
      (c) => `<label class="mk-campo-grupo">
<span>${esc(c.etiqueta)}</span>
<input type="${esc(c.tipo || "text")}" value="${esc(c.valor)}" readonly tabindex="-1">
</label>`
    )
    .join("\n");

  return `<div class="mk-navegador">
<div class="mk-barra"><span class="mk-punto"></span><span class="mk-punto"></span><span class="mk-punto"></span>
<span class="mk-url">localhost:3000/login</span></div>
<div class="mk-pantalla mk-pantalla-login">
<div class="mk-app">
<div class="mk-app-marca">
<p class="mk-app-nombre">${esc(m.producto || "StockFlow")}</p>
<p class="mk-app-lema">${esc(m.lema || "")}</p>
</div>
<form class="mk-form mk-form-angosto">
${campos}
<p class="mk-aviso error" role="status">${esc(m.error)}</p>
<button type="button" class="mk-boton">${esc(m.boton || "Ingresar")}</button>
</form>
</div>
</div>
</div>
<p class="mk-pista">${esc(m.pista || "")}</p>`;
}

function mockCatalogo(m, dataset) {
  const campos = (m.formulario?.campos || [])
    .map(
      (c) => `<label class="mk-campo-grupo">
<span>${esc(c.etiqueta)}</span>
<input type="text" value="${esc(c.valor)}" readonly tabindex="-1">
</label>`
    )
    .join("\n");

  const filas = (dataset?.productos || [])
    .map(
      (p) => `<tr>
<td>${esc(p.sku)}</td>
<td>${esc(p.nombre)}</td>
<td>${esc(p.categoria)}</td>
<td>${p.stockActual}</td>
<td>${p.stockMinimo}</td>
<td>${p.estado === "Stock Crítico" ? '<span class="mk-critico">Stock Crítico</span>' : '<span class="mk-disponible">Disponible</span>'}</td>
</tr>`
    )
    .join("\n");

  const columnas = (m.tabla?.columnas || [])
    .map((c) => `<th scope="col">${esc(c)}</th>`)
    .join("");

  return `<div class="mk-navegador">
<div class="mk-barra"><span class="mk-punto"></span><span class="mk-punto"></span><span class="mk-punto"></span>
<span class="mk-url">localhost:3000/productos</span></div>
<div class="mk-pantalla">
<div class="mk-app">
<div class="mk-app-cab">
<p class="mk-app-nombre">${esc(m.producto || "StockFlow")}</p>
<p class="mk-app-vista">${esc(m.tituloVista || "")}</p>
</div>
<div class="mk-panel">
<p class="mk-panel-titulo">${esc(m.formulario?.titulo || "")}</p>
<div class="mk-form mk-form-ancho">
${campos}
</div>
<button type="button" class="mk-boton">${esc(m.formulario?.boton || "Guardar")}</button>
</div>
<div class="mk-panel">
<div class="mk-panel-cab">
<p class="mk-panel-titulo">${esc(m.tabla?.titulo || "")}</p>
<input class="mk-buscador" type="search" value="" placeholder="${esc(m.tabla?.busqueda || "Buscar…")}" readonly tabindex="-1">
</div>
<table class="mk-tabla">
<thead><tr>${columnas}</tr></thead>
<tbody>
${filas}
</tbody>
</table>
</div>
</div>
</div>
</div>
<p class="mk-pista">${esc(m.pista || "")}</p>`;
}

function mockMovimientos(m) {
  const columnas = (m.kardex?.columnas || [])
    .map((c) => `<th scope="col">${esc(c)}</th>`)
    .join("");

  const paneles = (m.paneles || [])
    .map((p) => {
      const filas = (p.filas || [])
        .map(
          (f) =>
            `<tr>${f.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`
        )
        .join("\n");
      const nueva = p.filaNueva
        ? `<tr class="mk-fila-nueva">${p.filaNueva.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`
        : "";
      const etiqueta = p.tipo === "Entrada" ? "Entrada" : "Salida";
      const claseTipo = p.tipo === "Entrada" ? "entrada" : "salida";

      return `<div class="mk-panel-mov">
<p class="mk-rotulo-panel">${esc(p.rotulo)} ${esc(etiqueta)} de ${esc(p.cantidad)} unidades</p>
<div class="mk-app mk-app-compacta">
<div class="mk-app-cab">
<p class="mk-app-nombre">${esc(m.producto || "StockFlow")}</p>
<p class="mk-app-vista">${esc(m.tituloVista || "")}</p>
</div>
<div class="mk-form mk-form-ancho mk-form-mov">
<label class="mk-campo-grupo"><span>Tipo</span><input type="text" value="${esc(p.tipo)}" readonly tabindex="-1"></label>
<label class="mk-campo-grupo"><span>Producto</span><input type="text" value="${esc(p.producto)}" readonly tabindex="-1"></label>
<label class="mk-campo-grupo"><span>Cantidad</span><input type="text" value="${esc(p.cantidad)}" readonly tabindex="-1"></label>
</div>
<p class="mk-aviso ${esc(p.avisoTono || "info")}">${esc(p.aviso)}</p>
<button type="button" class="mk-boton">${esc(m.boton || "Registrar movimiento")}</button>
<p class="mk-panel-titulo mk-panel-titulo-tabla">${esc(m.kardex?.titulo || "")}</p>
<table class="mk-tabla mk-tabla-compacta">
<thead><tr>${columnas}</tr></thead>
<tbody>
${nueva}
${filas}
</tbody>
</table>
<span class="mk-marca-tipo ${claseTipo}">${esc(etiqueta)}</span>
</div>
</div>`;
    })
    .join("\n");

  return `<div class="mk-movimientos">
${paneles}
</div>
<p class="mk-pista">${esc(m.pista || "")}</p>`;
}

function mockupHtml(f) {
  const m = f.mockup;
  if (!m) return "";

  const cuerpo = {
    "tablero-trello": () => mockTablero(m),
    "tarjeta-trello": () => mockTarjeta(m),
    "modelo-datos": () => mockModelo(m),
    "pantalla-login": () => mockLogin(m),
    "pantalla-catalogo": () => mockCatalogo(m, spec.datasetDemo),
    "pantalla-movimientos": () => mockMovimientos(m),
  }[m.tipo];

  if (!cuerpo) {
    console.warn(`  aviso: tipo de muestra desconocido "${m.tipo}" en ${f.id}`);
    return "";
  }

  const rotulo = `<p class="mk-titulo-bloque" id="${esc(f.id)}-muestra">Así debería verse la captura</p>`;
  const inner = `${rotulo}
${cuerpo()}`;

  /* Con la imagen ya capturada, la muestra pasa a ser material de consulta
     plegado; mientras falta, se ve abierta como guía principal. */
  if (f.existe) {
    return `<details class="mk-bloque mk-plegable">
<summary>Ver la muestra de referencia</summary>
${inner}
</details>`;
  }

  return `<section class="mk-bloque" aria-labelledby="${esc(f.id)}-muestra">
${inner}
</section>`;
}

function fichaHtml(f) {
  const tomas = f.debeMostrar.map((t, i) => `<li>${esc(t)}</li>`).join("\n");
  const evitar = f.evitar.map((t) => `<li>${esc(t)}</li>`).join("\n");
  const historias = (f.historias || []).map(historiaMarca).join(" ");

  const vista = f.existe
    ? `<figure class="fig-marco fig-capturada">
  <img src="${esc(f.rutaRel)}" alt="${esc(f.alt)}" loading="lazy" width="1600">
  <figcaption>${esc(f.pie)}</figcaption>
</figure>`
    : `<figure class="fig-marco fig-pendiente">
  <div class="fig-hueco">
    <span class="fig-badge">Por capturar</span>
    <p class="fig-archivo"><code>${esc(f.archivo)}</code></p>
    <p class="fig-formato">${esc(f.formato)}</p>
  </div>
  <figcaption>${esc(f.pie)}</figcaption>
</figure>`;

  const paneles = (f.paneles || []).length
    ? `<dl class="fig-paneles-lista">
${f.paneles
  .map(
    (p) => `<div>
<dt>${esc(p.rotulo)}</dt>
<dd>${esc(p.texto)}</dd>
</div>`
  )
  .join("\n")}
</dl>`
    : "";

  return `<article class="fig-ficha" id="${esc(f.id)}">
<header class="fig-cabecera">
  <p class="fig-num">Figura ${esc(f.numero)}</p>
  <h3>${esc(f.titulo)}</h3>
  <p class="fig-meta">
    <span class="fig-fuente">${esc(f.fuente)}</span>
    <span class="fig-responsable">${esc(f.responsable)}</span>
    ${historias}
  </p>
</header>

${vista}

${mockupHtml(f)}

<p class="fig-demuestra"><span class="rotulo">Qué demuestra</span> ${esc(f.demuestra)}</p>

${paneles ? paneles : ""}

<div class="fig-doble">
  <div>
    <p class="rotulo">La captura debe mostrar</p>
    <ul class="checklist">
${tomas}
    </ul>
  </div>
  <div>
    <p class="rotulo">Evitar</p>
    <ul class="fig-evitar">
${evitar}
    </ul>
  </div>
</div>
</article>`;
}

function datasetHtml() {
  const d = spec.datasetDemo;
  const filas = d.productos
    .map(
      (p) => `<tr>
<td><code>${esc(p.sku)}</code></td>
<td>${esc(p.nombre)}</td>
<td>${esc(p.categoria)}</td>
<td>${esc(p.unidad)}</td>
<td>${p.stockMinimo}</td>
<td>${p.stockActual}</td>
<td>${p.estado === "Stock Crítico" ? '<span class="fig-critico">Stock Crítico</span>' : '<span class="fig-disponible">Disponible</span>'}</td>
</tr>`
    )
    .join("\n");

  const referencia = (m) => {
    const destino = figuras.find((f) => f.id === m.figura);
    const numero = destino ? destino.numero : m.figura;
    return `Figura ${numero}${m.panel ? ` ${m.panel}` : ""}`;
  };

  const movimientos = d.movimientos
    .map(
      (m) => `<tr>
<td>${esc(m.tipo)}</td>
<td><code>${esc(m.sku)}</code></td>
<td>${m.cantidad}</td>
<td>${esc(m.resultado)}</td>
<td>${esc(m.saldo)}</td>
<td>${esc(referencia(m))}</td>
</tr>`
    )
    .join("\n");

  return `<section class="fig-seccion" id="dataset-demo">
<h2>Datos de demostración</h2>
<p class="fig-nota">${esc(d.descripcion)}</p>
<div class="tabla-envoltura"><table>
<caption>Productos que deben aparecer en las figuras 5 y 6</caption>
<thead><tr>
<th scope="col">SKU</th>
<th scope="col">Producto</th>
<th scope="col">Categoría</th>
<th scope="col">Unidad</th>
<th scope="col">Stock mínimo</th>
<th scope="col">Stock actual</th>
<th scope="col">Estado</th>
</tr></thead>
<tbody>
${filas}
</tbody>
</table></div>

<div class="tabla-envoltura"><table>
<caption>Movimientos que deben verse en la figura 6</caption>
<thead><tr>
<th scope="col">Tipo</th>
<th scope="col">SKU</th>
<th scope="col">Cantidad</th>
<th scope="col">Resultado</th>
<th scope="col">Saldo</th>
<th scope="col">Dónde se ve</th>
</tr></thead>
<tbody>
${movimientos}
</tbody>
</table></div>
</section>`;
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

function pagina() {
  const reglas = spec.reglas.map((r) => `<li>${esc(r)}</li>`).join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(spec.titulo)} · Proyecto Integrador T1</title>
<meta name="description" content="Especificación de las seis figuras de la sección 4 del informe del Sprint 1 de StockFlow, con su pie, su checklist de tomas y el estado de captura.">
<link rel="stylesheet" href="assets/estilos.css">
</head>
<body>
<a class="salto" href="#contenido">Saltar al contenido</a>

<header class="cabecera">
  <div class="contenedor">
    <a class="marca" href="index.html">Proyecto Integrador T1 <span>· Incremento</span></a>
    <span class="meta">${esc(spec.proyecto)}</span>
  </div>
</header>

<main id="contenido">
<div class="portada-indice">
  <div class="contenedor">
    <p class="etiqueta">${esc(spec.seccionInforme)}</p>
    <h1>${esc(spec.titulo)}</h1>
    <p class="bajada">${esc(spec.subtitulo)}</p>
    <dl class="datos">
      <div><dt>Figuras</dt><dd>${figuras.length}</dd></div>
      <div><dt>Capturadas</dt><dd>${capturadas}</dd></div>
      <div><dt>Pendientes</dt><dd>${pendientes}</dd></div>
      <div><dt>Actualizado</dt><dd>${esc(fechaLarga(spec.actualizado))}</dd></div>
    </dl>
  </div>
</div>

<div class="contenedor fig-contenido">
  <nav class="fig-indice" aria-label="Figuras de esta página">
${figuras
  .map(
    (f) =>
      `<a href="#${esc(f.id)}" class="${f.existe ? "capturada" : "pendiente"}"><span>${esc(f.numero)}</span>${esc(f.titulo)}</a>`
  )
  .join("\n")}
  </nav>

  <section class="fig-seccion" id="reglas">
    <h2>Cómo se toman las seis figuras</h2>
    <p class="fig-nota">Cada ficha incluye una muestra de cómo debe verse la captura, dibujada con los datos de este proyecto: el tablero de Trello, la tarjeta abierta, el modelo de datos y las pantallas del sistema. La muestra no es una imagen del sistema real, es la referencia para replicarla antes de capturar.</p>
    <ul class="checklist">
${reglas}
    </ul>
    <p class="fig-nota">${esc(spec.nota)}</p>
  </section>

  <section class="fig-seccion" id="figuras">
    <h2>Las figuras</h2>
    <p class="fig-nota">Cada ficha trae el pie con el que la imagen entra al Word, lo que la captura debe mostrar y lo que debe evitar. El estado se calcula solo: en cuanto el archivo aparece en <code>site/${esc(EVIDENCIAS_REL)}/</code>, la figura pasa a capturada.</p>
${figuras.map(fichaHtml).join("\n")}
  </section>

${datasetHtml()}
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

fs.mkdirSync(carpetaAbs, { recursive: true });
fs.writeFileSync(SALIDA, pagina(), "utf8");

console.log(
  `site/incremento.html  (${figuras.length} figuras, ${capturadas} capturadas, ${pendientes} pendientes)`
);
if (avisos.length) {
  console.warn(`Avisos de consistencia: ${avisos.join("; ")}`);
  process.exitCode = 1;
}
