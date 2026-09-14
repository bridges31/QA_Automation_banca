/** Apertura de cuenta: onboarding digital. */

import type { Locator, Page } from '@playwright/test';
import { PaginaBase } from './pagina-base.ts';
import type { ClienteSintetico } from '../data/sinteticos.ts';

export class PaginaRegistro extends PaginaBase {
  readonly mensaje: Locator;
  readonly botonRegistrar: Locator;

  constructor(pagina: Page) {
    super(pagina);
    this.mensaje = this.porTest('mensaje');
    this.botonRegistrar = this.porTest('boton-registrar');
  }

  async abrir(): Promise<void> {
    await this.irA('/registro.html');
  }

  /** Mensaje de validacion asociado a un campo del formulario. */
  errorDe(campo: 'nombre' | 'documento' | 'correo' | 'usuario' | 'clave' | 'fecha-nacimiento'): Locator {
    return this.porTest(`error-${campo}`);
  }

  async diligenciar(datos: Partial<ClienteSintetico>): Promise<void> {
    if (datos.nombre !== undefined) await this.porTest('campo-nombre').fill(datos.nombre);
    if (datos.documento !== undefined) await this.porTest('campo-documento').fill(datos.documento);
    if (datos.fechaNacimiento !== undefined) {
      await this.porTest('campo-fecha-nacimiento').fill(datos.fechaNacimiento);
    }
    if (datos.correo !== undefined) await this.porTest('campo-correo').fill(datos.correo);
    if (datos.usuario !== undefined) await this.porTest('campo-usuario').fill(datos.usuario);
    if (datos.clave !== undefined) await this.porTest('campo-clave').fill(datos.clave);
  }

  async enviar(): Promise<void> {
    await this.botonRegistrar.click();
  }

  async registrar(datos: Partial<ClienteSintetico>): Promise<void> {
    await this.diligenciar(datos);
    await this.enviar();
  }
}
