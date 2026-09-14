/**
 * Fixtures de la suite.
 *
 * Dos decisiones de diseno que sostienen todo lo demas:
 *
 * 1. Cada prueba recibe su PROPIO cliente con saldos conocidos (fixture
 *    `banca`). Nada de compartir los datos semilla: asi las pruebas corren en
 *    paralelo sin pisarse y ninguna depende del orden de ejecucion.
 * 2. La autenticacion para las pruebas que NO verifican el ingreso se hace por
 *    API e inyeccion de sesion, no navegando el formulario. Es mas rapido y,
 *    sobre todo, evita que una falla del login tumbe cincuenta pruebas que en
 *    realidad verifican otra cosa.
 */

import { test as base, expect, type APIRequestContext } from '@playwright/test';

import { ClienteBanco } from '../api/cliente-banco.ts';
import { PaginaAcceso } from '../pages/pagina-acceso.ts';
import { PaginaPortal } from '../pages/pagina-portal.ts';
import { PaginaRegistro } from '../pages/pagina-registro.ts';
import { entorno } from '../utils/entorno.ts';

/** Cliente aislado, con saldos conocidos y una cuenta de tercero disponible. */
export interface ContextoBanca {
  usuario: string;
  clave: string;
  clienteId: string;
  nombre: string;
  /** Cuenta de ahorros del titular. */
  cuentaAhorros: string;
  /** Segunda cuenta del MISMO titular: sirve para verificar la exencion de GMF. */
  cuentaCorriente: string;
  /** Cuenta de OTRO titular: transferir aqui causa GMF y consultarla debe dar 403. */
  cuentaTercero: string;
  saldoAhorros: number;
  saldoCorriente: number;
  token: string;
  api: ClienteBanco;
}

interface Fixtures {
  api: ClienteBanco;
  banca: ContextoBanca;
  paginaAcceso: PaginaAcceso;
  paginaRegistro: PaginaRegistro;
  portal: PaginaPortal;
}

/**
 * Crea un cliente de prueba aislado y lo deja autenticado.
 *
 * Expuesto ademas del fixture porque algunos escenarios necesitan saldos
 * distintos del valor por defecto (limite diario, saldo insuficiente).
 */
export async function aprovisionarBanca(
  peticion: APIRequestContext,
  saldos: { saldoAhorros?: number; saldoCorriente?: number } = {},
): Promise<ContextoBanca> {
  const respuesta = await peticion.post(`${entorno.apiUrl}/_prueba/aprovisionar`, { data: saldos });
  if (respuesta.status() !== 201) {
    throw new Error(
      `No se pudo aprovisionar datos de prueba (HTTP ${respuesta.status()}). ` +
        'Este fixture requiere el banco demo local; contra un ambiente real debe reemplazarse ' +
        'por el mecanismo de carga de datos que ofrezca ese ambiente.',
    );
  }
  const datos = (await respuesta.json()) as Omit<ContextoBanca, 'token' | 'api'>;
  const api = new ClienteBanco(peticion, entorno.apiUrl);
  const token = await api.loginObligatorio(datos.usuario, datos.clave);
  return { ...datos, token, api };
}

export const test = base.extend<Fixtures>({
  /** Cliente de API sin autenticar: punto de partida de las pruebas de servicio. */
  api: async ({ request }, use) => {
    await use(new ClienteBanco(request, entorno.apiUrl));
  },

  banca: async ({ request }, use) => {
    await use(await aprovisionarBanca(request));
  },

  paginaAcceso: async ({ page }, use) => {
    const pagina = new PaginaAcceso(page);
    await pagina.abrir();
    await use(pagina);
  },

  paginaRegistro: async ({ page }, use) => {
    const pagina = new PaginaRegistro(page);
    await pagina.abrir();
    await use(pagina);
  },

  /**
   * Portal ya autenticado como el cliente de `banca`.
   *
   * Ojo: la sesion se reinyecta en cada navegacion, asi que este fixture NO
   * sirve para verificar cierre de sesion ni expiracion. Esas pruebas deben
   * autenticarse por la interfaz.
   */
  portal: async ({ page, banca }, use) => {
    await page.addInitScript((sesion) => {
      sessionStorage.setItem('token', sesion.token);
      sessionStorage.setItem('cliente', JSON.stringify(sesion.cliente));
    }, { token: banca.token, cliente: { id: banca.clienteId, nombre: banca.nombre } });

    const portal = new PaginaPortal(page);
    await portal.abrir();
    await use(portal);
  },
});

export { expect };
export { entorno } from '../utils/entorno.ts';
