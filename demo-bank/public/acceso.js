const formulario = document.querySelector('#formulario-acceso');
const mensaje = document.querySelector('#mensaje');

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mensaje.classList.add('oculto');

  const usuario = document.querySelector('#usuario').value.trim();
  const clave = document.querySelector('#clave').value;

  if (!usuario || !clave) {
    mensaje.textContent = 'Ingrese usuario y clave';
    mensaje.classList.remove('oculto');
    return;
  }

  const respuesta = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ usuario, clave }),
  });
  const cuerpo = await respuesta.json();

  if (!respuesta.ok) {
    mensaje.textContent = cuerpo.mensaje ?? 'No fue posible ingresar';
    mensaje.dataset.codigo = cuerpo.codigo ?? '';
    mensaje.classList.remove('oculto');
    return;
  }

  sessionStorage.setItem('token', cuerpo.token);
  sessionStorage.setItem('cliente', JSON.stringify(cuerpo.cliente));
  location.href = '/portal.html';
});
