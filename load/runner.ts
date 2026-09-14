/**
 * Motor de pruebas de carga sobre la API del banco.
 *
 * Usa el cliente HTTP de Playwright, de modo que la suite funcional y la de
 * carga comparten dependencias y lenguaje. Para cargas realmente grandes
 * (miles de usuarios virtuales, generacion distribuida) conviene k6: ver
 * load/k6/. Este motor cubre bien el rango que necesita un equipo de QA
 * bancario para detectar degradacion antes de liberar.
 *
 * Uso:
 *   npm run load:smoke
 *   npm run load:carga
 *   npx tsx load/runner.ts --escenario=estres
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { request, type APIRequestContext } from 'playwright';

import { ESCENARIOS, duracionTotal, vusMaximos, type Escenario } from './escenarios.ts';
import { verificarDestinoAutorizado } from './guardia.ts';
import { resumir, type Muestra, type Resumen } from './metricas.ts';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:4010';
const API_URL = process.env.API_URL ?? `${BASE_URL}/api`;

function argumento(nombre: string, porDefecto: string): string {
  const encontrado = process.argv.find((valor) => valor.startsWith(`--${nombre}=`));
  return encontrado ? encontrado.split('=')[1]! : porDefecto;
}

const dormir = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

interface Credenciales {
  usuario: string;
  clave: string;
  cuentaAhorros: string;
  cuentaTercero: string;
}

/**
 * Prepara un cliente por usuario virtual.
 *
 * Cada VU necesita el suyo: si todos compartieran cuenta, la contencion sobre
 * ese registro seria un artefacto de la prueba y no un hallazgo real, y ademas
 * el limite diario cortaria la corrida a los pocos segundos.
 */
async function aprovisionar(peticion: APIRequestContext): Promise<Credenciales> {
  const respuesta = await peticion.post(`${API_URL}/_prueba/aprovisionar`, {
    data: { saldoAhorros: 5_000_000_000 },
  });
  if (respuesta.status() !== 201) {
    throw new Error(
      `No se pudo aprovisionar un usuario virtual (HTTP ${respuesta.status()}). ` +
        'Contra un ambiente real reemplace esta funcion por la carga de datos de ese ambiente.',
    );
  }
  return (await respuesta.json()) as Credenciales;
}

/** Ejecuta una peticion, la cronometra y registra la muestra. */
async function medir<T extends { status: number }>(
  muestras: Muestra[],
  inicioCorrida: number,
  etiqueta: string,
  accion: () => Promise<T>,
): Promise<T | null> {
  const inicio = performance.now();
  try {
    const respuesta = await accion();
    muestras.push({
      etiqueta,
      duracion: performance.now() - inicio,
      ok: respuesta.status < 400,
      estado: respuesta.status,
      instante: inicio - inicioCorrida,
    });
    return respuesta;
  } catch {
    muestras.push({
      etiqueta,
      duracion: performance.now() - inicio,
      ok: false,
      estado: 0,
      instante: inicio - inicioCorrida,
    });
    return null;
  }
}

/**
 * Recorrido de un usuario virtual: lo que hace un cliente real al entrar a la
 * banca en linea. Mezcla lecturas (mayoria) con una escritura, que es el perfil
 * tipico de trafico bancario.
 */
async function iteracion(
  peticion: APIRequestContext,
  credenciales: Credenciales,
  muestras: Muestra[],
  inicioCorrida: number,
): Promise<void> {
  const acceso = await medir(muestras, inicioCorrida, 'login', async () => {
    const respuesta = await peticion.post(`${API_URL}/auth/login`, {
      data: { usuario: credenciales.usuario, clave: credenciales.clave },
    });
    const cuerpo = (await respuesta.json().catch(() => ({}))) as { token?: string };
    return { status: respuesta.status(), cuerpo };
  });

  const token = acceso?.cuerpo.token;
  if (!token) return;
  const cabeceras = { authorization: `Bearer ${token}` };

  await medir(muestras, inicioCorrida, 'consultar-cuentas', async () => ({
    status: (await peticion.get(`${API_URL}/cuentas`, { headers: cabeceras })).status(),
  }));

  await medir(muestras, inicioCorrida, 'consultar-movimientos', async () => ({
    status: (
      await peticion.get(`${API_URL}/cuentas/${credenciales.cuentaAhorros}/movimientos`, { headers: cabeceras })
    ).status(),
  }));

  await medir(muestras, inicioCorrida, 'transferir', async () => ({
    status: (
      await peticion.post(`${API_URL}/transferencias`, {
        headers: cabeceras,
        data: {
          cuentaOrigen: credenciales.cuentaAhorros,
          cuentaDestino: credenciales.cuentaTercero,
          valor: 1_000,
        },
      })
    ).status(),
  }));
}

function imprimirResumen(resumen: Resumen, escenario: Escenario, cumple: boolean): void {
  const linea = '-'.repeat(84);
  console.log(`\n${linea}`);
  console.log(`  Escenario: ${resumen.escenario}  |  Destino: ${resumen.destino}`);
  console.log(`  ${escenario.descripcion}`);
  console.log(linea);
  console.log(
    `  Duracion: ${resumen.duracionSegundos}s   VUs maximos: ${resumen.vusMaximos}   ` +
      `Peticiones: ${resumen.peticiones}   RPS: ${resumen.rps}`,
  );
  console.log(`  Errores: ${resumen.errores} (${resumen.tasaError}%)`);
  console.log(linea);
  console.log(
    '  ' +
      'operacion'.padEnd(24) +
      'n'.padStart(7) +
      'err%'.padStart(8) +
      'p50'.padStart(9) +
      'p95'.padStart(9) +
      'p99'.padStart(9) +
      'max'.padStart(9),
  );
  for (const grupo of [...resumen.porEtiqueta, resumen.general]) {
    console.log(
      '  ' +
        grupo.etiqueta.padEnd(24) +
        String(grupo.peticiones).padStart(7) +
        String(grupo.tasaError).padStart(8) +
        String(grupo.p50).padStart(9) +
        String(grupo.p95).padStart(9) +
        String(grupo.p99).padStart(9) +
        String(grupo.max).padStart(9),
    );
  }
  console.log(linea);
  console.log(
    `  Umbrales: tasa de error <= ${escenario.umbrales.tasaErrorMaxima}%  |  ` +
      `p95 <= ${escenario.umbrales.p95Maximo} ms`,
  );
  console.log(`  Resultado: ${cumple ? 'CUMPLE' : 'NO CUMPLE'}`);
  console.log(`${linea}\n`);
}

async function principal(): Promise<void> {
  const nombre = argumento('escenario', 'smoke');
  const escenario = ESCENARIOS[nombre];
  if (!escenario) {
    console.error(`Escenario desconocido: "${nombre}". Disponibles: ${Object.keys(ESCENARIOS).join(', ')}`);
    process.exit(2);
  }

  verificarDestinoAutorizado(BASE_URL);

  const totalVus = vusMaximos(escenario);
  const segundos = duracionTotal(escenario);
  console.log(
    `\nPreparando escenario "${escenario.nombre}": ${totalVus} usuarios virtuales, ~${segundos}s contra ${BASE_URL}`,
  );

  const contexto = await request.newContext({ ignoreHTTPSErrors: false });

  // Comprobacion previa: sin ella, un ambiente caido se manifiesta como cientos
  // de errores de conexion en las metricas en vez de un mensaje claro.
  try {
    const salud = await contexto.get(`${API_URL}/health`, { timeout: 5_000 });
    if (salud.status() !== 200) {
      throw new Error(`respondio HTTP ${salud.status()}`);
    }
  } catch (error) {
    await contexto.dispose();
    throw new Error(
      `El ambiente no responde en ${API_URL}/health (${error instanceof Error ? error.message : error}).\n` +
        '  Si esta usando el banco demo, levantelo primero:  npm run bank',
    );
  }

  const credenciales: Credenciales[] = [];
  for (let i = 0; i < totalVus; i += 1) {
    credenciales.push(await aprovisionar(contexto));
  }

  const muestras: Muestra[] = [];
  const inicioCorrida = performance.now();
  const inicio = new Date();
  let vusActivos = 0;
  let detener = false;

  // Un trabajador por usuario virtual maximo; queda en espera mientras la
  // etapa en curso pida menos concurrencia de la que puede atender.
  const trabajadores = credenciales.map(async (credencial, indice) => {
    while (!detener) {
      if (indice >= vusActivos) {
        await dormir(100);
        continue;
      }
      await iteracion(contexto, credencial, muestras, inicioCorrida);
      await dormir(escenario.pausaMs);
    }
  });

  for (const etapa of escenario.etapas) {
    vusActivos = etapa.vus;
    console.log(`  etapa: ${etapa.vus} VUs durante ${etapa.segundos}s`);
    await dormir(etapa.segundos * 1_000);
  }

  detener = true;
  await Promise.all(trabajadores);
  await contexto.dispose();

  const resumen = resumir(muestras, {
    escenario: escenario.nombre,
    destino: BASE_URL,
    inicio,
    duracionSegundos: (performance.now() - inicioCorrida) / 1_000,
    vusMaximos: totalVus,
  });

  const cumple =
    resumen.tasaError <= escenario.umbrales.tasaErrorMaxima &&
    resumen.general.p95 <= escenario.umbrales.p95Maximo;

  imprimirResumen(resumen, escenario, cumple);

  await mkdir('reportes', { recursive: true });
  const archivo = `reportes/carga-${escenario.nombre}.json`;
  await writeFile(archivo, JSON.stringify({ ...resumen, umbrales: escenario.umbrales, cumple }, null, 2));
  console.log(`  Reporte detallado: ${archivo}\n`);

  process.exit(cumple ? 0 : 1);
}

principal().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});
