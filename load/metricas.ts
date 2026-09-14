/** Acumulacion y resumen de metricas de una corrida de carga. */

export interface Muestra {
  etiqueta: string;
  /** Duracion de la peticion en milisegundos. */
  duracion: number;
  ok: boolean;
  estado: number;
  /** Instante de la muestra, en ms desde el inicio de la corrida. */
  instante: number;
}

export interface ResumenEtiqueta {
  etiqueta: string;
  peticiones: number;
  errores: number;
  tasaError: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
  promedio: number;
}

export interface Resumen {
  escenario: string;
  destino: string;
  inicio: string;
  duracionSegundos: number;
  peticiones: number;
  errores: number;
  tasaError: number;
  rps: number;
  vusMaximos: number;
  general: ResumenEtiqueta;
  porEtiqueta: ResumenEtiqueta[];
}

/**
 * Percentil por interpolacion lineal sobre la muestra ordenada.
 * Con pocas peticiones un percentil calculado por indice entero se sesga
 * demasiado; interpolar da una lectura mas honesta.
 */
export function percentil(valoresOrdenados: number[], p: number): number {
  if (valoresOrdenados.length === 0) return 0;
  if (valoresOrdenados.length === 1) return valoresOrdenados[0]!;

  const posicion = (valoresOrdenados.length - 1) * p;
  const inferior = Math.floor(posicion);
  const superior = Math.ceil(posicion);
  if (inferior === superior) return valoresOrdenados[inferior]!;

  const peso = posicion - inferior;
  return valoresOrdenados[inferior]! * (1 - peso) + valoresOrdenados[superior]! * peso;
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function resumirGrupo(etiqueta: string, muestras: Muestra[]): ResumenEtiqueta {
  const duraciones = muestras.map((m) => m.duracion).sort((a, b) => a - b);
  const errores = muestras.filter((m) => !m.ok).length;

  return {
    etiqueta,
    peticiones: muestras.length,
    errores,
    tasaError: muestras.length === 0 ? 0 : redondear((errores / muestras.length) * 100),
    p50: redondear(percentil(duraciones, 0.5)),
    p90: redondear(percentil(duraciones, 0.9)),
    p95: redondear(percentil(duraciones, 0.95)),
    p99: redondear(percentil(duraciones, 0.99)),
    max: redondear(duraciones.at(-1) ?? 0),
    promedio: redondear(duraciones.reduce((suma, valor) => suma + valor, 0) / (duraciones.length || 1)),
  };
}

export function resumir(
  muestras: Muestra[],
  contexto: { escenario: string; destino: string; inicio: Date; duracionSegundos: number; vusMaximos: number },
): Resumen {
  const etiquetas = [...new Set(muestras.map((m) => m.etiqueta))];
  const general = resumirGrupo('TOTAL', muestras);

  return {
    escenario: contexto.escenario,
    destino: contexto.destino,
    inicio: contexto.inicio.toISOString(),
    duracionSegundos: redondear(contexto.duracionSegundos),
    peticiones: general.peticiones,
    errores: general.errores,
    tasaError: general.tasaError,
    rps: redondear(general.peticiones / (contexto.duracionSegundos || 1)),
    vusMaximos: contexto.vusMaximos,
    general,
    porEtiqueta: etiquetas.map((etiqueta) =>
      resumirGrupo(
        etiqueta,
        muestras.filter((m) => m.etiqueta === etiqueta),
      ),
    ),
  };
}
