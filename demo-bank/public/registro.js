const formulario = document.querySelector('#formulario-registro');
const mensaje = document.querySelector('#mensaje');

function limpiarErrores() {
  mensaje.className = 'mensaje oculto';
  for (const span of document.querySelectorAll('[data-error]')) {
    span.classList.add('oculto');
    span.textContent = '';
  }
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limpiarErrores();

  const cuerpo = {
    nombre: document.querySelector('#nombre').value.trim(),
    documento: document.querySelector('#documento').value.trim(),
    fechaNacimiento: document.querySelector('#fechaNacimiento').value,
    correo: document.querySelector('#correo').value.trim(),
    usuario: document.querySelector('#usuarioNuevo').value.trim(),
    clave: document.querySelector('#claveNueva').value,
  };

  const respuesta = await fetch('/api/clientes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const datos = await respuesta.json();

  if (!respuesta.ok) {
    for (const [campo, texto] of Object.entries(datos.errores ?? {})) {
      const span = document.querySelector(`[data-error="${campo}"]`);
      if (span) {
        span.textContent = texto;
        span.classList.remove('oculto');
      }
    }
    mensaje.textContent = datos.mensaje ?? 'No fue posible completar el registro';
    mensaje.className = 'mensaje error';
    return;
  }

  mensaje.textContent = `Cuenta ${datos.cuenta.id} creada para el usuario ${datos.cliente.usuario}`;
  mensaje.className = 'mensaje exito';
  formulario.reset();
});
