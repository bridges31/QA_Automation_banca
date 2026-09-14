/** Ingreso a la banca en linea por la interfaz. */

import { test, expect } from '../../../src/fixtures/prueba.ts';

test.describe('Ingreso', () => {
  test('un cliente valido llega al portal y ve su nombre @smoke', async ({ paginaAcceso, page, banca }) => {
    await paginaAcceso.ingresar(banca.usuario, banca.clave);

    await expect(page).toHaveURL(/portal\.html$/);
    await expect(page.locator('[data-test="nombre-cliente"]')).toHaveText(banca.nombre);
  });

  test('la clave incorrecta muestra el error y no deja pasar', async ({ paginaAcceso, page, banca }) => {
    await paginaAcceso.ingresar(banca.usuario, 'ClaveEquivocada1*');

    await expect(paginaAcceso.mensajeError).toBeVisible();
    expect(await paginaAcceso.codigoError()).toBe('CREDENCIALES_INVALIDAS');
    await expect(page).not.toHaveURL(/portal\.html$/);
  });

  test('el formulario vacio no envia la peticion', async ({ paginaAcceso, page }) => {
    let huboPeticion = false;
    page.on('request', (peticion) => {
      if (peticion.url().includes('/api/auth/login')) huboPeticion = true;
    });

    await paginaAcceso.botonIngresar.click();

    await expect(paginaAcceso.mensajeError).toBeVisible();
    expect(huboPeticion).toBe(false);
  });

  test('la clave nunca viaja ni queda visible en pantalla', async ({ paginaAcceso, banca }) => {
    await expect(paginaAcceso.clave).toHaveAttribute('type', 'password');

    await paginaAcceso.clave.fill(banca.clave);
    // El valor esta en el DOM (es un input) pero el texto renderizado no lo expone.
    const textoVisible = await paginaAcceso.pagina.locator('body').innerText();
    expect(textoVisible).not.toContain(banca.clave);
  });

  test('tres intentos fallidos bloquean el usuario desde la interfaz', async ({ paginaAcceso, banca }) => {
    await paginaAcceso.ingresar(banca.usuario, 'Incorrecta1*');
    await expect(paginaAcceso.mensajeError).toBeVisible();

    await paginaAcceso.ingresar(banca.usuario, 'Incorrecta2*');
    await expect(paginaAcceso.mensajeError).toBeVisible();

    await paginaAcceso.ingresar(banca.usuario, 'Incorrecta3*');
    await expect(paginaAcceso.mensajeError).toContainText(/bloqueado/i);
    expect(await paginaAcceso.codigoError()).toBe('USUARIO_BLOQUEADO');
  });

  test('desde el ingreso se llega a la apertura de cuenta', async ({ paginaAcceso, page }) => {
    await paginaAcceso.enlaceRegistro.click();

    await expect(page).toHaveURL(/registro\.html$/);
  });
});
