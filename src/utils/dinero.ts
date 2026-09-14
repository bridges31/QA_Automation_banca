/**
 * Calculos monetarios usados como ORACULO de las pruebas.
 *
 * Importante: esta es una implementacion independiente de la del sistema bajo
 * prueba. Si las pruebas reutilizaran la funcion del SUT, cualquier error de
 * calculo se replicaria en el valor esperado y la prueba pasaria estando mal.
 * El valor esperado se deriva aqui, a partir de la norma, no del codigo.
 */

/** Gravamen a los Movimientos Financieros: 4 pesos por cada 1.000. */
export const TASA_GMF = 4 / 1000;

/**
 * GMF esperado para una transferencia.
 * Exento entre cuentas del mismo titular; en los demas casos, 4x1000
 * redondeado al peso mas cercano (el COP no maneja centavos).
 */
export function gmfEsperado(valor: number, mismoTitular: boolean): number {
  if (mismoTitular) return 0;
  return Math.round(valor * TASA_GMF);
}

/** Total que debe salir de la cuenta origen: valor transferido mas GMF. */
export function debitoEsperado(valor: number, mismoTitular: boolean): number {
  return valor + gmfEsperado(valor, mismoTitular);
}

/** Formatea en pesos colombianos tal como lo hace la interfaz del portal. */
export function formatearPesos(valor: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(valor);
}

/**
 * Convierte el texto mostrado en pantalla a un entero en pesos.
 * Tolera separadores de miles, simbolo de moneda y espacios duros (NBSP y
 * NNBSP), que es lo que realmente inserta Intl.NumberFormat en es-CO.
 */
export function aNumero(texto: string): number {
  const limpio = texto.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(/,/g, '.');
  const numero = Number(limpio);
  if (Number.isNaN(numero)) {
    throw new Error(`No se pudo interpretar "${texto}" como un valor monetario`);
  }
  return Math.round(numero);
}
