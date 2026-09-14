/** Pago de servicios publicos desde el portal. */

import { test, expect } from '../../../src/fixtures/prueba.ts';
import { REFERENCIAS_VALIDAS } from '../../../src/data/sinteticos.ts';
import { debitoEsperado } from '../../../src/utils/dinero.ts';

test.describe('Pago de servicios', () => {
  test('un pago valido se confirma y descuenta el saldo @smoke', async ({ portal, banca }) => {
    const valor = 210_000;

    await portal.pagarServicio({
      cuenta: banca.cuentaAhorros,
      convenio: 'EAAB',
      referencia: REFERENCIAS_VALIDAS.EAAB!,
      valor,
    });

    await expect(portal.mensaje).toHaveClass(/exito/);
    await expect(portal.mensaje).toContainText(/PG-\d+/);

    await portal.abrirPestana('cuentas');
    await expect.poll(() => portal.saldoEnPantalla(banca.cuentaAhorros)).toBe(banca.saldoAhorros - valor);
  });

  test('una referencia con formato incorrecto se rechaza', async ({ portal, banca }) => {
    await portal.pagarServicio({
      cuenta: banca.cuentaAhorros,
      convenio: 'ENEL',
      referencia: '123',
      valor: 100_000,
    });

    await expect(portal.mensaje).toHaveClass(/error/);
    expect(await portal.codigoMensaje()).toBe('REFERENCIA_INVALIDA');
  });

  test('el pago no genera GMF, a diferencia de la transferencia', async ({ portal, banca }) => {
    const valor = 150_000;

    await portal.pagarServicio({
      cuenta: banca.cuentaAhorros,
      convenio: 'VANTI',
      referencia: REFERENCIAS_VALIDAS.VANTI!,
      valor,
    });
    await expect(portal.mensaje).toHaveClass(/exito/);

    await portal.abrirPestana('cuentas');
    const saldo = await portal.saldoEnPantalla(banca.cuentaAhorros);

    expect(saldo).toBe(banca.saldoAhorros - valor);
    expect(saldo).not.toBe(banca.saldoAhorros - debitoEsperado(valor, false));
  });

  test('el catalogo de convenios se carga en el formulario', async ({ portal }) => {
    await portal.abrirPestana('pagos');
    const opciones = portal.pagina.locator('[data-test="select-convenio"] option');

    await expect(opciones).toHaveCount(4);
    await expect(opciones.first()).toHaveText('Acueducto de Bogota');
  });
});
