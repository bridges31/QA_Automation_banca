/**
 * Autenticacion por API.
 *
 * Los controles de acceso son el primer punto que revisa una auditoria sobre
 * canales digitales, asi que interesa tanto el camino feliz como cada rechazo.
 */

import { test, expect, aprovisionarBanca } from '../../src/fixtures/prueba.ts';
import { ClienteBanco } from '../../src/api/cliente-banco.ts';
import { entorno } from '../../src/utils/entorno.ts';

test.describe('Autenticacion', () => {
  test('credenciales validas devuelven token y datos del cliente @smoke', async ({ request }) => {
    const banca = await aprovisionarBanca(request);
    const api = new ClienteBanco(request, entorno.apiUrl);

    const { estado, cuerpo } = await api.login(banca.usuario, banca.clave);

    expect(estado).toBe(200);
    expect(cuerpo.token).toMatch(/^tk_/);
    expect(cuerpo.cliente.id).toBe(banca.clienteId);
  });

  test('la clave incorrecta es rechazada sin revelar si el usuario existe', async ({ request }) => {
    const banca = await aprovisionarBanca(request);
    const api = new ClienteBanco(request, entorno.apiUrl);

    // El usuario inexistente debe ser distinto en cada ejecucion: el contador de
    // intentos fallidos es por usuario y un nombre fijo terminaria bloqueado.
    const inexistente = `nadie${Math.random().toString(36).slice(2, 8)}`;

    const conClaveMala = await api.login(banca.usuario, 'ClaveEquivocada1*');
    const conUsuarioInexistente = await api.login(inexistente, 'ClaveEquivocada1*');

    expect(conClaveMala.estado).toBe(401);
    expect(conClaveMala.cuerpo.codigo).toBe('CREDENCIALES_INVALIDAS');
    // El mensaje debe ser identico en ambos casos: revelar que el usuario
    // existe permitiria enumerar clientes del banco.
    expect(conUsuarioInexistente.cuerpo.mensaje).toBe(conClaveMala.cuerpo.mensaje);
  });

  test('el usuario se bloquea al tercer intento fallido', async ({ request }) => {
    const banca = await aprovisionarBanca(request);
    const api = new ClienteBanco(request, entorno.apiUrl);

    const primero = await api.login(banca.usuario, 'Incorrecta1*');
    const segundo = await api.login(banca.usuario, 'Incorrecta2*');
    const tercero = await api.login(banca.usuario, 'Incorrecta3*');

    expect(primero.estado).toBe(401);
    expect(segundo.estado).toBe(401);
    expect(tercero.estado).toBe(423);
    expect(tercero.cuerpo.codigo).toBe('USUARIO_BLOQUEADO');

    // Y el bloqueo persiste aun con la clave correcta.
    const conClaveCorrecta = await api.login(banca.usuario, banca.clave);
    expect(conClaveCorrecta.estado).toBe(423);
  });

  test('un ingreso exitoso reinicia el contador de intentos fallidos', async ({ request }) => {
    const banca = await aprovisionarBanca(request);
    const api = new ClienteBanco(request, entorno.apiUrl);

    await api.login(banca.usuario, 'Incorrecta1*');
    await api.login(banca.usuario, 'Incorrecta2*');
    expect((await api.login(banca.usuario, banca.clave)).estado).toBe(200);

    // Tras el ingreso correcto el contador vuelve a cero: dos fallas mas no bloquean.
    expect((await api.login(banca.usuario, 'Incorrecta3*')).estado).toBe(401);
    expect((await api.login(banca.usuario, 'Incorrecta4*')).estado).toBe(401);
    expect((await api.login(banca.usuario, banca.clave)).estado).toBe(200);
  });

  test('sin token no se accede a recursos privados', async ({ api }) => {
    const { estado, cuerpo } = await api.cuentas();

    expect(estado).toBe(401);
    expect(cuerpo.codigo).toBe('NO_AUTENTICADO');
  });

  test('un token adulterado es rechazado', async ({ api }) => {
    api.usarToken('tk_falsificado_por_un_atacante');
    const { estado, cuerpo } = await api.cuentas();

    expect(estado).toBe(401);
    expect(cuerpo.codigo).toBe('TOKEN_INVALIDO');
  });

  test('el cierre de sesion invalida el token de inmediato', async ({ banca }) => {
    expect((await banca.api.cuentas()).estado).toBe(200);

    await banca.api.logout();

    banca.api.usarToken(banca.token);
    const despues = await banca.api.cuentas();
    expect(despues.estado).toBe(401);
    expect(despues.cuerpo.codigo).toBe('TOKEN_INVALIDO');
  });

  test('la sesion expirada obliga a autenticarse de nuevo', async ({ banca }) => {
    await banca.api.caducarSesion(banca.token);

    const { estado, cuerpo } = await banca.api.cuentas();

    expect(estado).toBe(401);
    expect(cuerpo.codigo).toBe('SESION_EXPIRADA');
  });
});
