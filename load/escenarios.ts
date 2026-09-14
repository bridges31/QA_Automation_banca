/**
 * Escenarios de carga y sus umbrales de aceptacion.
 *
 * Cada escenario responde a una pregunta distinta:
 *  - humo:   la instrumentacion funciona y el ambiente responde.
 *  - carga:  con la concurrencia esperada en un dia normal, el servicio cumple.
 *  - estres: a que nivel de concurrencia empieza a degradarse.
 *  - pico:   como se comporta ante una avalancha subita (dia de pago, quincena)
 *            y, sobre todo, si se recupera despues.
 */

export interface Etapa {
  /** Usuarios virtuales concurrentes durante la etapa. */
  vus: number;
  segundos: number;
}

export interface Umbrales {
  /** Porcentaje maximo de peticiones fallidas. */
  tasaErrorMaxima: number;
  /** Latencia maxima admitida en el percentil 95, en milisegundos. */
  p95Maximo: number;
}

export interface Escenario {
  nombre: string;
  descripcion: string;
  etapas: Etapa[];
  umbrales: Umbrales;
  /** Pausa entre iteraciones de un usuario virtual, simulando tiempo de lectura. */
  pausaMs: number;
}

export const ESCENARIOS: Record<string, Escenario> = {
  smoke: {
    nombre: 'smoke',
    descripcion: 'Verificacion minima: un usuario, para confirmar que el ambiente y el guion responden',
    etapas: [{ vus: 1, segundos: 10 }],
    umbrales: { tasaErrorMaxima: 0, p95Maximo: 600 },
    pausaMs: 200,
  },
  carga: {
    nombre: 'carga',
    descripcion: 'Concurrencia esperada en operacion normal, sostenida',
    etapas: [
      { vus: 5, segundos: 10 },
      { vus: 20, segundos: 30 },
      { vus: 5, segundos: 10 },
    ],
    umbrales: { tasaErrorMaxima: 1, p95Maximo: 1_000 },
    pausaMs: 300,
  },
  estres: {
    nombre: 'estres',
    descripcion: 'Escalones crecientes hasta encontrar el punto de degradacion',
    etapas: [
      { vus: 10, segundos: 15 },
      { vus: 30, segundos: 15 },
      { vus: 60, segundos: 15 },
      { vus: 100, segundos: 15 },
    ],
    umbrales: { tasaErrorMaxima: 5, p95Maximo: 3_000 },
    pausaMs: 100,
  },
  pico: {
    nombre: 'pico',
    descripcion: 'Avalancha subita y regreso a la normalidad: interesa la recuperacion',
    etapas: [
      { vus: 5, segundos: 10 },
      { vus: 80, segundos: 15 },
      { vus: 5, segundos: 15 },
    ],
    umbrales: { tasaErrorMaxima: 3, p95Maximo: 2_500 },
    pausaMs: 100,
  },
};

export function duracionTotal(escenario: Escenario): number {
  return escenario.etapas.reduce((suma, etapa) => suma + etapa.segundos, 0);
}

export function vusMaximos(escenario: Escenario): number {
  return Math.max(...escenario.etapas.map((etapa) => etapa.vus));
}
