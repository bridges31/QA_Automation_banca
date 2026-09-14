/**
 * Generacion de datos sinteticos.
 *
 * La Ley 1581 de 2012 (Habeas Data) prohibe usar datos personales reales de
 * clientes en ambientes de prueba. Todo dato que la suite envie al SUT se
 * genera aqui: no hay cedulas, correos ni nombres de personas reales.
 */

const NOMBRES = ['Camila', 'Andres', 'Valentina', 'Santiago', 'Mariana', 'Felipe', 'Daniela', 'Nicolas'];
const APELLIDOS = ['Barrios', 'Quintero', 'Osorio', 'Pineda', 'Cardenas', 'Arango', 'Beltran', 'Lozano'];

function elemento<T>(lista: readonly T[]): T {
  return lista[Math.floor(Math.random() * lista.length)]!;
}

function sufijoUnico(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export interface ClienteSintetico {
  nombre: string;
  documento: string;
  correo: string;
  usuario: string;
  clave: string;
  fechaNacimiento: string;
}

/**
 * Cliente valido para el flujo de apertura de cuenta.
 * El usuario lleva sufijo unico para que las ejecuciones en paralelo no
 * choquen contra la validacion de unicidad.
 */
export function clienteSintetico(sobrescribir: Partial<ClienteSintetico> = {}): ClienteSintetico {
  const sufijo = sufijoUnico().slice(-6).replace(/[^a-z0-9]/g, 'x');
  return {
    nombre: `${elemento(NOMBRES)} ${elemento(APELLIDOS)}`,
    documento: String(Math.floor(10_000_000 + Math.random() * 89_999_999)),
    correo: `qa.${sufijo}@correo-demo.test`,
    usuario: `qa${sufijo}`,
    clave: 'Sintetica2026*',
    fechaNacimiento: '1992-04-17',
    ...sobrescribir,
  };
}

/** Referencia de pago que cumple el patron de cada convenio del catalogo. */
export const REFERENCIAS_VALIDAS: Record<string, string> = {
  EAAB: '10293847561',
  ENEL: '4455667788',
  VANTI: '998877665',
  CLARO: '3105558899',
};
