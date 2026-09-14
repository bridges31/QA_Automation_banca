/**
 * Lectura centralizada de la configuracion del ambiente bajo prueba.
 *
 * Toda la suite apunta a donde diga BASE_URL. Por defecto usa el banco demo
 * local; para ejecutar contra un ambiente de pruebas real basta exportar las
 * variables (ver .env.example) sin tocar el codigo de las pruebas.
 */

function leer(nombre: string, porDefecto: string): string {
  const valor = process.env[nombre];
  return valor && valor.trim() !== '' ? valor.trim() : porDefecto;
}

export const entorno = {
  baseUrl: leer('BASE_URL', 'http://127.0.0.1:4010'),
  apiUrl: leer('API_URL', `${leer('BASE_URL', 'http://127.0.0.1:4010')}/api`),
  usuario: leer('USUARIO_QA', 'cmartinez'),
  clave: leer('CLAVE_QA', 'Prueba2026*'),
  /** true cuando el SUT es el banco demo local incluido en el repositorio. */
  get esBancoDemo(): boolean {
    return /127\.0\.0\.1|localhost/.test(this.baseUrl);
  },
} as const;
