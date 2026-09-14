/** Apertura de cuenta desde la interfaz publica. */

import { test, expect } from '../../../src/fixtures/prueba.ts';
import { clienteSintetico } from '../../../src/data/sinteticos.ts';

test.describe('Apertura de cuenta', () => {
  test('un cliente sintetico completa el registro @smoke', async ({ paginaRegistro, api }) => {
    const nuevo = clienteSintetico();

    await paginaRegistro.registrar(nuevo);

    await expect(paginaRegistro.mensaje).toHaveClass(/exito/);
    await expect(paginaRegistro.mensaje).toContainText(nuevo.usuario);

    // Y el cliente creado por la interfaz existe de verdad en el servicio.
    expect((await api.login(nuevo.usuario, nuevo.clave)).estado).toBe(200);
  });

  test('el formulario vacio muestra el error de cada campo obligatorio', async ({ paginaRegistro }) => {
    await paginaRegistro.enviar();

    await expect(paginaRegistro.errorDe('nombre')).toBeVisible();
    await expect(paginaRegistro.errorDe('documento')).toBeVisible();
    await expect(paginaRegistro.errorDe('correo')).toBeVisible();
    await expect(paginaRegistro.errorDe('usuario')).toBeVisible();
    await expect(paginaRegistro.errorDe('clave')).toBeVisible();
    await expect(paginaRegistro.errorDe('fecha-nacimiento')).toBeVisible();
  });

  test('el error se muestra junto al campo que lo causa', async ({ paginaRegistro }) => {
    await paginaRegistro.registrar(clienteSintetico({ documento: 'ABC123' }));

    await expect(paginaRegistro.errorDe('documento')).toContainText(/digitos/i);
    await expect(paginaRegistro.errorDe('correo')).toBeHidden();
    await expect(paginaRegistro.errorDe('usuario')).toBeHidden();
  });

  test('la clave debil se rechaza con el criterio explicito', async ({ paginaRegistro }) => {
    await paginaRegistro.registrar(clienteSintetico({ clave: 'abc123' }));

    await expect(paginaRegistro.errorDe('clave')).toContainText(/mayuscula/i);
  });

  test('un usuario ya tomado se informa al intentar registrarlo', async ({ paginaRegistro, api }) => {
    const existente = clienteSintetico();
    expect((await api.registrar(existente)).estado).toBe(201);

    await paginaRegistro.registrar(clienteSintetico({ usuario: existente.usuario }));

    await expect(paginaRegistro.errorDe('usuario')).toContainText(/ya se encuentra registrado/i);
  });

  test('los errores previos se limpian al reintentar', async ({ paginaRegistro }) => {
    await paginaRegistro.registrar(clienteSintetico({ documento: 'ABC' }));
    await expect(paginaRegistro.errorDe('documento')).toBeVisible();

    await paginaRegistro.registrar(clienteSintetico());

    await expect(paginaRegistro.errorDe('documento')).toBeHidden();
    await expect(paginaRegistro.mensaje).toHaveClass(/exito/);
  });
});
