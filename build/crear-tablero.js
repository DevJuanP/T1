/**
 * crear-tablero.js
 *
 * Construye el tablero de Trello del Sprint 1 a partir de data/tablero-trello.json,
 * que es la fuente de verdad. El resultado debe coincidir con la muestra visual de
 * la figura 1 y la figura 2 de site/incremento.html.
 *
 * POR QUE UN SCRIPT Y NO EL MCP
 * El MCP oficial de Trello no puede crear etiquetas ni asignar responsables:
 * su lista de acciones solo admite attach_label, no update_label ni add_member.
 * Un script contra la API REST si puede, y ademas deja el tablero reproducible.
 *
 * CREDENCIALES (obligatorias)
 * La API REST de Trello exige key + token en cada llamada. No hay forma de
 * esquivarlo: el token OAuth del MCP vive cifrado dentro de opencode y un script
 * no puede leerlo. Se generan una sola vez en https://trello.com/app-key y se
 * pasan como variables de entorno, nunca escritas en el repositorio:
 *
 *   setx TRELLO_KEY   "tu-api-key"
 *   setx TRELLO_TOKEN "tu-token"
 *
 * Uso:
 *   node build/crear-tablero.js --plan      # sin red: muestra que se crearia
 *   node build/crear-tablero.js             # crea o completa el tablero
 *   node build/crear-tablero.js --verificar # compara el tablero con el JSON
 *
 * El script es idempotente: se puede ejecutar las veces que haga falta sin
 * duplicar listas, tarjetas, checklists, items, etiquetas ni comentarios.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const RUTA_DATOS = path.join(__dirname, "..", "data", "tablero-trello.json");

// Identificadores del tablero de destino. Se puede sobreescribir con --board.
const TABLERO_POR_DEFECTO = "cU7H80Zd";
// Nombres combinados: el del JSON y el del tablero real, en uno solo.
const NOMBRE_TABLERO = "StockFlow · Sprint 1 — Proyecto Integrador T1";

// Los vencimientos del JSON son solo fecha. Trello guarda instantes, asi que se
// fija la hora de cierre en 09:00 de Lima (UTC-5) para que el dia no se corra.
const HORA_VENCIMIENTO_UTC = "T14:00:00.000Z";

// Colores de la API de Trello para las etiquetas del JSON.
const COLOR_API = {
  rojo: "red",
  amarillo: "yellow",
  verde: "green",
  azul: "blue",
  morado: "purple",
  naranja: "orange",
};

const API = "https://api.trello.com/1";

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const MODO_PLAN = args.includes("--plan");
const MODO_VERIFICAR = args.includes("--verificar");
const BOARD_ARG = (() => {
  const i = args.indexOf("--board");
  return i !== -1 && args[i + 1] ? args[i + 1] : TABLERO_POR_DEFECTO;
})();

function leerDatos() {
  return JSON.parse(fs.readFileSync(RUTA_DATOS, "utf8"));
}

function fallar(mensaje) {
  console.error(`\n  ${mensaje}\n`);
  process.exit(1);
}

/**
 * La API de Trello limita a 100 peticiones cada 10 s por token. En vez de
 * reventar el limite se espacian las llamadas de escritura.
 */
let ultimaLlamada = 0;
async function esperarTurno() {
  const ahora = Date.now();
  const espera = Math.max(0, 120 - (ahora - ultimaLlamada));
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultimaLlamada = Date.now();
}

let peticiones = 0;

/**
 * Las credenciales se copian de una pagina web, asi que es facil que arrastren
 * un salto de linea o un espacio final. Trello responde "401 invalid app token"
 * sin explicar nada cuando eso pasa, asi que se limpian antes de usarlas.
 */
function credencial(nombre) {
  const valor = (process.env[nombre] || "").replace(/[\s\u00a0\u200b]+/g, "");
  return valor;
}

async function trello(metodo, ruta, params = {}) {
  const key = credencial("TRELLO_KEY");
  const token = credencial("TRELLO_TOKEN");
  if (!key || !token) {
    fallar(
      "Faltan TRELLO_KEY y TRELLO_TOKEN.\n" +
        "  Generalos en https://trello.com/power-ups/admin (pestana Autenticacion Trello)\n" +
        "  y luego:\n" +
        '    setx TRELLO_KEY   "tu-api-key"\n' +
        '    setx TRELLO_TOKEN "tu-token"\n' +
        "  Abre una terminal nueva y vuelve a ejecutar el script."
    );
  }

  if (key.length !== 32) {
    fallar(`TRELLO_KEY tiene ${key.length} caracteres y deberia tener 32.\n  ¿Copiaste el campo correcto?`);
  }
  if (!/^ATTA[0-9A-Za-z]+$/.test(token)) {
    fallar(
      `TRELLO_TOKEN no parece un token de Trello (empieza por "ATTA").\n` +
        `  Valor actual: ${token.slice(0, 6)}... (${token.length} caracteres)\n` +
        '  El campo "Secreto" de la pantalla de claves NO es el token:\n' +
        '  el token sale al pulsar el enlace "token" y autorizar.'
    );
  }

  const url = new URL(`${API}${ruta}`);
  url.searchParams.set("key", key);
  url.searchParams.set("token", token);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  if (metodo !== "GET") await esperarTurno();
  peticiones += 1;

  const respuesta = await fetch(url, { method: metodo });
  if (!respuesta.ok) {
    const cuerpo = await respuesta.text();
    throw new Error(`${metodo} ${ruta} -> ${respuesta.status} ${cuerpo}`);
  }
  if (respuesta.status === 204) return null;
  return respuesta.json();
}

const get = (ruta, params) => trello("GET", ruta, params);
const post = (ruta, params) => trello("POST", ruta, params);
const put = (ruta, params) => trello("PUT", ruta, params);

function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * El JSON dice "Juan Alonso Esteban Pajuelo Chipana" y Trello lo tiene como
 * "Juan A. Pajuelo Chipana". Se emparejan por cantidad de palabras en comun.
 */
function puntajeNombre(a, b) {
  const palabrasA = new Set(normalizar(a).filter((p) => p.length > 1));
  const palabrasB = new Set(normalizar(b).filter((p) => p.length > 1));
  let comunes = 0;
  for (const p of palabrasA) if (palabrasB.has(p)) comunes += 1;
  return comunes;
}

function buscarMiembro(miembros, nombreJson) {
  let mejor = null;
  let mejorPuntaje = 0;
  for (const m of miembros) {
    const puntaje = puntajeNombre(m.fullName, nombreJson);
    if (puntaje > mejorPuntaje) {
      mejor = m;
      mejorPuntaje = puntaje;
    }
  }
  return mejorPuntaje >= 2 ? mejor : null;
}

function vencimientoIso(fecha) {
  return fecha ? `${fecha}${HORA_VENCIMIENTO_UTC}` : null;
}

function descripcionTarjeta(tarjeta) {
  return tarjeta.descripcion || tarjeta.historia || "";
}

// ---------------------------------------------------------------------------
// Modo plan: sin red, solo el mapa de lo que se va a hacer
// ---------------------------------------------------------------------------

function imprimirPlan(datos) {
  const items = datos.tarjetas.flatMap((t) => (t.checklists || []).flatMap((c) => c.items));
  console.log(`\n  Tablero: ${NOMBRE_TABLERO}`);
  console.log(`  Fuente:  data/tablero-trello.json (actualizado ${datos.actualizado})\n`);
  console.log("  Listas, en orden:");
  datos.listas.forEach((l, i) => console.log(`    ${i + 1}. ${l.nombre}`));
  console.log("\n  Etiquetas:");
  datos.etiquetas.forEach((e) => console.log(`    ${e.nombre} -> ${COLOR_API[e.color] || e.color}`));
  console.log(`\n  Tarjetas (${datos.tarjetas.length}):`);
  for (const l of datos.listas) {
    const enLista = datos.tarjetas.filter((t) => t.lista === l.id);
    console.log(`    ${l.nombre} (${enLista.length})`);
    enLista.forEach((t) => {
      const total = (t.checklists || []).reduce((a, c) => a + c.items.length, 0);
      const extra = [
        total ? `${total} items` : null,
        t.comentarios?.length ? `${t.comentarios.length} comentarios` : null,
        t.miembro ? t.miembro : null,
        t.vence ? t.vence : null,
      ].filter(Boolean);
      console.log(`      · ${t.titulo}${extra.length ? `  [${extra.join(", ")}]` : ""}`);
    });
  }
  console.log(
    `\n  Totales: ${datos.tarjetas.length} tarjetas, ` +
      `${datos.tarjetas.reduce((a, t) => a + (t.checklists || []).length, 0)} checklists, ` +
      `${items.length} items (${items.filter((i) => i.hecho).length} hechos), ` +
      `${datos.tarjetas.reduce((a, t) => a + (t.comentarios || []).length, 0)} comentarios.\n`
  );
}

// ---------------------------------------------------------------------------
// Sincronizacion
// ---------------------------------------------------------------------------

async function sincronizar(datos) {
  const tablero = await get(`/boards/${BOARD_ARG}`, { fields: "name,url,closed" });
  console.log(`\n  Tablero encontrado: ${tablero.name}\n    ${tablero.url}\n`);

  // 1. Nombre del tablero
  if (tablero.name !== NOMBRE_TABLERO) {
    await put(`/boards/${BOARD_ARG}`, { name: NOMBRE_TABLERO });
    console.log(`  nombre del tablero -> ${NOMBRE_TABLERO}`);
  }

  // 2. Listas, en el orden del JSON
  const listasActuales = await get(`/boards/${BOARD_ARG}/lists`, { fields: "name,pos" });
  const ordenadas = [...listasActuales].sort((a, b) => a.pos - b.pos);
  const mapaListas = {};

  for (let i = 0; i < datos.listas.length; i += 1) {
    const deseada = datos.listas[i];
    const actual = ordenadas[i];
    if (actual) {
      if (actual.name !== deseada.nombre) {
        await put(`/lists/${actual.id}`, { name: deseada.nombre });
        console.log(`  lista ${i + 1}: "${actual.name}" -> "${deseada.nombre}"`);
      } else {
        console.log(`  lista ${i + 1}: "${deseada.nombre}" ya existe`);
      }
      mapaListas[deseada.id] = actual.id;
    } else {
      const creada = await post("/lists", {
        idBoard: BOARD_ARG,
        name: deseada.nombre,
        pos: i + 1,
      });
      console.log(`  lista ${i + 1}: creada "${deseada.nombre}"`);
      mapaListas[deseada.id] = creada.id;
    }
  }

  if (ordenadas.length > datos.listas.length) {
    for (const sobrante of ordenadas.slice(datos.listas.length)) {
      await put(`/lists/${sobrante.id}`, { closed: true });
      console.log(`  lista sobrante archivada: "${sobrante.name}"`);
    }
  }

  // 3. Etiquetas: renombrar las de mismo color que ya existen, crear el resto
  const etiquetasActuales = await get(`/boards/${BOARD_ARG}/labels`, { fields: "name,color" });
  const mapaEtiquetas = {};

  for (const etiqueta of datos.etiquetas) {
    const color = COLOR_API[etiqueta.color] || etiqueta.color;
    const sinNombre = etiquetasActuales.find(
      (l) => l.color === color && (!l.name || l.name.trim() === "")
    );
    const yaNombrada = etiquetasActuales.find(
      (l) => l.color === color && normalizar(l.name).join(" ") === normalizar(etiqueta.nombre).join(" ")
    );

    if (yaNombrada) {
      mapaEtiquetas[etiqueta.id] = yaNombrada.id;
      console.log(`  etiqueta "${etiqueta.nombre}": ya existe`);
    } else if (sinNombre) {
      await put(`/labels/${sinNombre.id}`, { name: etiqueta.nombre });
      mapaEtiquetas[etiqueta.id] = sinNombre.id;
      console.log(`  etiqueta color ${color} -> "${etiqueta.nombre}"`);
    } else {
      const creada = await post("/labels", {
        idBoard: BOARD_ARG,
        name: etiqueta.nombre,
        color,
      });
      mapaEtiquetas[etiqueta.id] = creada.id;
      console.log(`  etiqueta creada: "${etiqueta.nombre}" (${color})`);
    }
  }

  // 4. Miembros del tablero
  const miembros = await get(`/boards/${BOARD_ARG}/members`, { fields: "fullName,username" });

  // 5. Tarjetas
  const titulosEsperados = new Set(datos.tarjetas.map((t) => t.titulo));
  for (const tarjeta of datos.tarjetas) {
    const idLista = mapaListas[tarjeta.lista];
    if (!idLista) throw new Error(`Lista desconocida en la tarjeta ${tarjeta.id}`);

    const enLista = await get(`/lists/${idLista}/cards`, { fields: "name,desc,due,closed" });
    let actual = enLista.find((c) => c.name === tarjeta.titulo && !c.closed);

    if (!actual) {
      actual = await post("/cards", {
        idList: idLista,
        name: tarjeta.titulo,
        desc: descripcionTarjeta(tarjeta),
        due: vencimientoIso(tarjeta.vence),
        pos: "bottom",
      });
      console.log(`  tarjeta creada: ${tarjeta.id} ${tarjeta.titulo}`);
    } else {
      console.log(`  tarjeta ya existe: ${tarjeta.id}`);
    }

    // Archivar tarjetas que no pertenecen a la especificacion
    for (const sobrante of enLista) {
      if (!sobrante.closed && !titulosEsperados.has(sobrante.name)) {
        await put(`/cards/${sobrante.id}`, { closed: true });
        console.log(`    archivada fuera de especificacion: "${sobrante.name}"`);
      }
    }

    // 6. Checklists e items
    const checklistsActuales = await get(`/cards/${actual.id}/checklists`, { fields: "name" });
    for (const checklist of tarjeta.checklists || []) {
      let cl = checklistsActuales.find((c) => c.name === checklist.titulo);
      if (!cl) {
        cl = await post("/checklists", {
          idCard: actual.id,
          name: checklist.titulo,
          pos: "bottom",
        });
        console.log(`    checklist creada: "${checklist.titulo}"`);
      }

      const itemsActuales = await get(`/checklists/${cl.id}/checkItems`, { fields: "name,state" });
      for (let i = 0; i < checklist.items.length; i += 1) {
        const item = checklist.items[i];
        let existente = itemsActuales.find((x) => x.name === item.texto);
        if (!existente) {
          existente = await post(`/checklists/${cl.id}/checkItems`, {
            name: item.texto,
            pos: i + 1,
          });
        }
        const estado = item.hecho ? "complete" : "incomplete";
        if (existente.state !== estado) {
          await put(`/cards/${actual.id}/checkItem/${existente.id}`, { state: estado });
        }
      }
      const total = checklist.items.length;
      const hechos = checklist.items.filter((x) => x.hecho).length;
      console.log(`      "${checklist.titulo}": ${hechos}/${total}`);
    }

    // 7. Etiquetas de la tarjeta
    const etiquetasTarjeta = await get(`/cards/${actual.id}/idLabels`);
    for (const idEtiqueta of tarjeta.etiquetas || []) {
      const real = mapaEtiquetas[idEtiqueta];
      if (!real) continue;
      if (!etiquetasTarjeta.includes(real)) {
        await post(`/cards/${actual.id}/idLabels`, { value: real });
      }
    }

    // 8. Responsable
    if (tarjeta.miembro) {
      const miembro = buscarMiembro(miembros, tarjeta.miembro);
      if (!miembro) {
        console.log(`      aviso: no hay miembro que coincida con "${tarjeta.miembro}"`);
      } else {
        const asignados = await get(`/cards/${actual.id}/idMembers`);
        if (!asignados.includes(miembro.id)) {
          await post(`/cards/${actual.id}/idMembers`, { value: miembro.id });
          console.log(`      responsable: ${miembro.fullName}`);
        }
      }
    }

    // 9. Comentarios, con el autor real declarado en el texto
    if (tarjeta.comentarios?.length) {
      const acciones = await get(`/cards/${actual.id}/actions`, {
        filter: "commentCard",
        fields: "data",
      });
      for (const comentario of tarjeta.comentarios) {
        const texto = `[${comentario.autor}] ${comentario.texto}`;
        const yaEsta = acciones.some((a) => (a.data?.text || "").includes(comentario.texto));
        if (!yaEsta) {
          await post(`/cards/${actual.id}/actions/comments`, { text: texto });
          console.log(`      comentario de ${comentario.autor}`);
        }
      }
    }
  }

  console.log(`\n  Listo. ${peticiones} peticiones a la API.\n`);
}

// ---------------------------------------------------------------------------
// Verificacion: comparar el tablero real con el JSON
// ---------------------------------------------------------------------------

async function verificar(datos) {
  const problemas = [];
  const tarjetas = await get(`/boards/${BOARD_ARG}/cards`, {
    fields: "name,desc,due,idList,closed",
  });
  const listas = await get(`/boards/${BOARD_ARG}/lists`, { fields: "name,pos" });
  const etiquetas = await get(`/boards/${BOARD_ARG}/labels`, { fields: "name,color" });

  const ordenadas = [...listas].sort((a, b) => a.pos - b.pos);
  if (ordenadas.length !== datos.listas.length) {
    problemas.push(`listas: hay ${ordenadas.length}, el JSON pide ${datos.listas.length}`);
  }
  datos.listas.forEach((l, i) => {
    if (ordenadas[i]?.name !== l.nombre) {
      problemas.push(`lista ${i + 1}: "${ordenadas[i]?.name ?? "(falta)"}" en vez de "${l.nombre}"`);
    }
  });

  for (const e of datos.etiquetas) {
    const color = COLOR_API[e.color] || e.color;
    if (!etiquetas.some((l) => l.color === color && l.name === e.nombre)) {
      problemas.push(`etiqueta "${e.nombre}" (${color}) no existe con ese nombre`);
    }
  }

  const porLista = new Map(ordenadas.map((l) => [l.id, l.name]));
  // Etiquetas y responsables necesitan una lectura por tarjeta (campo no incluido arriba)
  const abiertas = tarjetas.filter((t) => !t.closed);

  for (const t of datos.tarjetas) {
    const real = abiertas.find((c) => c.name === t.titulo);
    if (!real) {
      problemas.push(`falta la tarjeta ${t.id}: "${t.titulo}"`);
      continue;
    }
    const listaEsperada = datos.listas.find((l) => l.id === t.lista)?.nombre;
    if (porLista.get(real.idList) !== listaEsperada) {
      problemas.push(`${t.id}: esta en "${porLista.get(real.idList)}" y deberia estar en "${listaEsperada}"`);
    }
    if ((real.due || "").slice(0, 10) !== (t.vence || "")) {
      problemas.push(`${t.id}: vence ${(real.due || "").slice(0, 10) || "sin fecha"} en vez de ${t.vence || "sin fecha"}`);
    }

    const detalle = await get(`/cards/${real.id}`, {
      fields: "name",
      checklists: "all",
    });
    // idLabels e idMembers no son parametros validos en GET /cards/{id}:
    // hay que leer los subrecursos, o Trello devuelve listas vacias.
    const etiquetasReales = await get(`/cards/${real.id}/idLabels`);
    const miembrosReales = await get(`/cards/${real.id}/idMembers`);
    for (const c of t.checklists || []) {
      const cl = (detalle.checklists || []).find((x) => x.name === c.titulo);
      if (!cl) {
        problemas.push(`${t.id}: falta la checklist "${c.titulo}"`);
        continue;
      }
      const completos = cl.checkItems.filter((i) => i.state === "complete").length;
      const esperados = c.items.filter((i) => i.hecho).length;
      if (cl.checkItems.length !== c.items.length) {
        problemas.push(`${t.id} "${c.titulo}": ${cl.checkItems.length} items en vez de ${c.items.length}`);
      }
      if (completos !== esperados) {
        problemas.push(`${t.id} "${c.titulo}": ${completos} marcados en vez de ${esperados}`);
      }
    }
    const etiquetasEsperadas = (t.etiquetas || []).length;
    if (etiquetasEsperadas && etiquetasReales.length !== etiquetasEsperadas) {
      problemas.push(`${t.id}: ${etiquetasReales.length} etiquetas en vez de ${etiquetasEsperadas}`);
    }
    if (t.miembro && miembrosReales.length === 0) {
      problemas.push(`${t.id}: sin responsable asignado`);
    }
  }

  for (const extra of abiertas) {
    if (!datos.tarjetas.some((t) => t.titulo === extra.name)) {
      problemas.push(`sobra la tarjeta "${extra.name}"`);
    }
  }

  if (problemas.length === 0) {
    console.log("\n  Tablero sincronizado con data/tablero-trello.json. Sin diferencias.\n");
  } else {
    console.log(`\n  ${problemas.length} diferencias:\n`);
    problemas.forEach((p) => console.log(`    · ${p}`));
    console.log("");
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------

async function principal() {
  const datos = leerDatos();

  if (MODO_PLAN) {
    imprimirPlan(datos);
    return;
  }

  if (MODO_VERIFICAR) {
    await verificar(datos);
    return;
  }

  await sincronizar(datos);
  await verificar(datos);
}

principal().catch((error) => {
  console.error(`\n  Error: ${error.message}\n`);
  process.exit(1);
});
