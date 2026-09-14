/** Pago de servicios publicos: validacion de convenio, referencia y saldo. */

import { test, expect, aprovisionarBanca } from '../../src/fixtures/prueba.ts';
import { REFERENCIAS_VALIDAS } from '../../src/data/sinteticos.ts';

test.describe('Pago de servicios', () => {
  test('un pago valido debita la cuenta @smoke', async ({ banca }) => {
    const valor = 180_000;

    const { estado, cuerpo } = await banca.api.pagar({
      cuentaOrigen: banca.cuentaAhorros,
      convenio: 'EAAB',
      referencia: REFERENCIAS_VALIDAS.EAAB!,
      valor,
    });

    expect(estado).toBe(201);
    expect(cuerpo.pago.valor).toBe(valor);
    expect(cuerpo.pago.saldoOrigen).toBe(banca.saldoAhorros - valor);
  });

  test('el pago de servicios no causa GMF', async ({ banca }) => {
    const valor = 200_000;

    const { cuerpo } = await banca.api.pagar({
      cuentaOrigen: banca.cuentaAhorros,
      convenio: 'ENEL',
      referencia: REFERENCIAS_VALIDAS.ENEL!,
      valor,
    });

    expect(banca.saldoAhorros - cuerpo.pago.saldoOrigen).toBe(valor);
  });

  test('cada convenio valida el formato de su propia referencia', async ({ banca }) => {
    // Referencia de 11 digitos valida para el acueducto, invalida para Enel.
    const { estado, cuerpo } = await banca.api.pagar({
      cuentaOrigen: banca.cuentaAhorros,
      convenio: 'ENEL',
      referencia: REFERENCIAS_VALIDAS.EAAB!,
      valor: 90_000,
    });

    expect(estado).toBe(400);
    expect(cuerpo.codigo).toBe('REFERENCIA_INVALIDA');
  });

  test('un convenio inexistente devuelve 404', async ({ banca }) => {
    const { estado, cuerpo } = await banca.api.pagar({
      cuentaOrigen: banca.cuentaAhorros,
      convenio: 'INEXISTENTE',
      referencia: '12345678901',
      valor: 50_000,
    });

    expect(estado).toBe(404);
    expect(cuerpo.codigo).toBe('CONVENIO_NO_ENCONTRADO');
  });

  test('no se paga por encima del saldo disponible', async ({ request }) => {
    const banca = await aprovisionarBanca(request, { saldoAhorros: 50_000 });

    const { estado, cuerpo } = await banca.api.pagar({
      cuentaOrigen: banca.cuentaAhorros,
      convenio: 'VANTI',
      referencia: REFERENCIAS_VALIDAS.VANTI!,
      valor: 90_000,
    });

    expect(estado).toBe(422);
    expect(cuerpo.codigo).toBe('SALDO_INSUFICIENTE');
    expect(await banca.api.saldoDe(banca.cuentaAhorros)).toBe(50_000);
  });

  test('no se paga desde una cuenta ajena', async ({ banca }) => {
    const { estado, cuerpo } = await banca.api.pagar({
      cuentaOrigen: banca.cuentaTercero,
      convenio: 'CLARO',
      referencia: REFERENCIAS_VALIDAS.CLARO!,
      valor: 60_000,
    });

    expect(estado).toBe(403);
    expect(cuerpo.codigo).toBe('ACCESO_DENEGADO');
  });
});
