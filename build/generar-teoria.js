#!/usr/bin/env node
/**
 * Generador del sitio.
 *
 * Lee cada colección de data/ y produce su carpeta en site/.
 * El JSON es la fuente de verdad: aquí no se escribe contenido,
 * solo la estructura de presentación.
 *
 * Colecciones actuales:
 *   data/teoria      -> site/teoria       (base teórica)
 *   data/plan-mejora -> site/plan-mejora  (plan de corrección de la propuesta)
 *
 * Uso:  node build/generar-teoria.js
 */

const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");

const COLECCIONES = [
  {
    clave: "teoria",
    datos: path.join(RAIZ, "data", "teoria"),
    salida: path.join(RAIZ, "site", "teoria"),
    marca: "Base teórica",
    marcaExtra: "Proyecto Integrador T1",
    meta: "Scrum · Guía 2020",
    etiquetaParte: "Base teórica",
    pie: "Proyecto Integrador · SPTI02423 · Cibertec · Sección T6HO",
    introIndice:
      "Cada parte cubre un bloque conceptual del examen y se apoya en la Guía Scrum 2020 y el Manifiesto Ágil. El orden reproduce el de las decisiones reales de un Sprint: marco, proyecto, historias, estimación, artefactos y cierre.",
  },
  {
    clave: "plan-mejora",
    datos: path.join(RAIZ, "data", "plan-mejora"),
    salida: path.join(RAIZ, "site", "plan-mejora"),
    marca: "Plan de mejora",
    marcaExtra: "Propuesta StockFlow",
    meta: "24 correcciones",
    etiquetaParte: "Plan de mejora",
    pie: "Plan de mejora · T1 Proyecto Integrador · Noviembre 2026",
    introIndice:
      "Las 24 correcciones están agrupadas por gravedad y ordenadas para aplicarse en secuencia. Cada una trae el texto original y el texto de reemplazo, listo para copiar en el Word.",
  },
];

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

function leerDocumentos(dirDatos) {
  const nombres = fs
    .readdirSync(dirDatos)
    .filter((n) => n.endsWith(".json") && !n.startsWith("_"));

  const docs = nombres.map((n) =>
    JSON.parse(fs.readFileSync(path.join(dirDatos, n), "utf8"))
  );

  docs.sort((a, b) => (a.orden || 99) - (b.orden || 99));
  return docs;
}

function leerIndice(dirDatos) {
  return JSON.parse(
    fs.readFileSync(path.join(dirDatos, "_indice.json"), "utf8")
  );
}

/* ------------------------------------------------------------------ */
/* Bloques de contenido                                                */
/* ------------------------------------------------------------------ */

/** Enlaza automáticamente los valores que coinciden con el id de otro documento. */
function celda(valor, docs) {
  const texto = String(valor);
  const destino = docs.find((d) => d.id === texto);
  if (destino) {
    return `<a href="${destino.id}.html">${esc(destino.titulo)}</a>`;
  }
  return esc(texto);
}

function bloqueTabla(b, docs) {
  const cabeceras = b.columnas.map((c) => `<th scope="col">${esc(c)}</th>`).join("");
  const filas = b.filas
    .map(
      (f) =>
        `<tr>${f.map((c) => `<td>${celda(c, docs)}</td>`).join("")}</tr>`
    )
    .join("\n");

  return `<div class="tabla-envoltura"><table>
${b.titulo ? `<caption>${esc(b.titulo)}</caption>` : ""}
<thead><tr>${cabeceras}</tr></thead>
<tbody>
${filas}
</tbody>
</table></div>`;
}

function bloqueDestacado(b) {
  const tono = ["info", "alerta", "exito"].includes(b.tono) ? b.tono : "info";
  return `<aside class="destacado ${tono}">
<span class="titulo-destacado">${esc(b.titulo)}</span>
<p>${esc(b.texto)}</p>
</aside>`;
}

function bloqueCita(b) {
  return `<blockquote>
<p>${esc(b.texto)}</p>
${b.autor ? `<cite>${esc(b.autor)}</cite>` : ""}
</blockquote>`;
}

function bloqueLista(b) {
  const etiqueta = b.ordenada ? "ol" : "ul";
  const items = b.items.map((i) => `<li>${esc(i)}</li>`).join("\n");
  return `<${etiqueta} class="lista">
${items}
</${etiqueta}>`;
}

function bloqueDefiniciones(b) {
  const filas = b.items
    .map(
      (d) => `<div class="def">
<dt>${esc(d.termino)}</dt>
<dd>${esc(d.definicion)}</dd>
</div>`
    )
    .join("\n");

  return `<dl class="definiciones">
${filas}
</dl>`;
}

function bloqueComparacion(b) {
  const columna = (c) => `<div>
<h4>${esc(c.titulo)}</h4>
<ul>
${c.items.map((i) => `<li>${esc(i)}</li>`).join("\n")}
</ul>
</div>`;

  return `<div class="comparacion">
${columna(b.izquierda)}
${columna(b.derecha)}
</div>`;
}

function bloquePasos(b) {
  const items = b.items
    .map(
      (p) => `<li>
<p class="paso-titulo">${esc(p.titulo)}</p>
<p class="paso-detalle">${esc(p.detalle)}</p>
</li>`
    )
    .join("\n");

  return `<ol class="pasos">
${items}
</ol>`;
}

function bloqueChecklist(b) {
  return `${b.titulo ? `<p class="titulo-lista">${esc(b.titulo)}</p>` : ""}<ul class="checklist">
${b.items.map((i) => `<li>${esc(i)}</li>`).join("\n")}
</ul>`;
}

function bloqueFormula(b) {
  return `<div class="formula">
${b.lineas.map((l) => `<p>${esc(l)}</p>`).join("\n")}
</div>`;
}

function bloqueTextoLibre(b) {
  return b.parrafos.map((p) => `<p>${esc(p)}</p>`).join("\n");
}

const CLAVES_ERROR = [
  "incorrect",
  "débil",
  "debil",
  "error",
  "no es",
  "mal definida",
  "no verificable",
  "planteado como",
  "habitual",
  "evitar",
];

function bloqueEjemplos(b) {
  return `<div class="ejemplos">
${b.items
  .map((e) => {
    const titulo = e.titulo.toLowerCase();
    const esError = CLAVES_ERROR.some((k) => titulo.includes(k));
    const tono = esError ? "alerta" : "exito";
    return `<div class="ejemplo destacado ${tono}" style="margin:0">
<h4>${esc(e.titulo)}</h4>
<p>${esc(e.texto)}</p>
${e.nota ? `<p class="nota">${esc(e.nota)}</p>` : ""}
</div>`;
  })
  .join("\n")}
</div>`;
}

/** Bloque de corrección: comparación entre el texto actual y el reemplazo. */
function bloqueCorreccion(b) {
  const gravedadClase = {
    Bloqueante: "grave",
    Inconsistencia: "media",
    "Riesgo de entrega": "media",
    Detalle: "leve",
  }[b.gravedad] || "leve";

  return `<div class="correccion">
<div class="correccion-cabecera">
<span class="codigo">${esc(b.codigo || "")}</span>
<span class="gravedad ${gravedadClase}">${esc(b.gravedad || "")}</span>
<span class="ubicacion">${esc(b.seccion || "")}</span>
</div>

<div class="correccion-cuerpo">
<p class="rotulo">El problema</p>
<p>${esc(b.problema)}</p>

<div class="par-textos">
  <div class="texto-antes">
    <p class="rotulo">Cómo está ahora</p>
    <pre>${esc(b.antes)}</pre>
  </div>
  <div class="texto-despues">
    <p class="rotulo">Cómo debe quedar</p>
    <pre>${esc(b.despues)}</pre>
    <button type="button" class="copiar" data-copiar>Copiar texto</button>
  </div>
</div>

<p class="rotulo">Por qué</p>
<p>${esc(b.porque)}</p>

${b.nota ? `<p class="correccion-nota"><strong>Nota:</strong> ${esc(b.nota)}</p>` : ""}
</div>
</div>`;
}

const RENDER = {
  parrafo: (b) => `<p>${esc(b.texto)}</p>`,
  subtitulo: (b) => `<h3 class="subtitulo-bloque">${esc(b.texto)}</h3>`,
  cita: bloqueCita,
  destacado: bloqueDestacado,
  tabla: bloqueTabla,
  lista: bloqueLista,
  definiciones: bloqueDefiniciones,
  comparacion: bloqueComparacion,
  pasos: bloquePasos,
  checklist: bloqueChecklist,
  formula: bloqueFormula,
  ejemplos: bloqueEjemplos,
  correccion: bloqueCorreccion,
  "texto-libre": bloqueTextoLibre,
};

function renderBloque(b, docs) {
  const fn = RENDER[b.tipo];
  if (!fn) {
    console.warn(`  aviso: tipo de bloque desconocido "${b.tipo}"`);
    return "";
  }
  return fn(b, docs);
}

/* ------------------------------------------------------------------ */
/* Plantilla                                                           */
/* ------------------------------------------------------------------ */

const SCRIPT_COPIAR = `<script>
document.addEventListener('click', function (e) {
  var boton = e.target.closest('[data-copiar]');
  if (!boton) return;
  var pre = boton.parentElement.querySelector('pre');
  if (!pre) return;
  var texto = pre.textContent;
  var listo = function () {
    var original = boton.textContent;
    boton.textContent = 'Copiado';
    setTimeout(function () { boton.textContent = original; }, 1600);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texto).then(listo, function () { seleccionar(); });
  } else {
    seleccionar();
  }
  function seleccionar() {
    var r = document.createRange();
    r.selectNodeContents(pre);
    var s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    listo();
  }
});
</script>`;

function plantilla({ titulo, descripcion, cuerpo, col }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)} · ${esc(col.marca)}</title>
<meta name="description" content="${esc(descripcion)}">
<link rel="stylesheet" href="../assets/estilos.css">
</head>
<body>
<a class="salto" href="#contenido">Saltar al contenido</a>

<header class="cabecera">
  <div class="contenedor">
    <a class="marca" href="index.html">${esc(col.marca)} <span>· ${esc(col.marcaExtra)}</span></a>
    <span class="meta">${esc(col.meta)}</span>
  </div>
</header>

<main id="contenido">
${cuerpo}
</main>

<footer class="pie">
  <div class="contenedor">
    <span>${esc(col.pie)}</span>
    <a href="index.html">Volver al índice</a>
  </div>
</footer>
${SCRIPT_COPIAR}
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* Página de documento                                                 */
/* ------------------------------------------------------------------ */

function renderDocumento(doc, docs, col) {
  const enlaces = doc.secciones
    .map((s) => `<li><a href="#${s.id}">${esc(s.titulo)}</a></li>`)
    .join("\n");

  const cuerpoSecciones = doc.secciones
    .map(
      (s, i) => `<section class="seccion" id="${s.id}">
<h2><span class="num">${String(i + 1).padStart(2, "0")}</span>${esc(s.titulo)}</h2>
${s.cuerpo.map((b) => renderBloque(b, docs)).join("\n")}
</section>`
    )
    .join("\n");

  const claves = (doc.claves || []).map((c) => `<li>${esc(c)}</li>`).join("\n");

  const pos = docs.findIndex((d) => d.id === doc.id);
  const previo = pos > 0 ? docs[pos - 1] : null;
  const siguiente = pos < docs.length - 1 ? docs[pos + 1] : null;

  const paginacion = `<nav class="paginacion" aria-label="Navegación entre secciones">
${previo ? `<a href="${previo.id}.html" class="anterior"><span class="dir">Anterior</span><span class="nombre">${esc(previo.titulo)}</span></a>` : ""}
${siguiente ? `<a href="${siguiente.id}.html" class="siguiente"><span class="dir">Siguiente</span><span class="nombre">${esc(siguiente.titulo)}</span></a>` : ""}
</nav>`;

  const cuerpo = `<article>
<div class="portada">
  <div class="contenedor">
    <p class="etiqueta">${esc(col.etiquetaParte)} · Parte ${String(doc.orden || 1).padStart(2, "0")}</p>
    <h1>${esc(doc.titulo)}</h1>
    <p class="bajada">${esc(doc.subtitulo || "")}</p>
    <p class="resumen">${esc(doc.resumen || "")}</p>
    ${claves ? `<ul class="claves">${claves}</ul>` : ""}
  </div>
</div>

<div class="contenedor">
<div class="cuerpo">
  <nav class="indice-lateral" aria-label="Contenido de esta página">
    <p>En esta página</p>
    <ol>
${enlaces}
    </ol>
    <a class="volver" href="index.html">← Índice general</a>
  </nav>
  <div>
${cuerpoSecciones}
${paginacion}
  </div>
</div>
</div>
</article>`;

  return plantilla({
    titulo: doc.titulo,
    descripcion: doc.resumen || doc.subtitulo || doc.titulo,
    cuerpo,
    col,
  });
}

/* ------------------------------------------------------------------ */
/* Índice general                                                      */
/* ------------------------------------------------------------------ */

function renderIndex(docs, indice, col) {
  const totalApartados = docs.reduce((n, d) => n + d.secciones.length, 0);
  const actualizado = docs
    .map((d) => d.actualizado)
    .filter(Boolean)
    .sort()
    .pop();

  const tarjetas = docs
    .map(
      (d) => `<li class="tarjeta">
<p class="num">${String(d.orden).padStart(2, "0")}</p>
<h3><a href="${d.id}.html">${esc(d.titulo)}</a></h3>
<p class="sub">${esc(d.subtitulo || "")}</p>
<p class="desc">${esc(d.resumen || "")}</p>
<p class="pie-tarjeta"><span>${d.secciones.length} apartados</span><span>Leer →</span></p>
</li>`
    )
    .join("\n");

  const definiciones = (indice.estadisticas || [])
    .map((e) => `<div><dt>${esc(e.etiqueta)}</dt><dd>${esc(e.valor)}</dd></div>`)
    .join("\n");

  const datosBasicos = [
    { etiqueta: "Curso", valor: indice.curso ? "Proyecto Integrador" : null },
    { etiqueta: "Evaluación", valor: indice.evaluacion ? "T1 · Sprint 1" : null },
    { etiqueta: "Sección", valor: indice.seccion ? "T6HO" : null },
  ].filter((d) => d.valor);

  const datos = definiciones || datosBasicos
    .concat([
      { etiqueta: "Contenidos", valor: String(docs.length) },
      { etiqueta: "Apartados", valor: String(totalApartados) },
    ])
    .map((e) => `<div><dt>${esc(e.etiqueta)}</dt><dd>${esc(e.valor)}</dd></div>`)
    .join("\n");

  const instrucciones = (indice.instrucciones || [])
    .map((i) => `<li>${esc(i)}</li>`)
    .join("\n");

  const fuentes = (indice.fuentes || [])
    .map((f) => {
      const detalle = f.detalle ? ` <span class="detalle">— ${esc(f.detalle)}</span>` : "";
      const texto = f.url
        ? `<a href="${esc(f.url)}">${esc(f.titulo)}</a>`
        : `<strong>${esc(f.titulo)}</strong>`;
      return `<li>${texto}${detalle}</li>`;
    })
    .join("\n");

  const relacionados = (indice.enlaces || [])
    .map(
      (e) => `<li><a href="${esc(e.url)}">${esc(e.titulo)}</a>${e.detalle ? ` <span class="detalle">— ${esc(e.detalle)}</span>` : ""}</li>`
    )
    .join("\n");

  const cuerpo = `<div class="portada-indice">
  <div class="contenedor">
    <p class="etiqueta">${esc(col.etiquetaParte)} ${indice.veredicto ? "· " + esc(indice.veredicto) : ""}</p>
    <h1>${esc(indice.titulo)}</h1>
    <p class="bajada">${esc(indice.subtitulo)}</p>
    <dl class="datos">
${datos}
    </dl>
  </div>
</div>

<div class="contenedor indice-principal">
  ${indice.resumen ? `<p class="intro">${esc(indice.resumen)}</p>` : ""}

  ${instrucciones ? `<div class="bloque-instrucciones">
    <h2>Cómo usar este documento</h2>
    <ol>${instrucciones}</ol>
  </div>` : ""}

  <h2>Contenidos</h2>
  <p class="intro">${esc(col.introIndice)}</p>
  <ul class="rejilla">
${tarjetas}
  </ul>

  <div class="aviso-indice">
    <p>${esc(indice.nota || "")}</p>
  </div>

  ${relacionados ? `<div class="bloque-fuentes">
    <h2>Documentos relacionados</h2>
    <ol>${relacionados}</ol>
  </div>` : ""}

  ${fuentes ? `<div class="bloque-fuentes">
    <h2>Fuentes</h2>
    <ol>${fuentes}</ol>
  </div>` : ""}

  <p class="pie-indice">
    Última actualización de los datos: ${esc(fechaLarga(actualizado))}.
    <a href="completo.html">Ver todo el contenido en una sola página</a>.
  </p>
</div>`;

  return plantilla({
    titulo: indice.titulo,
    descripcion: indice.subtitulo,
    cuerpo,
    col,
  });
}

/* ------------------------------------------------------------------ */
/* Vista completa                                                      */
/* ------------------------------------------------------------------ */

function renderCompleto(docs, indice, col) {
  const indiceSuperior = docs
    .map((d) => `<li><a href="#${d.id}">${esc(d.titulo)}</a></li>`)
    .join("\n");

  const cuerpos = docs
    .map(
      (d) => `<article class="seccion" id="${d.id}" style="margin-bottom:4rem">
<h2 style="font-size:2rem;border-bottom:2px solid var(--tinta)">
<span class="num">${String(d.orden).padStart(2, "0")}</span>${esc(d.titulo)}
</h2>
<p style="color:var(--tinta-suave);max-width:72ch;margin-bottom:2rem">${esc(d.resumen || "")}</p>
${d.secciones
  .map(
    (s, i) => `<section class="seccion" id="${d.id}-${s.id}">
<h2 style="font-size:1.4rem"><span class="num">${String(i + 1).padStart(2, "0")}</span>${esc(s.titulo)}</h2>
${s.cuerpo.map((b) => renderBloque(b, docs)).join("\n")}
</section>`
  )
  .join("\n")}
</article>`
    )
    .join("\n");

  const cuerpo = `<div class="portada">
  <div class="contenedor">
    <p class="etiqueta">${esc(col.etiquetaParte)} · Vista completa</p>
    <h1>Todo el contenido en una página</h1>
    <p class="bajada">Versión lineal de los ${docs.length} contenidos, pensada para lectura continua e impresión.</p>
  </div>
</div>

<div class="contenedor">
<div class="cuerpo">
  <nav class="indice-lateral" aria-label="Contenidos">
    <p>Contenidos</p>
    <ol>
${indiceSuperior}
    </ol>
    <a class="volver" href="index.html">← Índice general</a>
  </nav>
  <div>
${cuerpos}
  </div>
</div>
</div>`;

  return plantilla({
    titulo: "Todo el contenido",
    descripcion: indice.subtitulo,
    cuerpo,
    col,
  });
}

/* ------------------------------------------------------------------ */
/* Ejecución                                                           */
/* ------------------------------------------------------------------ */

function main() {
  for (const col of COLECCIONES) {
    if (!fs.existsSync(col.datos)) {
      console.warn(`  se omite ${col.clave}: no existe ${col.datos}`);
      continue;
    }

    const docs = leerDocumentos(col.datos);
    const indice = leerIndice(col.datos);

    fs.mkdirSync(col.salida, { recursive: true });

    console.log(`\n${col.clave}/`);

    for (const doc of docs) {
      const html = renderDocumento(doc, docs, col);
      fs.writeFileSync(path.join(col.salida, `${doc.id}.html`), html, "utf8");
      console.log(`  ${doc.id}.html  (${doc.secciones.length} apartados)`);
    }

    fs.writeFileSync(
      path.join(col.salida, "index.html"),
      renderIndex(docs, indice, col),
      "utf8"
    );
    console.log("  index.html");

    fs.writeFileSync(
      path.join(col.salida, "completo.html"),
      renderCompleto(docs, indice, col),
      "utf8"
    );
    console.log("  completo.html");

    const total = docs.reduce((n, d) => n + d.secciones.length, 0);
    console.log(`  ${docs.length} contenidos, ${total} apartados`);
  }

  console.log("\nListo.");
}

main();
