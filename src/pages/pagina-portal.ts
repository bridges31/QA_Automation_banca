/** Portal transaccional: productos, transferencias y pago de servicios. */

import type { Locator, Page } from '@playwright/test';
import { PaginaBase } from './pagina-base.ts';
import { aNumero } from '../utils/dinero.ts';

export class PaginaPortal extends PaginaBase {
  readonly nombreCliente: Locator;
  readonly botonSalir: Locator;
  readonly mensaje: Locator;
  readonly filasCuenta: Locator;
  readonly comprobante: Locator;
  readonly filasMovimiento: Locator;

  constructor(pagina: Page) {
    super(pagina);
    this.nombreCliente = this.porTest('nombre-cliente');
    this.botonSalir = this.porTest('boton-salir');
    this.mensaje = this.porTest('mensaje');
    this.filasCuenta = this.porTest('fila-cuenta');
    this.comprobante = this.porTest('comprobante');
    this.filasMovimiento = this.porTest('fila-movimiento');
  }

  async abrir(): Promise<void> {
    await this.irA('/portal.html');
  }

  // --- Productos ---

  filaCuenta(cuentaId: string): Locator {
    return this.pagina.locator(`[data-test="fila-cuenta"][data-cuenta="${cuentaId}"]`);
  }

  /** Saldo mostrado en pantalla, convertido a entero en pesos. */
  async saldoEnPantalla(cuentaId: string): Promise<number> {
    const texto = await this.filaCuenta(cuentaId).locator('[data-test="saldo-cuenta"]').innerText();
    return aNumero(texto);
  }

  async verMovimientos(cuentaId: string): Promise<void> {
    await this.filaCuenta(cuentaId).locator('[data-test="ver-movimientos"]').click();
  }

  // --- Navegacion ---

  async abrirPestana(nombre: 'cuentas' | 'transferencia' | 'pagos'): Promise<void> {
    await this.porTest(`pestana-${nombre}`).click();
  }

  // --- Transferencias ---

  /** Diligencia y envia una transferencia. No verifica el resultado. */
  async transferir(datos: { origen: string; destino: string; valor: number | string }): Promise<void> {
    await this.abrirPestana('transferencia');
    await this.porTest('select-origen').selectOption(datos.origen);
    await this.porTest('campo-destino').fill(datos.destino);
    await this.porTest('campo-valor').fill(String(datos.valor));
    await this.porTest('boton-transferir').click();
  }

  async valoresComprobante(): Promise<{ id: string; valor: number; gmf: number; total: number; saldo: number }> {
    return {
      id: (await this.porTest('comprobante-id').innerText()).trim(),
      valor: aNumero(await this.porTest('comprobante-valor').innerText()),
      gmf: aNumero(await this.porTest('comprobante-gmf').innerText()),
      total: aNumero(await this.porTest('comprobante-total').innerText()),
      saldo: aNumero(await this.porTest('comprobante-saldo').innerText()),
    };
  }

  // --- Pago de servicios ---

  async pagarServicio(datos: {
    cuenta: string;
    convenio: string;
    referencia: string;
    valor: number | string;
  }): Promise<void> {
    await this.abrirPestana('pagos');
    await this.porTest('select-cuenta-pago').selectOption(datos.cuenta);
    await this.porTest('select-convenio').selectOption(datos.convenio);
    await this.porTest('campo-referencia').fill(datos.referencia);
    await this.porTest('campo-valor-pago').fill(String(datos.valor));
    await this.porTest('boton-pagar').click();
  }

  // --- Sesion ---

  async cerrarSesion(): Promise<void> {
    await this.botonSalir.click();
  }

  async codigoMensaje(): Promise<string | null> {
    return this.mensaje.getAttribute('data-codigo');
  }
}
