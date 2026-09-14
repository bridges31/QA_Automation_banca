/**
 * Control de destino para las pruebas de carga.
 *
 * Generar carga contra un sistema que no se administra, o sin autorizacion
 * escrita del responsable, es en la practica un ataque de denegacion de
 * servicio: no lo distingue ni el proveedor de infraestructura ni la ley. Por
 * eso el destino no se toma de BASE_URL a secas: tiene que estar declarado de
 * forma explicita en LOAD_ALLOWED_HOSTS.
 *
 * Por defecto solo se permite la maquina local, donde corre el banco demo.
 */

const PERMITIDOS_POR_DEFECTO = ['127.0.0.1', 'localhost'];

export function verificarDestinoAutorizado(baseUrl: string): void {
  let host: string;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    throw new Error(`BASE_URL no es una URL valida: "${baseUrl}"`);
  }

  const permitidos = (process.env.LOAD_ALLOWED_HOSTS ?? PERMITIDOS_POR_DEFECTO.join(','))
    .split(',')
    .map((valor) => valor.trim().toLowerCase())
    .filter(Boolean);

  if (!permitidos.includes(host.toLowerCase())) {
    throw new Error(
      [
        '',
        `  Destino no autorizado para pruebas de carga: ${host}`,
        '',
        '  Las pruebas de carga solo deben ejecutarse contra ambientes propios y con',
        '  autorizacion del responsable del sistema. Nunca contra produccion sin una',
        '  ventana acordada, y nunca contra un sitio de terceros.',
        '',
        `  Hosts autorizados actualmente: ${permitidos.join(', ')}`,
        '',
        '  Para habilitar otro destino, declarelo de forma explicita:',
        `      export LOAD_ALLOWED_HOSTS=${permitidos.join(',')},${host}`,
        '',
      ].join('\n'),
    );
  }
}
