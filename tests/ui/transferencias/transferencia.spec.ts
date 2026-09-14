/**
 * Transferencia de fondos desde el portal.
 *
 * Aqui se verifica lo que el CLIENTE ve: el comprobante y el saldo en pantalla.
 * La correccion del calculo ya esta cubierta en las pruebas de API; duplicarla
 * por interfaz solo agregaria lentitud y fragilidad.
 */

import { test, expect, aprovisionarBanca } from '../../../src/fixtures/prueba.ts';
import { debitoEsperado, gmfEsperado } from '../../../src/utils/dinero.ts';

test.describe('Transferencias', () => {
  test('el comprobante desglosa valor, GMF y total debitado @smoke', async ({ portal, banca }) => {
    const valor = 1_000_000;

    await portal.transferir({ origen: banca.cuentaAhorros, destino: banca.cuentaTercero, valor });

    await expect(portal.comprobante).toBeVisible();
    const comprobante = await portal.valoresComprobante();

    expect(comprobante.id).toMatch(/^TR-\d+$/);
    expect(comprobante.valor).toBe(valor);
    expect(comprobante.gmf).toBe(gmfEsperado(valor, false));
    expect(comprobante.total).toBe(debitoEsperado(valor, false));
    expect(comprobante.saldo).toBe(banca.saldoAhorros - debitoEsperado(valor, false));
  });

  test('el saldo del listado se actualiza tras la transferencia', async ({ portal, banca }) => {
    const valor = 500_000;

    await portal.transferir({ origen: banca.cuentaAhorros, destino: banca.cuentaTercero, valor });
    await expect(portal.comprobante).toBeVisible();
    await portal.abrirPestana('cuentas');

    // Un saldo desactualizado en pantalla es motivo de reclamo aunque el
    // movimiento este bien aplicado en el core.
    await expect
      .poll(() => portal.saldoEnPantalla(banca.cuentaAhorros))
      .toBe(banca.saldoAhorros - debitoEsperado(valor, false));
  });

  test('el traslado entre cuentas propias no cobra GMF', async ({ portal, banca }) => {
    await portal.transferir({
      origen: banca.cuentaAhorros,
      destino: banca.cuentaCorriente,
      valor: 400_000,
    });

    await expect(portal.comprobante).toBeVisible();
    const comprobante = await portal.valoresComprobante();
    expect(comprobante.gmf).toBe(0);
    expect(comprobante.total).toBe(400_000);
  });

  test('el saldo insuficiente se informa y no muestra comprobante', async ({ page, request }) => {
    const banca = await aprovisionarBanca(request, { saldoAhorros: 100_000 });
    await page.addInitScript((sesion) => {
      sessionStorage.setItem('token', sesion.token);
      sessionStorage.setItem('cliente', JSON.stringify(sesion.cliente));
    }, { token: banca.token, cliente: { id: banca.clienteId, nombre: banca.nombre } });

    const { PaginaPortal } = await import('../../../src/pages/pagina-portal.ts');
    const portal = new PaginaPortal(page);
    await portal.abrir();

    await portal.transferir({ origen: banca.cuentaAhorros, destino: banca.cuentaTercero, valor: 900_000 });

    await expect(portal.mensaje).toHaveClass(/error/);
    await expect(portal.mensaje).toContainText(/saldo insuficiente/i);
    expect(await portal.codigoMensaje()).toBe('SALDO_INSUFICIENTE');
    await expect(portal.comprobante).toBeHidden();
  });

  test('un valor no numerico se rechaza en el cliente sin llamar al servicio', async ({ portal, banca, page }) => {
    let huboPeticion = false;
    page.on('request', (peticion) => {
      if (peticion.url().includes('/api/transferencias')) huboPeticion = true;
    });

    await portal.transferir({ origen: banca.cuentaAhorros, destino: banca.cuentaTercero, valor: 'mil pesos' });

    await expect(portal.mensaje).toHaveClass(/error/);
    expect(huboPeticion).toBe(false);
  });

  test('el separador de miles digitado por el cliente no rompe la transaccion', async ({ portal, banca }) => {
    // Los clientes escriben "1.500.000"; la interfaz debe normalizarlo.
    await portal.transferir({ origen: banca.cuentaAhorros, destino: banca.cuentaTercero, valor: '1.500.000' });

    await expect(portal.comprobante).toBeVisible();
    expect((await portal.valoresComprobante()).valor).toBe(1_500_000);
  });

  test('transferir a una cuenta inexistente informa el error', async ({ portal, banca }) => {
    await portal.transferir({ origen: banca.cuentaAhorros, destino: '9999999999', valor: 50_000 });

    await expect(portal.mensaje).toHaveClass(/error/);
    expect(await portal.codigoMensaje()).toBe('CUENTA_NO_ENCONTRADA');
  });
});
