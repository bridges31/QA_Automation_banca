/**
 * Consulta de productos y control de acceso horizontal.
 *
 * El caso del acceso a la cuenta ajena (IDOR) merece prueba propia: es una de
 * las fallas mas frecuentes y mas graves en banca en linea, porque la interfaz
 * nunca muestra ese enlace pero la API si responde si no valida la propiedad.
 */

import { test, expect, aprovisionarBanca } from '../../src/fixtures/prueba.ts';

test.describe('Cuentas', () => {
  test('el cliente solo ve sus propios productos @smoke', async ({ banca }) => {
    const { estado, cuerpo } = await banca.api.cuentas();

    expect(estado).toBe(200);
    const numeros = cuerpo.cuentas.map((c) => c.id);
    expect(numeros).toContain(banca.cuentaAhorros);
    expect(numeros).toContain(banca.cuentaCorriente);
    expect(numeros).not.toContain(banca.cuentaTercero);
    for (const cuenta of cuerpo.cuentas) {
      expect(cuenta.clienteId).toBe(banca.clienteId);
    }
  });

  test('el saldo consultado coincide con el aprovisionado', async ({ banca }) => {
    const { estado, cuerpo } = await banca.api.cuenta(banca.cuentaAhorros);

    expect(estado).toBe(200);
    expect(cuerpo.cuenta.saldo).toBe(banca.saldoAhorros);
    expect(Number.isInteger(cuerpo.cuenta.saldo)).toBe(true);
  });

  test('consultar la cuenta de otro cliente devuelve 403 y no filtra el saldo', async ({ banca }) => {
    const { estado, cuerpo } = await banca.api.cuenta(banca.cuentaTercero);

    expect(estado).toBe(403);
    expect(cuerpo.codigo).toBe('ACCESO_DENEGADO');
    expect(JSON.stringify(cuerpo)).not.toContain('saldo');
  });

  test('una cuenta inexistente devuelve 404, no 403', async ({ banca }) => {
    const { estado, cuerpo } = await banca.api.cuenta('9999999999');

    expect(estado).toBe(404);
    expect(cuerpo.codigo).toBe('CUENTA_NO_ENCONTRADA');
  });

  test('los movimientos de una cuenta ajena tambien estan protegidos', async ({ banca }) => {
    const { estado, cuerpo } = await banca.api.movimientos(banca.cuentaTercero);

    expect(estado).toBe(403);
    expect(cuerpo.codigo).toBe('ACCESO_DENEGADO');
  });

  test('dos clientes distintos no comparten informacion', async ({ request, banca }) => {
    const otro = await aprovisionarBanca(request);

    const propias = await banca.api.cuentas();
    const ajenas = await otro.api.cuentas();

    const idsPropias = propias.cuerpo.cuentas.map((c) => c.id);
    const idsAjenas = ajenas.cuerpo.cuentas.map((c) => c.id);
    expect(idsPropias.some((id) => idsAjenas.includes(id))).toBe(false);
  });
});
