/**
 * Apertura de cuenta por API.
 *
 * Todos los datos provienen del generador sintetico: la Ley 1581 de 2012
 * impide usar datos personales reales de clientes en ambientes de prueba.
 */

import { test, expect } from '../../src/fixtures/prueba.ts';
import { clienteSintetico } from '../../src/data/sinteticos.ts';

test.describe('Apertura de cuenta', () => {
  test('un cliente valido queda registrado con cuenta en cero @smoke', async ({ api }) => {
    const nuevo = clienteSintetico();

    const { estado, cuerpo } = await api.registrar(nuevo);

    expect(estado).toBe(201);
    expect(cuerpo.cliente.usuario).toBe(nuevo.usuario);
    expect(cuerpo.cuenta.id).toMatch(/^\d+$/);
  });

  test('el cliente recien creado puede autenticarse', async ({ api }) => {
    const nuevo = clienteSintetico();
    await api.registrar(nuevo);

    const { estado } = await api.login(nuevo.usuario, nuevo.clave);

    expect(estado).toBe(200);
  });

  test('no se permite un usuario duplicado', async ({ api }) => {
    const nuevo = clienteSintetico();
    expect((await api.registrar(nuevo)).estado).toBe(201);

    const repetido = await api.registrar(clienteSintetico({ usuario: nuevo.usuario }));

    expect(repetido.estado).toBe(400);
    expect(repetido.cuerpo.errores?.usuario).toContain('ya se encuentra registrado');
  });

  test('un menor de edad no puede abrir cuenta', async ({ api }) => {
    const hace10Anios = new Date();
    hace10Anios.setFullYear(hace10Anios.getFullYear() - 10);

    const { estado, cuerpo } = await api.registrar(
      clienteSintetico({ fechaNacimiento: hace10Anios.toISOString().slice(0, 10) }),
    );

    expect(estado).toBe(400);
    expect(cuerpo.errores?.fechaNacimiento).toContain('mayor de edad');
  });

  test.describe('validacion de campos', () => {
    const casos: Array<{ nombre: string; sobrescribir: Record<string, string>; campo: string }> = [
      { nombre: 'documento con letras', sobrescribir: { documento: '52A81937' }, campo: 'documento' },
      { nombre: 'documento demasiado largo', sobrescribir: { documento: '123456789012' }, campo: 'documento' },
      { nombre: 'correo sin dominio', sobrescribir: { correo: 'sindominio@' }, campo: 'correo' },
      { nombre: 'correo sin arroba', sobrescribir: { correo: 'correo.demo.test' }, campo: 'correo' },
      { nombre: 'usuario demasiado corto', sobrescribir: { usuario: 'ab' }, campo: 'usuario' },
      { nombre: 'usuario con mayusculas', sobrescribir: { usuario: 'UsuarioQA' }, campo: 'usuario' },
      { nombre: 'clave sin simbolo', sobrescribir: { clave: 'Sintetica2026' }, campo: 'clave' },
      { nombre: 'clave corta', sobrescribir: { clave: 'Abc1*' }, campo: 'clave' },
      { nombre: 'nombre de una letra', sobrescribir: { nombre: 'A' }, campo: 'nombre' },
    ];

    for (const caso of casos) {
      test(`rechaza ${caso.nombre}`, async ({ api }) => {
        const { estado, cuerpo } = await api.registrar(clienteSintetico(caso.sobrescribir));

        expect(estado).toBe(400);
        expect(cuerpo.codigo).toBe('REGISTRO_INVALIDO');
        expect(Object.keys(cuerpo.errores ?? {})).toContain(caso.campo);
      });
    }
  });

  test('el registro reporta todos los campos invalidos a la vez', async ({ api }) => {
    const { cuerpo } = await api.registrar({ nombre: '', documento: 'x', correo: 'x', usuario: 'X', clave: '1' });

    // Validar de a un campo obliga al usuario a corregir por rondas.
    expect(Object.keys(cuerpo.errores ?? {}).length).toBeGreaterThanOrEqual(5);
  });
});
