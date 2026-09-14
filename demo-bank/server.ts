/**
 * Banco Demo - servidor HTTP.
 *
 * Expone la API REST bajo /api y sirve la interfaz web desde public/.
 * Es el sistema bajo prueba de la suite: permite ejercitar los mismos flujos
 * de banca (autenticacion, consulta, transferencia, pago, onboarding) sin
 * depender de un ambiente externo.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CONVENIOS,
  ErrorNegocio,
  autenticar,
  caducarSesion,
  cerrarSesion,
  clienteDeToken,
  cuentaPropia,
  aprovisionar,
  cuentasDe,
  movimientosDe,
  pagarServicio,
  registrar,
  reiniciar,
  transferir,
} from './dominio.ts';

const PUERTO = Number(process.env.PUERTO_BANCO ?? 4010);
const PUBLICO = join(fileURLToPath(new URL('.', import.meta.url)), 'public');

/** Latencia artificial en ms, util para ejercitar esperas y pruebas de carga. */
const LATENCIA_MS = Number(process.env.LATENCIA_MS ?? 0);

const TIPOS_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
};

function responderJson(res: ServerResponse, estado: number, cuerpo: unknown): void {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(estado, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(texto),
    'cache-control': 'no-store',
  });
  res.end(texto);
}

async function leerJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const trozos: Buffer[] = [];
  for await (const trozo of req) trozos.push(trozo as Buffer);
  if (trozos.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(trozos).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new ErrorNegocio(400, 'JSON_INVALIDO', 'El cuerpo de la peticion no es JSON valido');
  }
}

function tokenDe(req: IncomingMessage): string | undefined {
  const cabecera = req.headers.authorization;
  if (!cabecera?.startsWith('Bearer ')) return undefined;
  return cabecera.slice('Bearer '.length).trim() || undefined;
}

async function servirEstatico(ruta: string, res: ServerResponse): Promise<void> {
  const archivo = ruta === '/' ? 'index.html' : normalize(ruta).replace(/^(\.\.[/\\])+/, '').replace(/^\//, '');
  try {
    const contenido = await readFile(join(PUBLICO, archivo));
    res.writeHead(200, { 'content-type': TIPOS_MIME[extname(archivo)] ?? 'application/octet-stream' });
    res.end(contenido);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }
}

async function enrutarApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const ruta = url.pathname;
  const metodo = req.method ?? 'GET';

  if (ruta === '/api/health' && metodo === 'GET') {
    return responderJson(res, 200, { estado: 'ok', hora: new Date().toISOString() });
  }

  // Ganchos de prueba: permiten aislar cada archivo de la suite.
  if (ruta === '/api/_prueba/reiniciar' && metodo === 'POST') {
    reiniciar();
    return responderJson(res, 200, { reiniciado: true });
  }
  if (ruta === '/api/_prueba/aprovisionar' && metodo === 'POST') {
    const cuerpo = await leerJson(req);
    const datos = aprovisionar({
      saldoAhorros: typeof cuerpo.saldoAhorros === 'number' ? cuerpo.saldoAhorros : undefined,
      saldoCorriente: typeof cuerpo.saldoCorriente === 'number' ? cuerpo.saldoCorriente : undefined,
    });
    return responderJson(res, 201, {
      usuario: datos.cliente.usuario,
      clave: datos.cliente.clave,
      clienteId: datos.cliente.id,
      nombre: datos.cliente.nombre,
      cuentaAhorros: datos.cuentaAhorros.id,
      cuentaCorriente: datos.cuentaCorriente.id,
      cuentaTercero: datos.cuentaTercero.id,
      saldoAhorros: datos.cuentaAhorros.saldo,
      saldoCorriente: datos.cuentaCorriente.saldo,
    });
  }

  if (ruta === '/api/_prueba/caducar-sesion' && metodo === 'POST') {
    const cuerpo = await leerJson(req);
    const ok = caducarSesion(String(cuerpo.token ?? ''));
    return responderJson(res, ok ? 200 : 404, { caducada: ok });
  }

  if (ruta === '/api/auth/login' && metodo === 'POST') {
    const cuerpo = await leerJson(req);
    const { token, cliente } = autenticar(String(cuerpo.usuario ?? ''), String(cuerpo.clave ?? ''));
    return responderJson(res, 200, {
      token,
      cliente: { id: cliente.id, nombre: cliente.nombre, usuario: cliente.usuario },
    });
  }

  if (ruta === '/api/auth/logout' && metodo === 'POST') {
    const token = tokenDe(req);
    if (token) cerrarSesion(token);
    return responderJson(res, 200, { cerrada: true });
  }

  if (ruta === '/api/clientes' && metodo === 'POST') {
    const cuerpo = await leerJson(req);
    const { cliente, cuenta } = registrar(cuerpo);
    return responderJson(res, 201, {
      cliente: { id: cliente.id, usuario: cliente.usuario, nombre: cliente.nombre },
      cuenta: { id: cuenta.id, tipo: cuenta.tipo, saldo: cuenta.saldo },
    });
  }

  if (ruta === '/api/convenios' && metodo === 'GET') {
    return responderJson(res, 200, { convenios: CONVENIOS });
  }

  // De aqui en adelante todo exige sesion valida.
  const cliente = clienteDeToken(tokenDe(req));

  if (ruta === '/api/cuentas' && metodo === 'GET') {
    return responderJson(res, 200, { cuentas: cuentasDe(cliente.id) });
  }

  const coincideCuenta = /^\/api\/cuentas\/(\w+)$/.exec(ruta);
  if (coincideCuenta && metodo === 'GET') {
    return responderJson(res, 200, { cuenta: cuentaPropia(cliente, coincideCuenta[1]!) });
  }

  const coincideMovimientos = /^\/api\/cuentas\/(\w+)\/movimientos$/.exec(ruta);
  if (coincideMovimientos && metodo === 'GET') {
    const cuenta = cuentaPropia(cliente, coincideMovimientos[1]!);
    return responderJson(res, 200, { movimientos: movimientosDe(cuenta.id) });
  }

  if (ruta === '/api/transferencias' && metodo === 'POST') {
    const cuerpo = await leerJson(req);
    const clave = req.headers['idempotency-key'];
    const resultado = transferir(
      cliente,
      {
        cuentaOrigen: String(cuerpo.cuentaOrigen ?? ''),
        cuentaDestino: String(cuerpo.cuentaDestino ?? ''),
        valor: cuerpo.valor,
      },
      typeof clave === 'string' ? clave : undefined,
    );
    return responderJson(res, 201, { transferencia: resultado });
  }

  if (ruta === '/api/pagos' && metodo === 'POST') {
    const cuerpo = await leerJson(req);
    const resultado = pagarServicio(cliente, {
      cuentaOrigen: String(cuerpo.cuentaOrigen ?? ''),
      convenio: String(cuerpo.convenio ?? ''),
      referencia: String(cuerpo.referencia ?? ''),
      valor: cuerpo.valor,
    });
    return responderJson(res, 201, { pago: resultado });
  }

  return responderJson(res, 404, { codigo: 'RECURSO_NO_ENCONTRADO', mensaje: 'Recurso no encontrado' });
}

const servidor = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    try {
      if (LATENCIA_MS > 0) await new Promise((r) => setTimeout(r, LATENCIA_MS));

      if (url.pathname.startsWith('/api/')) {
        await enrutarApi(req, res, url);
      } else {
        await servirEstatico(url.pathname, res);
      }
    } catch (error) {
      if (error instanceof ErrorNegocio) {
        const extra = (error as ErrorNegocio & { errores?: Record<string, string> }).errores;
        responderJson(res, error.estadoHttp, {
          codigo: error.codigo,
          mensaje: error.message,
          ...(extra ? { errores: extra } : {}),
        });
      } else {
        responderJson(res, 500, { codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor' });
      }
    }
  })();
});

servidor.listen(PUERTO, () => {
  console.log(`Banco Demo escuchando en http://127.0.0.1:${PUERTO}`);
});
