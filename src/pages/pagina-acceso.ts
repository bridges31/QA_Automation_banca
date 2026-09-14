/** Pagina de ingreso a la banca en linea. */

import type { Locator, Page } from '@playwright/test';
import { PaginaBase } from './pagina-base.ts';

export class PaginaAcceso extends PaginaBase {
  readonly usuario: Locator;
  readonly clave: Locator;
  readonly botonIngresar: Locator;
  readonly mensajeError: Locator;
  readonly enlaceRegistro: Locator;

  constructor(pagina: Page) {
    super(pagina);
    this.usuario = this.porTest('campo-usuario');
    this.clave = this.porTest('campo-clave');
    this.botonIngresar = this.porTest('boton-ingresar');
    this.mensajeError = this.porTest('mensaje-error');
    this.enlaceRegistro = this.porTest('enlace-registro');
  }

  async abrir(): Promise<void> {
    await this.irA('/');
  }

  /** Diligencia y envia el formulario. No verifica el resultado. */
  async ingresar(usuario: string, clave: string): Promise<void> {
    await this.usuario.fill(usuario);
    await this.clave.fill(clave);
    await this.botonIngresar.click();
  }

  /** Codigo de negocio del rechazo, expuesto en el DOM para aserciones estables. */
  async codigoError(): Promise<string | null> {
    return this.mensajeError.getAttribute('data-codigo');
  }
}
