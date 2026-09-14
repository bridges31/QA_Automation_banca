/**
 * Banco Demo - nucleo de dominio.
 *
 * Sistema bajo prueba (SUT) de la suite de automatizacion. Todo el estado vive
 * en memoria y se reinicia con reiniciar(), de modo que cada archivo de pruebas
 * pueda aislarse.
 *
 * Los montos se manejan como ENTEROS en pesos colombianos. El COP no usa
 * centavos en la operacion bancaria cotidiana y trabajar con enteros evita los
 * errores de punto flotante que en banca terminan en descuadres de centavos.
 */

export type TipoCuenta = 'ahorros' | 'corriente';

export interface Cliente {
  id: string;
  usuario: string;
  clave: string;
  nombre: string;
  documento: string;
  correo: string;
}

export interface Cuenta {
  id: string;
  clienteId: string;
  tipo: TipoCuenta;
  saldo: number;
}

export interface Movimiento {
  id: string;
  cuentaId: string;
  fecha: string;
  descripcion: string;
  /** Positivo = abono, negativo = cargo. */
  valor: number;
  saldoPosterior: number;
}

export interface Convenio {
  codigo: string;
  nombre: string;
  /** Expresion que debe cumplir la referencia de pago. */
  patronReferencia: string;
}

/** Limite diario de transferencias por cliente, en pesos. */
export const LIMITE_DIARIO = 10_000_000;

/** Gravamen a los Movimientos Financieros: 4 por mil. */
export const TASA_GMF = 0.004;

/** Intentos fallidos de autenticacion antes de bloquear el usuario. */
export const MAX_INTENTOS = 3;

/** Vigencia del token de sesion, en milisegundos. */
export const VIGENCIA_SESION_MS = 15 * 60 * 1000;

export const CONVENIOS: Convenio[] = [
  { codigo: 'EAAB', nombre: 'Acueducto de Bogota', patronReferencia: '^\\d{11}$' },
  { codigo: 'ENEL', nombre: 'Enel Colombia', patronReferencia: '^\\d{10}$' },
  { codigo: 'VANTI', nombre: 'Vanti Gas Natural', patronReferencia: '^\\d{9}$' },
  { codigo: 'CLARO', nombre: 'Claro Movil', patronReferencia: '^3\\d{9}$' },
];

interface Sesion {
  clienteId: string;
  expiraEn: number;
}

interface Estado {
  clientes: Cliente[];
  cuentas: Cuenta[];
  movimientos: Movimiento[];
  sesiones: Map<string, Sesion>;
  intentosFallidos: Map<string, number>;
  usuariosBloqueados: Set<string>;
  /** Acumulado transferido hoy por cliente, para el limite diario. */
  acumuladoDiario: Map<string, number>;
  /** Respuestas ya emitidas por Idempotency-Key. */
  idempotencia: Map<string, unknown>;
  secuencia: number;
}

let estado: Estado;

function semilla(): Estado {
  const clientes: Cliente[] = [
    {
      id: 'CL-001',
      usuario: 'cmartinez',
      clave: 'Prueba2026*',
      nombre: 'Carolina Martinez',
      documento: '52481937',
      correo: 'cmartinez@correo-demo.test',
    },
    {
      id: 'CL-002',
      usuario: 'jrodriguez',
      clave: 'Prueba2026*',
      nombre: 'Javier Rodriguez',
      documento: '79544120',
      correo: 'jrodriguez@correo-demo.test',
    },
  ];

  const cuentas: Cuenta[] = [
    { id: '4581230011', clienteId: 'CL-001', tipo: 'ahorros', saldo: 8_500_000 },
    { id: '4581230022', clienteId: 'CL-001', tipo: 'corriente', saldo: 15_200_000 },
    { id: '4581230033', clienteId: 'CL-002', tipo: 'ahorros', saldo: 3_000_000 },
  ];

  const movimientos: Movimiento[] = [
    {
      id: 'MV-0001',
      cuentaId: '4581230011',
      fecha: '2026-09-01T09:12:00.000Z',
      descripcion: 'Abono nomina',
      valor: 4_200_000,
      saldoPosterior: 8_500_000,
    },
    {
      id: 'MV-0002',
      cuentaId: '4581230022',
      fecha: '2026-09-03T14:45:00.000Z',
      descripcion: 'Pago proveedor',
      valor: -1_350_000,
      saldoPosterior: 15_200_000,
    },
  ];

  return {
    clientes,
    cuentas,
    movimientos,
    sesiones: new Map(),
    intentosFallidos: new Map(),
    usuariosBloqueados: new Set(),
    acumuladoDiario: new Map(),
    idempotencia: new Map(),
    secuencia: 100,
  };
}

export function reiniciar(): void {
  estado = semilla();
}

reiniciar();

function siguienteId(prefijo: string): string {
  estado.secuencia += 1;
  return `${prefijo}-${estado.secuencia}`;
}

/** Error de negocio con codigo estable y estado HTTP asociado. */
export class ErrorNegocio extends Error {
  readonly estadoHttp: number;
  readonly codigo: string;

  constructor(estadoHttp: number, codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorNegocio';
    this.estadoHttp = estadoHttp;
    this.codigo = codigo;
  }
}

/**
 * Gravamen a los Movimientos Financieros.
 *
 * Simplificacion deliberada de la norma colombiana: 4x1000 sobre el valor
 * transferido, redondeado al peso mas cercano, y exento cuando el traslado es
 * entre cuentas del mismo titular. La regla real contempla cuentas marcadas
 * como exentas y topes mensuales en UVT; para efectos de la suite interesa que
 * exista una regla de calculo verificable de forma independiente.
 */
export function calcularGmf(valor: number, mismoTitular: boolean): number {
  if (mismoTitular) return 0;
  return Math.round(valor * TASA_GMF);
}

// --- Autenticacion -------------------------------------------------------

export function autenticar(usuario: string, clave: string): { token: string; cliente: Cliente } {
  if (estado.usuariosBloqueados.has(usuario)) {
    throw new ErrorNegocio(423, 'USUARIO_BLOQUEADO', 'Usuario bloqueado por intentos fallidos');
  }

  const cliente = estado.clientes.find((c) => c.usuario === usuario && c.clave === clave);

  if (!cliente) {
    const fallidos = (estado.intentosFallidos.get(usuario) ?? 0) + 1;
    estado.intentosFallidos.set(usuario, fallidos);
    if (fallidos >= MAX_INTENTOS) {
      estado.usuariosBloqueados.add(usuario);
      throw new ErrorNegocio(423, 'USUARIO_BLOQUEADO', 'Usuario bloqueado por intentos fallidos');
    }
    throw new ErrorNegocio(401, 'CREDENCIALES_INVALIDAS', 'Usuario o clave incorrectos');
  }

  estado.intentosFallidos.delete(usuario);
  const token = `tk_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  estado.sesiones.set(token, { clienteId: cliente.id, expiraEn: Date.now() + VIGENCIA_SESION_MS });
  return { token, cliente };
}

export function cerrarSesion(token: string): void {
  estado.sesiones.delete(token);
}

export function clienteDeToken(token: string | undefined): Cliente {
  if (!token) {
    throw new ErrorNegocio(401, 'NO_AUTENTICADO', 'Falta el token de sesion');
  }
  const sesion = estado.sesiones.get(token);
  if (!sesion) {
    throw new ErrorNegocio(401, 'TOKEN_INVALIDO', 'Token de sesion invalido');
  }
  if (sesion.expiraEn <= Date.now()) {
    estado.sesiones.delete(token);
    throw new ErrorNegocio(401, 'SESION_EXPIRADA', 'La sesion expiro por inactividad');
  }
  const cliente = estado.clientes.find((c) => c.id === sesion.clienteId);
  if (!cliente) {
    throw new ErrorNegocio(401, 'TOKEN_INVALIDO', 'Token de sesion invalido');
  }
  return cliente;
}

/** Gancho de pruebas: fuerza el vencimiento de una sesion vigente. */
export function caducarSesion(token: string): boolean {
  const sesion = estado.sesiones.get(token);
  if (!sesion) return false;
  sesion.expiraEn = Date.now() - 1;
  return true;
}

// --- Cuentas -------------------------------------------------------------

export function cuentasDe(clienteId: string): Cuenta[] {
  return estado.cuentas.filter((c) => c.clienteId === clienteId);
}

export function cuentaPropia(cliente: Cliente, cuentaId: string): Cuenta {
  const cuenta = estado.cuentas.find((c) => c.id === cuentaId);
  if (!cuenta) {
    throw new ErrorNegocio(404, 'CUENTA_NO_ENCONTRADA', 'La cuenta no existe');
  }
  if (cuenta.clienteId !== cliente.id) {
    throw new ErrorNegocio(403, 'ACCESO_DENEGADO', 'La cuenta no pertenece al cliente autenticado');
  }
  return cuenta;
}

export function movimientosDe(cuentaId: string): Movimiento[] {
  return estado.movimientos
    .filter((m) => m.cuentaId === cuentaId)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function registrarMovimiento(cuenta: Cuenta, descripcion: string, valor: number): void {
  estado.movimientos.push({
    id: siguienteId('MV'),
    cuentaId: cuenta.id,
    fecha: new Date().toISOString(),
    descripcion,
    valor,
    saldoPosterior: cuenta.saldo,
  });
}

// --- Transferencias ------------------------------------------------------

export interface ResultadoTransferencia {
  id: string;
  cuentaOrigen: string;
  cuentaDestino: string;
  valor: number;
  gmf: number;
  totalDebitado: number;
  saldoOrigen: number;
  fecha: string;
}

export function transferir(
  cliente: Cliente,
  datos: { cuentaOrigen: string; cuentaDestino: string; valor: unknown },
  claveIdempotencia?: string,
): ResultadoTransferencia {
  if (claveIdempotencia) {
    const previa = estado.idempotencia.get(claveIdempotencia);
    if (previa) return previa as ResultadoTransferencia;
  }

  const valor = datos.valor;
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw new ErrorNegocio(400, 'VALOR_INVALIDO', 'El valor debe ser numerico');
  }
  if (!Number.isInteger(valor)) {
    throw new ErrorNegocio(400, 'VALOR_INVALIDO', 'El valor debe ser un entero en pesos');
  }
  if (valor <= 0) {
    throw new ErrorNegocio(400, 'VALOR_INVALIDO', 'El valor debe ser mayor que cero');
  }
  if (datos.cuentaOrigen === datos.cuentaDestino) {
    throw new ErrorNegocio(400, 'CUENTA_DESTINO_INVALIDA', 'La cuenta destino no puede ser la de origen');
  }

  const origen = cuentaPropia(cliente, datos.cuentaOrigen);
  const destino = estado.cuentas.find((c) => c.id === datos.cuentaDestino);
  if (!destino) {
    throw new ErrorNegocio(404, 'CUENTA_NO_ENCONTRADA', 'La cuenta destino no existe');
  }

  const gmf = calcularGmf(valor, destino.clienteId === origen.clienteId);
  const totalDebitado = valor + gmf;

  const acumulado = estado.acumuladoDiario.get(cliente.id) ?? 0;
  if (acumulado + valor > LIMITE_DIARIO) {
    throw new ErrorNegocio(422, 'LIMITE_DIARIO_EXCEDIDO', 'Supera el limite diario de transferencias');
  }
  if (totalDebitado > origen.saldo) {
    throw new ErrorNegocio(422, 'SALDO_INSUFICIENTE', 'Saldo insuficiente para cubrir el valor y el GMF');
  }

  origen.saldo -= totalDebitado;
  destino.saldo += valor;
  estado.acumuladoDiario.set(cliente.id, acumulado + valor);

  registrarMovimiento(origen, `Transferencia a ${destino.id}`, -valor);
  if (gmf > 0) registrarMovimiento(origen, 'GMF 4x1000', -gmf);
  registrarMovimiento(destino, `Transferencia de ${origen.id}`, valor);

  const resultado: ResultadoTransferencia = {
    id: siguienteId('TR'),
    cuentaOrigen: origen.id,
    cuentaDestino: destino.id,
    valor,
    gmf,
    totalDebitado,
    saldoOrigen: origen.saldo,
    fecha: new Date().toISOString(),
  };

  if (claveIdempotencia) estado.idempotencia.set(claveIdempotencia, resultado);
  return resultado;
}

// --- Pago de servicios ---------------------------------------------------

export interface ResultadoPago {
  id: string;
  convenio: string;
  referencia: string;
  valor: number;
  saldoOrigen: number;
  fecha: string;
}

export function pagarServicio(
  cliente: Cliente,
  datos: { cuentaOrigen: string; convenio: string; referencia: string; valor: unknown },
): ResultadoPago {
  const convenio = CONVENIOS.find((c) => c.codigo === datos.convenio);
  if (!convenio) {
    throw new ErrorNegocio(404, 'CONVENIO_NO_ENCONTRADO', 'El convenio no existe');
  }
  if (!new RegExp(convenio.patronReferencia).test(datos.referencia ?? '')) {
    throw new ErrorNegocio(400, 'REFERENCIA_INVALIDA', 'La referencia no cumple el formato del convenio');
  }

  const valor = datos.valor;
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor <= 0) {
    throw new ErrorNegocio(400, 'VALOR_INVALIDO', 'El valor debe ser un entero positivo en pesos');
  }

  const origen = cuentaPropia(cliente, datos.cuentaOrigen);
  if (valor > origen.saldo) {
    throw new ErrorNegocio(422, 'SALDO_INSUFICIENTE', 'Saldo insuficiente para el pago');
  }

  origen.saldo -= valor;
  registrarMovimiento(origen, `Pago ${convenio.nombre}`, -valor);

  return {
    id: siguienteId('PG'),
    convenio: convenio.codigo,
    referencia: datos.referencia,
    valor,
    saldoOrigen: origen.saldo,
    fecha: new Date().toISOString(),
  };
}

// --- Aprovisionamiento de datos de prueba --------------------------------

export interface Aprovisionamiento {
  cliente: Cliente;
  cuentaAhorros: Cuenta;
  cuentaCorriente: Cuenta;
  /** Cuenta de un titular distinto, para ejercitar el GMF y el control de acceso. */
  cuentaTercero: Cuenta;
}

/**
 * Crea un cliente aislado con saldos conocidos.
 *
 * Existe para que cada prueba disponga de sus propios datos y pueda correr en
 * paralelo sin interferir con las demas: los saldos, el acumulado diario y el
 * bloqueo por intentos fallidos son todos por cliente.
 */
export function aprovisionar(opciones: { saldoAhorros?: number; saldoCorriente?: number } = {}): Aprovisionamiento {
  const sufijo = String(estado.secuencia + 1).padStart(4, '0');

  const cliente: Cliente = {
    id: siguienteId('CL'),
    usuario: `qa${sufijo}${Math.random().toString(36).slice(2, 6)}`,
    clave: 'Aprovisionada2026*',
    nombre: `Titular Prueba ${sufijo}`,
    documento: String(20_000_000 + estado.secuencia),
    correo: `titular.${sufijo}@correo-demo.test`,
  };
  const tercero: Cliente = {
    id: siguienteId('CL'),
    usuario: `tr${sufijo}${Math.random().toString(36).slice(2, 6)}`,
    clave: 'Aprovisionada2026*',
    nombre: `Tercero Prueba ${sufijo}`,
    documento: String(30_000_000 + estado.secuencia),
    correo: `tercero.${sufijo}@correo-demo.test`,
  };

  const nuevaCuenta = (duenio: Cliente, tipo: TipoCuenta, saldo: number): Cuenta => {
    // Numero derivado de la secuencia, no del azar: dos cuentas aprovisionadas
    // en la misma llamada deben ser siempre distintas.
    estado.secuencia += 1;
    return { id: String(6_000_000_000 + estado.secuencia), clienteId: duenio.id, tipo, saldo };
  };

  const cuentaAhorros = nuevaCuenta(cliente, 'ahorros', opciones.saldoAhorros ?? 5_000_000);
  const cuentaCorriente = nuevaCuenta(cliente, 'corriente', opciones.saldoCorriente ?? 2_000_000);
  const cuentaTercero = nuevaCuenta(tercero, 'ahorros', 1_000_000);

  estado.clientes.push(cliente, tercero);
  estado.cuentas.push(cuentaAhorros, cuentaCorriente, cuentaTercero);

  return { cliente, cuentaAhorros, cuentaCorriente, cuentaTercero };
}

// --- Onboarding ----------------------------------------------------------

export interface DatosRegistro {
  nombre?: string;
  documento?: string;
  correo?: string;
  usuario?: string;
  clave?: string;
  fechaNacimiento?: string;
}

/** Devuelve el mapa campo -> mensaje. Vacio significa que el registro es valido. */
export function validarRegistro(datos: DatosRegistro): Record<string, string> {
  const errores: Record<string, string> = {};

  if (!datos.nombre || datos.nombre.trim().length < 3) {
    errores.nombre = 'El nombre debe tener al menos 3 caracteres';
  }
  if (!datos.documento || !/^\d{6,10}$/.test(datos.documento)) {
    errores.documento = 'El documento debe tener entre 6 y 10 digitos';
  }
  if (!datos.correo || !/^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(datos.correo)) {
    errores.correo = 'El correo no es valido';
  }
  if (!datos.usuario || !/^[a-z][a-z0-9]{4,15}$/.test(datos.usuario)) {
    errores.usuario = 'El usuario debe tener entre 5 y 16 caracteres alfanumericos en minuscula';
  } else if (estado.clientes.some((c) => c.usuario === datos.usuario)) {
    errores.usuario = 'El usuario ya se encuentra registrado';
  }
  if (
    !datos.clave ||
    datos.clave.length < 10 ||
    !/[A-Z]/.test(datos.clave) ||
    !/[a-z]/.test(datos.clave) ||
    !/\d/.test(datos.clave) ||
    !/[^A-Za-z0-9]/.test(datos.clave)
  ) {
    errores.clave = 'La clave requiere 10 caracteres con mayuscula, minuscula, numero y simbolo';
  }
  if (!datos.fechaNacimiento || Number.isNaN(Date.parse(datos.fechaNacimiento))) {
    errores.fechaNacimiento = 'La fecha de nacimiento no es valida';
  } else {
    const nacimiento = new Date(datos.fechaNacimiento);
    const mayoria = new Date(nacimiento.getFullYear() + 18, nacimiento.getMonth(), nacimiento.getDate());
    if (mayoria > new Date()) {
      errores.fechaNacimiento = 'El titular debe ser mayor de edad';
    }
  }

  return errores;
}

export function registrar(datos: DatosRegistro): { cliente: Cliente; cuenta: Cuenta } {
  const errores = validarRegistro(datos);
  if (Object.keys(errores).length > 0) {
    const error = new ErrorNegocio(400, 'REGISTRO_INVALIDO', 'Datos de registro invalidos');
    (error as ErrorNegocio & { errores: Record<string, string> }).errores = errores;
    throw error;
  }

  const cliente: Cliente = {
    id: siguienteId('CL'),
    usuario: datos.usuario!,
    clave: datos.clave!,
    nombre: datos.nombre!.trim(),
    documento: datos.documento!,
    correo: datos.correo!,
  };
  const cuenta: Cuenta = {
    id: String(4581230000 + estado.cuentas.length + 40),
    clienteId: cliente.id,
    tipo: 'ahorros',
    saldo: 0,
  };
  estado.clientes.push(cliente);
  estado.cuentas.push(cuenta);
  return { cliente, cuenta };
}
