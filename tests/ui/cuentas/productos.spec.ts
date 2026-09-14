/** Consulta de productos y movimientos desde el portal. */

import { test, expect } from '../../../src/fixtures/prueba.ts';
import { formatearPesos } from '../../../src/utils/dinero.ts';

test.describe('Productos', () => {
  test('el portal lista las cuentas del cliente con su saldo @smoke', async ({ portal, banca }) => {
    await expect(portal.filasCuenta).toHaveCount(2);
    await expect(portal.filaCuenta(banca.cuentaAhorros)).toBeVisible();
    await expect(portal.filaCuenta(banca.cuentaCorriente)).toBeVisible();

    expect(await portal.saldoEnPantalla(banca.cuentaAhorros)).toBe(banca.saldoAhorros);
    expect(await portal.saldoEnPantalla(banca.cuentaCorriente)).toBe(banca.saldoCorriente);
  });

  test('los saldos se muestran formateados en pesos colombianos', async ({ portal, banca }) => {
    const celda = portal.filaCuenta(banca.cuentaAhorros).locator('[data-test="saldo-cuenta"]');

    // El formato que ve el cliente importa: un saldo sin separadores de miles
    // se lee mal y genera reclamos.
    await expect(celda).toHaveText(formatearPesos(banca.saldoAhorros));
  });

  test('la cuenta de un tercero no aparece en el listado', async ({ portal, banca }) => {
    await expect(portal.filaCuenta(banca.cuentaTercero)).toHaveCount(0);
  });

  test('se pueden consultar los movimientos de una cuenta', async ({ portal, banca }) => {
    // Se genera un movimiento conocido para no depender de datos preexistentes.
    await portal.transferir({ origen: banca.cuentaAhorros, destino: banca.cuentaTercero, valor: 300_000 });
    await expect(portal.comprobante).toBeVisible();

    await portal.abrirPestana('cuentas');
    await portal.verMovimientos(banca.cuentaAhorros);

    await expect(portal.filasMovimiento.first()).toBeVisible();
    await expect(portal.pagina.locator('[data-test="cuenta-movimientos"]')).toHaveText(banca.cuentaAhorros);
    await expect(portal.filasMovimiento.filter({ hasText: 'GMF' })).toHaveCount(1);
  });
});
