/**
 * Base de los Page Objects.
 *
 * Toda localizacion pasa por el atributo data-test. Esa es la leccion que deja
 * automatizar plataformas low-code como Appian: el HTML generado cambia entre
 * versiones y los selectores basados en clases, posicion o XPath se rompen en
 * cada despliegue. Un atributo puesto a proposito para pruebas (data-test aqui,
 * testLabel en los componentes SAIL de Appian) es el unico selector que
 * sobrevive. Negocielo con el equipo de desarrollo antes de escribir la primera
 * prueba.
 */

import type { Locator, Page } from '@playwright/test';

export abstract class PaginaBase {
  /** Publico para que las pruebas puedan usar APIs de Playwright no envueltas aqui. */
  readonly pagina: Page;

  constructor(pagina: Page) {
    this.pagina = pagina;
  }

  /** Localiza por el atributo data-test, el contrato de pruebas con la UI. */
  protected porTest(nombre: string): Locator {
    return this.pagina.locator(`[data-test="${nombre}"]`);
  }

  async irA(ruta: string): Promise<void> {
    await this.pagina.goto(ruta);
  }

  async titulo(): Promise<string> {
    return this.pagina.title();
  }
}
