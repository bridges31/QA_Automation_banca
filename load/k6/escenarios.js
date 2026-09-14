/*
 * Escenarios equivalentes en k6, para cuando se necesite mas escala.
 *
 * El motor propio (load/runner.ts) cubre bien hasta unos cientos de usuarios
 * virtuales desde una sola maquina, que es el rango donde trabaja la mayoria de
 * los equipos de QA. Por encima de eso k6 rinde mucho mas: corre sobre Go, usa
 * hilos en vez de un unico bucle de eventos y permite generacion distribuida.
 *
 * Este archivo va en JavaScript a proposito: k6 ejecuta su propio motor y
 * montarle una cadena de compilacion de TypeScript no aporta nada para un
 * guion opcional. El resto del proyecto sigue siendo TypeScript.
 *
 * Instalacion:  https://grafana.com/docs/k6/latest/set-up/install-k6/
 * Ejecucion:    k6 run -e BASE_URL=http://127.0.0.1:4010 load/k6/escenarios.js
 *               k6 run -e ESCENARIO=estres load/k6/escenarios.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:4010';
const API_URL = `${BASE_URL}/api`;
const ESCENARIO = __ENV.ESCENARIO || 'carga';

// Mismo control de destino que el motor propio: sin autorizacion explicita no
// se genera carga contra un host que no sea el local.
const PERMITIDOS = (__ENV.LOAD_ALLOWED_HOSTS || '127.0.0.1,localhost').split(',').map((h) => h.trim());
const HOST = BASE_URL.replace(/^https?:\/\//, '').split(/[:/]/)[0];
if (!PERMITIDOS.includes(HOST)) {
  throw new Error(
    `Destino no autorizado para pruebas de carga: ${HOST}. ` +
      `Declarelo en LOAD_ALLOWED_HOSTS solo si es un ambiente propio y autorizado.`,
  );
}

const ETAPAS = {
  smoke: [{ duration: '10s', target: 1 }],
  carga: [
    { duration: '10s', target: 5 },
    { duration: '30s', target: 20 },
    { duration: '10s', target: 5 },
  ],
  estres: [
    { duration: '15s', target: 10 },
    { duration: '15s', target: 30 },
    { duration: '15s', target: 60 },
    { duration: '15s', target: 100 },
  ],
  pico: [
    { duration: '10s', target: 5 },
    { duration: '5s', target: 80 },
    { duration: '15s', target: 80 },
    { duration: '15s', target: 5 },
  ],
};

const UMBRALES = {
  smoke: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<600'] },
  carga: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<1000'] },
  estres: { http_req_failed: ['rate<0.05'], http_req_duration: ['p(95)<3000'] },
  pico: { http_req_failed: ['rate<0.03'], http_req_duration: ['p(95)<2500'] },
};

export const options = {
  stages: ETAPAS[ESCENARIO] || ETAPAS.carga,
  thresholds: UMBRALES[ESCENARIO] || UMBRALES.carga,
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const duracionLogin = new Trend('duracion_login', true);
const duracionTransferencia = new Trend('duracion_transferencia', true);

/** Cada usuario virtual recibe su propio cliente, para no contender por la misma cuenta. */
export function setup() {
  const credenciales = [];
  const maximo = Math.max(...options.stages.map((etapa) => etapa.target));

  for (let i = 0; i < maximo; i += 1) {
    const respuesta = http.post(
      `${API_URL}/_prueba/aprovisionar`,
      JSON.stringify({ saldoAhorros: 5000000000 }),
      { headers: { 'content-type': 'application/json' } },
    );
    credenciales.push(respuesta.json());
  }
  return { credenciales };
}

export default function (datos) {
  const credencial = datos.credenciales[(__VU - 1) % datos.credenciales.length];
  const json = { headers: { 'content-type': 'application/json' } };

  const acceso = http.post(
    `${API_URL}/auth/login`,
    JSON.stringify({ usuario: credencial.usuario, clave: credencial.clave }),
    json,
  );
  duracionLogin.add(acceso.timings.duration);
  check(acceso, { 'login exitoso': (r) => r.status === 200 });
  if (acceso.status !== 200) return;

  const autenticado = {
    headers: { 'content-type': 'application/json', authorization: `Bearer ${acceso.json('token')}` },
  };

  check(http.get(`${API_URL}/cuentas`, autenticado), { 'cuentas consultadas': (r) => r.status === 200 });
  check(http.get(`${API_URL}/cuentas/${credencial.cuentaAhorros}/movimientos`, autenticado), {
    'movimientos consultados': (r) => r.status === 200,
  });

  const transferencia = http.post(
    `${API_URL}/transferencias`,
    JSON.stringify({
      cuentaOrigen: credencial.cuentaAhorros,
      cuentaDestino: credencial.cuentaTercero,
      valor: 1000,
    }),
    autenticado,
  );
  duracionTransferencia.add(transferencia.timings.duration);
  check(transferencia, { 'transferencia aplicada': (r) => r.status === 201 });

  sleep(0.3);
}
