/**
 * Cliente de la API del banco.
 *
 * Envuelve la capa REST para que las pruebas de API expresen intencion de
 * negocio ("transferir", "consultarSaldo") en vez de rutas y cabeceras, y para
 * que las pruebas de UI puedan montar su estado previo por API en lugar de
 * navegar por la interfaz, que es lento y fragil.
 *
 * Los metodos NO lanzan ante respuestas de error: devuelven estado y cuerpo,
 * porque en banca la mitad de los casos de prueba son justamente los rechazos
 * (saldo insuficiente, limite diario, acceso denegado).
 */

import type { APIRequestContext, APIResponse } from '@playwright/test';

export interface RespuestaApi<T = Record<string, unknown>> {
  estado: number;
  cuerpo: T;
  respuesta: APIResponse;
}

export interface Cuenta {
  id: string;
  clienteId: string;
  tipo: 'ahorros' | 'corriente';
  saldo: number;
}

export interface Transferencia {
  id: string;
  cuentaOrigen: string;
  cuentaDestino: string;
  valor: number;
  gmf: number;
  totalDebitado: number;
  saldoOrigen: number;
  fecha: string;
}

export interface ErrorApi {
  codigo: string;
  mensaje: string;
  errores?: Record<string, string>;
}

export class ClienteBanco {
  private token: string | undefined;

  constructor(
    private readonly peticion: APIRequestContext,
    private readonly apiUrl: string,
  ) {}

  /** Token de la sesion vigente, si se autentico. */
  get tokenActual(): string | undefined {
    return this.token;
  }

  usarToken(token: string | undefined): void {
    this.token = token;
  }

  private get cabeceras(): Record<string, string> {
    return this.token ? { authorization: `Bearer ${this.token}` } : {};
  }

  private async envolver<T>(respuesta: APIResponse): Promise<RespuestaApi<T>> {
    const texto = await respuesta.text();
    let cuerpo: T;
    try {
      cuerpo = texto ? (JSON.parse(texto) as T) : ({} as T);
    } catch {
      cuerpo = { textoCrudo: texto } as unknown as T;
    }
    return { estado: respuesta.status(), cuerpo, respuesta };
  }

  async salud(): Promise<RespuestaApi<{ estado: string; hora: string }>> {
    return this.envolver<{ estado: string; hora: string }>(await this.peticion.get(`${this.apiUrl}/health`));
  }

  async reiniciarDatos(): Promise<void> {
    await this.peticion.post(`${this.apiUrl}/_prueba/reiniciar`);
  }

  async caducarSesion(token: string): Promise<void> {
    await this.peticion.post(`${this.apiUrl}/_prueba/caducar-sesion`, { data: { token } });
  }

  async login(
    usuario: string,
    clave: string,
  ): Promise<RespuestaApi<{ token: string; cliente: { id: string; nombre: string } } & ErrorApi>> {
    const resultado = await this.envolver<{ token: string; cliente: { id: string; nombre: string } } & ErrorApi>(
      await this.peticion.post(`${this.apiUrl}/auth/login`, { data: { usuario, clave } }),
    );
    if (resultado.estado === 200) this.token = resultado.cuerpo.token;
    return resultado;
  }

  /** Autentica y falla de inmediato si no lo consigue: para preparar estado, no para verificar. */
  async loginObligatorio(usuario: string, clave: string): Promise<string> {
    const resultado = await this.login(usuario, clave);
    if (resultado.estado !== 200) {
      throw new Error(
        `No se pudo autenticar a "${usuario}" (HTTP ${resultado.estado}: ${resultado.cuerpo.codigo ?? 'sin codigo'})`,
      );
    }
    return resultado.cuerpo.token;
  }

  async logout(): Promise<RespuestaApi> {
    const resultado = await this.envolver<Record<string, unknown>>(
      await this.peticion.post(`${this.apiUrl}/auth/logout`, { headers: this.cabeceras }),
    );
    this.token = undefined;
    return resultado;
  }

  async cuentas(): Promise<RespuestaApi<{ cuentas: Cuenta[] } & ErrorApi>> {
    return this.envolver(await this.peticion.get(`${this.apiUrl}/cuentas`, { headers: this.cabeceras }));
  }

  async cuenta(id: string): Promise<RespuestaApi<{ cuenta: Cuenta } & ErrorApi>> {
    return this.envolver(await this.peticion.get(`${this.apiUrl}/cuentas/${id}`, { headers: this.cabeceras }));
  }

  async saldoDe(id: string): Promise<number> {
    const resultado = await this.cuenta(id);
    if (resultado.estado !== 200) {
      throw new Error(`No se pudo consultar el saldo de ${id} (HTTP ${resultado.estado})`);
    }
    return resultado.cuerpo.cuenta.saldo;
  }

  async movimientos(
    id: string,
  ): Promise<RespuestaApi<{ movimientos: Array<{ descripcion: string; valor: number }> } & ErrorApi>> {
    return this.envolver(
      await this.peticion.get(`${this.apiUrl}/cuentas/${id}/movimientos`, { headers: this.cabeceras }),
    );
  }

  async transferir(
    datos: { cuentaOrigen: string; cuentaDestino: string; valor: unknown },
    opciones: { claveIdempotencia?: string } = {},
  ): Promise<RespuestaApi<{ transferencia: Transferencia } & ErrorApi>> {
    const cabeceras = { ...this.cabeceras };
    if (opciones.claveIdempotencia) cabeceras['idempotency-key'] = opciones.claveIdempotencia;
    return this.envolver(
      await this.peticion.post(`${this.apiUrl}/transferencias`, { headers: cabeceras, data: datos }),
    );
  }

  async pagar(datos: {
    cuentaOrigen: string;
    convenio: string;
    referencia: string;
    valor: unknown;
  }): Promise<RespuestaApi<{ pago: { id: string; valor: number; saldoOrigen: number } } & ErrorApi>> {
    return this.envolver(
      await this.peticion.post(`${this.apiUrl}/pagos`, { headers: this.cabeceras, data: datos }),
    );
  }

  async convenios(): Promise<
    RespuestaApi<{ convenios: Array<{ codigo: string; nombre: string; patronReferencia: string }> }>
  > {
    return this.envolver(await this.peticion.get(`${this.apiUrl}/convenios`));
  }

  async registrar(
    datos: object,
  ): Promise<RespuestaApi<{ cliente: { id: string; usuario: string }; cuenta: { id: string } } & ErrorApi>> {
    return this.envolver(await this.peticion.post(`${this.apiUrl}/clientes`, { data: datos }));
  }
}
