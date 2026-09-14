/**
 * Transferencias: el flujo donde el dinero se mueve de verdad.
 *
 * Los valores esperados de GMF se calculan con el modulo de utilidades de la
 * suite, NO con el del sistema bajo prueba: si ambos compartieran la misma
 * funcion, un error de calculo pasaria inadvertido.
 */

import { test, expect, aprovisionarBanca } from '../../src/fixtures/prueba.ts';
import { debitoEsperado, gmfEsperado } from '../../src/utils/dinero.ts';

test.describe('Transferencias', () => {
  test('transferir a un tercero debita el valor mas el GMF del 4x1000 @smoke', async ({ banca }) => {
    const valor = 1_000_000;

    const { estado, cuerpo } = await banca.api.transferir({
      cuentaOrigen: banca.cuentaAhorros,
      cuentaDestino: banca.cuentaTercero,
      valor,
    });

    expect(estado).toBe(201);
    expect(cuerpo.transferencia.gmf).toBe(gmfEsperado(valor, false));
    expect(cuerpo.transferencia.gmf).toBe(4_000);
    expect(cuerpo.transferencia.totalDebitado).toBe(debitoEsperado(valor, false));
    expect(cuerpo.transferencia.saldoOrigen).toBe(banca.saldoAhorros - debitoEsperado(valor, false));
  });

  test('el traslado entre cuentas del mismo titular esta exento de GMF', async ({ banca }) => {
    const valor = 1_000_000;

    const { estado, cuerpo } = await banca.api.transferir({
      cuentaOrigen: banca.cuentaAhorros,
      cuentaDestino: banca.cuentaCorriente,
      valor,
    });

    expect(estado).toBe(201);
    expect(cuerpo.transferencia.gmf).toBe(0);
    expect(cuerpo.transferencia.totalDebitado).toBe(valor);
  });

  test('el GMF se redondea al peso: el COP no maneja centavos', async ({ banca }) => {
    // 4x1000 sobre 123.457 son 493,828 pesos exactos: debe quedar en 494.
    const valor = 123_457;

    const { cuerpo } = await banca.api.transferir({
      cuentaOrigen: banca.cuentaAhorros,
      cuentaDestino: banca.cuentaTercero,
      valor,
    });

    expect(cuerpo.transferencia.gmf).toBe(494);
    expect(Number.isInteger(cuerpo.transferencia.gmf)).toBe(true);
    expect(Number.isInteger(cuerpo.transferencia.saldoOrigen)).toBe(true);
  });

  test('la partida doble cuadra: lo que sale del origen entra al destino', async ({ request, banca }) => {
    // Se usan dos clientes reales para poder consultar ambos saldos.
    const destinatario = await aprovisionarBanca(request);
    const valor = 750_000;

    const saldoOrigenAntes = await banca.api.saldoDe(banca.cuentaAhorros);
    const saldoDestinoAntes = await destinatario.api.saldoDe(destinatario.cuentaAhorros);

    const { estado } = await banca.api.transferir({
      cuentaOrigen: banca.cuentaAhorros,
      cuentaDestino: destinatario.cuentaAhorros,
      valor,
    });
    expect(estado).toBe(201);

    const saldoOrigenDespues = await banca.api.saldoDe(banca.cuentaAhorros);
    const saldoDestinoDespues = await destinatario.api.saldoDe(destinatario.cuentaAhorros);

    expect(saldoOrigenAntes - saldoOrigenDespues).toBe(debitoEsperado(valor, false));
    expect(saldoDestinoDespues - saldoDestinoAntes).toBe(valor);
  });

  test('el rechazo por saldo insuficiente no altera ningun saldo', async ({ request }) => {
    const banca = await aprovisionarBanca(request, { saldoAhorros: 100_000 });
    const saldoAntes = await banca.api.saldoDe(banca.cuentaAhorros);

    const { estado, cuerpo } = await banca.api.transferir({
      cuentaOrigen: banca.cuentaAhorros,
      cuentaDestino: banca.cuentaTercero,
      valor: 500_000,
    });

    expect(estado).toBe(422);
    expect(cuerpo.codigo).toBe('SALDO_INSUFICIENTE');
    expect(await banca.api.saldoDe(banca.cuentaAhorros)).toBe(saldoAntes);
  });

  test('el GMF se cuenta dentro del saldo disponible', async ({ request }) => {
    // Saldo exacto para el valor pero no para el GMF: debe rechazarse.
    const banca = await aprovisionarBanca(request, { saldoAhorros: 1_000_000 });

    const { estado, cuerpo } = await banca.api.transferir({
      cuentaOrigen: banca.cuentaAhorros,
      cuentaDestino: banca.cuentaTercero,
      valor: 1_000_000,
    });

    expect(estado).toBe(422);
    expect(cuerpo.codigo).toBe('SALDO_INSUFICIENTE');
  });

  test('se respeta el limite diario acumulado por cliente', async ({ request }) => {
    const banca = await aprovisionarBanca(request, { saldoAhorros: 30_000_000 });

    const primera = await banca.api.transferir({
      cuentaOrigen: banca.cuentaAhorros,
      cuentaDestino: banca.cuentaTercero,
      valor: 6_000_000,
    });
    const segunda = await banca.api.transferir({
      cuentaOrigen: banca.cuentaAhorros,
      cuentaDestino: banca.cuentaTercero,
      valor: 6_000_000,
    });

    expect(primera.estado).toBe(201);
    expect(segunda.estado).toBe(422);
    expect(segunda.cuerpo.codigo).toBe('LIMITE_DIARIO_EXCEDIDO');
  });

  test('la clave de idempotencia evita el doble debito ante un reintento', async ({ banca }) => {
    const clave = `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const valor = 200_000;
    const saldoAntes = await banca.api.saldoDe(banca.cuentaAhorros);

    const primera = await banca.api.transferir(
      { cuentaOrigen: banca.cuentaAhorros, cuentaDestino: banca.cuentaTercero, valor },
      { claveIdempotencia: clave },
    );
    const reintento = await banca.api.transferir(
      { cuentaOrigen: banca.cuentaAhorros, cuentaDestino: banca.cuentaTercero, valor },
      { claveIdempotencia: clave },
    );

    expect(reintento.cuerpo.transferencia.id).toBe(primera.cuerpo.transferencia.id);
    expect(await banca.api.saldoDe(banca.cuentaAhorros)).toBe(saldoAntes - debitoEsperado(valor, false));
  });

  test.describe('validacion del valor', () => {
    const casos: Array<{ nombre: string; valor: unknown; codigo: string }> = [
      { nombre: 'cero', valor: 0, codigo: 'VALOR_INVALIDO' },
      { nombre: 'negativo', valor: -50_000, codigo: 'VALOR_INVALIDO' },
      { nombre: 'con decimales', valor: 1_500.75, codigo: 'VALOR_INVALIDO' },
      { nombre: 'texto', valor: '100000', codigo: 'VALOR_INVALIDO' },
      { nombre: 'nulo', valor: null, codigo: 'VALOR_INVALIDO' },
    ];

    for (const caso of casos) {
      test(`un valor ${caso.nombre} es rechazado`, async ({ banca }) => {
        const { estado, cuerpo } = await banca.api.transferir({
          cuentaOrigen: banca.cuentaAhorros,
          cuentaDestino: banca.cuentaTercero,
          valor: caso.valor,
        });

        expect(estado).toBe(400);
        expect(cuerpo.codigo).toBe(caso.codigo);
      });
    }
  });

  test('no se puede transferir de una cuenta a si misma', async ({ banca }) => {
    const { estado, cuerpo } = await banca.api.transferir({
      cuentaOrigen: banca.cuentaAhorros,
      cuentaDestino: banca.cuentaAhorros,
      valor: 10_000,
    });

    expect(estado).toBe(400);
    expect(cuerpo.codigo).toBe('CUENTA_DESTINO_INVALIDA');
  });

  test('no se puede transferir desde una cuenta que no es del cliente', async ({ banca }) => {
    const { estado, cuerpo } = await banca.api.transferir({
      cuentaOrigen: banca.cuentaTercero,
      cuentaDestino: banca.cuentaAhorros,
      valor: 10_000,
    });

    expect(estado).toBe(403);
    expect(cuerpo.codigo).toBe('ACCESO_DENEGADO');
  });

  test('una cuenta destino inexistente devuelve 404', async ({ banca }) => {
    const { estado, cuerpo } = await banca.api.transferir({
      cuentaOrigen: banca.cuentaAhorros,
      cuentaDestino: '9999999999',
      valor: 10_000,
    });

    expect(estado).toBe(404);
    expect(cuerpo.codigo).toBe('CUENTA_NO_ENCONTRADA');
  });
});
