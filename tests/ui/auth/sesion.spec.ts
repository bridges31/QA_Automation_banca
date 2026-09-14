/**
 * Manejo de sesion.
 *
 * Estas pruebas se autentican por la interfaz a proposito: el fixture `portal`
 * reinyecta la sesion en cada navegacion, lo que impediria observar el cierre
 * de sesion y la expiracion.
 */

import { test, expect } from '../../../src/fixtures/prueba.ts';
import { PaginaPortal } from '../../../src/pages/pagina-portal.ts';

test.describe('Sesion', () => {
  test('cerrar sesion devuelve al ingreso y limpia el token', async ({ paginaAcceso, page, banca }) => {
    await paginaAcceso.ingresar(banca.usuario, banca.clave);
    await expect(page).toHaveURL(/portal\.html$/);

    await new PaginaPortal(page).cerrarSesion();

    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(() => sessionStorage.getItem('token'))).toBeNull();
  });

  test('el token queda invalidado en el servidor al cerrar sesion', async ({
    paginaAcceso,
    page,
    banca,
    api,
  }) => {
    await paginaAcceso.ingresar(banca.usuario, banca.clave);
    await expect(page).toHaveURL(/portal\.html$/);
    const token = await page.evaluate(() => sessionStorage.getItem('token'));

    await new PaginaPortal(page).cerrarSesion();
    await expect(page).toHaveURL(/\/$/);

    // Reutilizar el token robado tras el cierre de sesion no debe funcionar.
    api.usarToken(token ?? undefined);
    expect((await api.cuentas()).estado).toBe(401);
  });

  test('la sesion expirada expulsa al cliente del portal', async ({ paginaAcceso, page, banca, api }) => {
    await paginaAcceso.ingresar(banca.usuario, banca.clave);
    await expect(page).toHaveURL(/portal\.html$/);
    const token = await page.evaluate(() => sessionStorage.getItem('token'));

    await api.caducarSesion(token!);
    // Cualquier accion posterior debe detectar el 401 y devolver al ingreso.
    await new PaginaPortal(page).abrirPestana('cuentas');
    await page.locator('[data-test="ver-movimientos"]').first().click();

    await expect(page).toHaveURL(/sesion=expirada/);
  });

  test('entrar al portal sin sesion redirige al ingreso', async ({ page }) => {
    await page.goto('/portal.html');

    await expect(page).toHaveURL(/\/$/);
  });
});
