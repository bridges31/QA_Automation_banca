/**
 * Humo del sitio publico.
 *
 * Es la revision de rutina que conviene dejar corriendo a diario: detecta
 * caidas, enlaces rotos y errores de consola antes de que los reporte un
 * cliente.
 */

import { test, expect } from '../../../src/fixtures/prueba.ts';

const PAGINAS_PUBLICAS = [
  { ruta: '/', titulo: /Ingreso/ },
  { ruta: '/registro.html', titulo: /Apertura de cuenta/ },
];

test.describe('Sitio publico @smoke', () => {
  for (const pagina of PAGINAS_PUBLICAS) {
    test(`${pagina.ruta} responde y tiene titulo descriptivo`, async ({ page }) => {
      const respuesta = await page.goto(pagina.ruta);

      expect(respuesta?.status()).toBe(200);
      await expect(page).toHaveTitle(pagina.titulo);
      await expect(page.locator('h1')).toBeVisible();
    });

    test(`${pagina.ruta} no produce errores de consola`, async ({ page }) => {
      const errores: string[] = [];
      page.on('console', (mensaje) => {
        if (mensaje.type() === 'error') errores.push(mensaje.text());
      });
      page.on('pageerror', (error) => errores.push(error.message));

      await page.goto(pagina.ruta);
      await page.waitForLoadState('networkidle');

      expect(errores).toEqual([]);
    });
  }

  test('ningun enlace del sitio publico esta roto', async ({ page }) => {
    const rotos: Array<{ enlace: string; estado: number }> = [];

    for (const pagina of PAGINAS_PUBLICAS) {
      await page.goto(pagina.ruta);
      const destinos = await page.locator('a[href]').evaluateAll((enlaces) =>
        enlaces.map((enlace) => (enlace as HTMLAnchorElement).href),
      );

      for (const destino of destinos) {
        if (!destino.startsWith('http')) continue;
        const respuesta = await page.request.get(destino);
        if (respuesta.status() >= 400) rotos.push({ enlace: destino, estado: respuesta.status() });
      }
    }

    expect(rotos).toEqual([]);
  });

  test('la hoja de estilos se carga: la pagina no queda sin formato', async ({ page }) => {
    await page.goto('/');

    // Si el CSS no carga, el boton queda con el fondo por defecto del navegador
    // y el cliente ve una pagina rota aunque el HTML este bien.
    const fondo = await page
      .locator('[data-test="boton-ingresar"]')
      .evaluate((elemento) => getComputedStyle(elemento).backgroundColor);

    expect(fondo).not.toBe('rgba(0, 0, 0, 0)');
    expect(fondo).not.toBe('transparent');
  });

  test('el ingreso se puede usar desde un telefono @movil', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('[data-test="campo-usuario"]')).toBeVisible();
    await expect(page.locator('[data-test="boton-ingresar"]')).toBeVisible();

    // Un desbordamiento horizontal obliga al cliente a hacer scroll lateral
    // para ver el formulario: es de los reclamos mas comunes en banca movil.
    const desbordamiento = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(desbordamiento).toBeLessThanOrEqual(1);
  });
});
