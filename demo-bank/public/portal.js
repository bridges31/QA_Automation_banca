const token = sessionStorage.getItem('token');
if (!token) {
  // replace en vez de href: no deja la pagina protegida en el historial.
  location.replace('/');
}

const cliente = JSON.parse(sessionStorage.getItem('cliente') ?? '{}');
const mensaje = document.querySelector('#mensaje');
const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

document.querySelector('#nombre-cliente').textContent = cliente.nombre ?? '';

async function api(ruta, opciones = {}) {
  const respuesta = await fetch(ruta, {
    ...opciones,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(opciones.headers ?? {}) },
  });
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (respuesta.status === 401) {
    sessionStorage.clear();
    location.href = '/?sesion=expirada';
    return null;
  }
  if (!respuesta.ok) {
    const error = new Error(cuerpo.mensaje ?? 'Error inesperado');
    error.codigo = cuerpo.codigo;
    throw error;
  }
  return cuerpo;
}

function mostrar(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = `mensaje ${tipo}`;
}

function limpiarMensaje() {
  mensaje.className = 'mensaje oculto';
  mensaje.textContent = '';
}

// --- Pestanas ---
for (const pestana of document.querySelectorAll('nav.pestanas button')) {
  pestana.addEventListener('click', () => {
    for (const otra of document.querySelectorAll('nav.pestanas button')) {
      otra.setAttribute('aria-selected', String(otra === pestana));
      document.querySelector(`#${otra.dataset.panel}`).classList.toggle('oculto', otra !== pestana);
    }
  });
}

document.querySelector('#boton-salir').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  sessionStorage.clear();
  location.href = '/';
});

// --- Cuentas ---
let cuentas = [];

async function cargarCuentas() {
  const datos = await api('/api/cuentas');
  if (!datos) return;
  cuentas = datos.cuentas;

  document.querySelector('#cuerpo-cuentas').innerHTML = cuentas
    .map(
      (c) => `<tr data-test="fila-cuenta" data-cuenta="${c.id}">
        <td data-test="numero-cuenta">${c.id}</td>
        <td data-test="tipo-cuenta">${c.tipo}</td>
        <td class="valor" data-test="saldo-cuenta">${pesos.format(c.saldo)}</td>
        <td><button class="secundario" data-movimientos="${c.id}" data-test="ver-movimientos">Ver movimientos</button></td>
      </tr>`,
    )
    .join('');

  const opciones = cuentas.map((c) => `<option value="${c.id}">${c.id} - ${c.tipo}</option>`).join('');
  document.querySelector('#cuenta-origen').innerHTML = opciones;
  document.querySelector('#cuenta-pago').innerHTML = opciones;

  for (const boton of document.querySelectorAll('[data-movimientos]')) {
    boton.addEventListener('click', () => cargarMovimientos(boton.dataset.movimientos));
  }
}

async function cargarMovimientos(cuentaId) {
  const datos = await api(`/api/cuentas/${cuentaId}/movimientos`);
  if (!datos) return;
  document.querySelector('#cuenta-movimientos').textContent = cuentaId;
  document.querySelector('#bloque-movimientos').classList.remove('oculto');
  document.querySelector('#cuerpo-movimientos').innerHTML = datos.movimientos
    .map(
      (m) => `<tr data-test="fila-movimiento">
        <td>${new Date(m.fecha).toLocaleDateString('es-CO')}</td>
        <td data-test="descripcion-movimiento">${m.descripcion}</td>
        <td class="valor" data-test="valor-movimiento">${pesos.format(m.valor)}</td>
      </tr>`,
    )
    .join('');
}

// --- Transferencia ---
document.querySelector('#formulario-transferencia').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limpiarMensaje();
  document.querySelector('#comprobante').classList.add('oculto');

  const valorCrudo = document.querySelector('#valor-transferencia').value.replace(/[.\s]/g, '');
  const cuerpo = {
    cuentaOrigen: document.querySelector('#cuenta-origen').value,
    cuentaDestino: document.querySelector('#cuenta-destino').value.trim(),
    valor: Number(valorCrudo),
  };

  if (!valorCrudo || Number.isNaN(cuerpo.valor)) {
    mostrar('El valor debe ser numerico', 'error');
    return;
  }

  try {
    const datos = await api('/api/transferencias', { method: 'POST', body: JSON.stringify(cuerpo) });
    if (!datos) return;
    const t = datos.transferencia;
    document.querySelector('[data-test="comprobante-id"]').textContent = t.id;
    document.querySelector('[data-test="comprobante-valor"]').textContent = pesos.format(t.valor);
    document.querySelector('[data-test="comprobante-gmf"]').textContent = pesos.format(t.gmf);
    document.querySelector('[data-test="comprobante-total"]').textContent = pesos.format(t.totalDebitado);
    document.querySelector('[data-test="comprobante-saldo"]').textContent = pesos.format(t.saldoOrigen);
    document.querySelector('#comprobante').classList.remove('oculto');
    mostrar('Transferencia aplicada con exito', 'exito');
    await cargarCuentas();
  } catch (error) {
    mensaje.dataset.codigo = error.codigo ?? '';
    mostrar(error.message, 'error');
  }
});

// --- Pagos ---
async function cargarConvenios() {
  const respuesta = await fetch('/api/convenios');
  const datos = await respuesta.json();
  document.querySelector('#convenio').innerHTML = datos.convenios
    .map((c) => `<option value="${c.codigo}">${c.nombre}</option>`)
    .join('');
}

document.querySelector('#formulario-pago').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limpiarMensaje();
  try {
    const datos = await api('/api/pagos', {
      method: 'POST',
      body: JSON.stringify({
        cuentaOrigen: document.querySelector('#cuenta-pago').value,
        convenio: document.querySelector('#convenio').value,
        referencia: document.querySelector('#referencia').value.trim(),
        valor: Number(document.querySelector('#valor-pago').value.replace(/[.\s]/g, '')),
      }),
    });
    if (!datos) return;
    mostrar(`Pago ${datos.pago.id} aplicado por ${pesos.format(datos.pago.valor)}`, 'exito');
    await cargarCuentas();
  } catch (error) {
    mensaje.dataset.codigo = error.codigo ?? '';
    mostrar(error.message, 'error');
  }
});

// Sin token ya se lanzo la redireccion: pedir datos aqui provocaria un 401 y
// una segunda redireccion compitiendo con la primera.
if (token) {
  await cargarCuentas();
  await cargarConvenios();
}
