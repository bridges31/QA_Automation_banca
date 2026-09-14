/**
 * Accesibilidad (WCAG 2.1 AA).
 *
 * En Colombia la accesibilidad de los canales digitales dejo de ser opcional
 * (Resolucion 1519 de 2020 y los lineamientos de la Superintendencia
 * Financiera sobre atencion a personas con discapacidad). Un hallazgo de axe
 * es evidencia objetiva y reproducible para el equipo de desarrollo.
 */

import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../../src/fixtures/prueba.ts';

const ETIQUETAS_WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test.describe('Accesibilidad', () => {
  test('la pagina de ingreso cumple WCAG 2.1 AA @smoke', async ({ page }) => {
    await page.goto('/');

    const resultado = await new AxeBuilder({ page }).withTags(ETIQUETAS_WCAG).analyze();

    expect(resultado.violations).toEqual([]);
  });

  test('la apertura de cuenta cumple WCAG 2.1 AA', async ({ page }) => {
    await page.goto('/registro.html');

    const resultado = await new AxeBuilder({ page }).withTags(ETIQUETAS_WCAG).analyze();

    expect(resultado.violations).toEqual([]);
  });

  test('el portal transaccional cumple WCAG 2.1 AA', async ({ portal }) => {
    const resultado = await new AxeBuilder({ page: portal.pagina }).withTags(ETIQUETAS_WCAG).analyze();

    expect(resultado.violations).toEqual([]);
  });

  test('los campos del formulario de ingreso tienen etiqueta asociada', async ({ page }) => {
    await page.goto('/');

    // Sin label asociado el lector de pantalla anuncia "campo de edicion" y el
    // cliente no sabe que escribir.
    for (const id of ['usuario', 'clave']) {
      await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1);
    }
  });
});
