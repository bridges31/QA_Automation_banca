import { test, expect } from '../../src/fixtures/prueba.ts';

test.describe('Disponibilidad del servicio @smoke', () => {
  test('el servicio responde y reporta estado ok', async ({ api }) => {
    const { estado, cuerpo } = await api.salud();

    expect(estado).toBe(200);
    expect(cuerpo.estado).toBe('ok');
    expect(Date.parse(cuerpo.hora)).not.toBeNaN();
  });

  test('el catalogo de convenios esta disponible sin autenticacion', async ({ api }) => {
    const { estado, cuerpo } = await api.convenios();

    expect(estado).toBe(200);
    expect(cuerpo.convenios.length).toBeGreaterThan(0);
    for (const convenio of cuerpo.convenios) {
      expect(convenio.codigo).toMatch(/^[A-Z]+$/);
      expect(() => new RegExp(convenio.patronReferencia)).not.toThrow();
    }
  });
});
