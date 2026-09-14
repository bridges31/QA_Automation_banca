import { defineConfig, devices } from '@playwright/test';
import { entorno } from './src/utils/entorno.ts';

/**
 * Ruta a un Chromium ya presente en la maquina.
 *
 * Util cuando la politica corporativa impide que Playwright descargue sus
 * propios navegadores, o cuando el contenedor trae uno preinstalado. Si no se
 * define, Playwright usa el navegador que administra el mismo.
 */
const rutaChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH;

/**
 * Configuracion de la suite de automatizacion QA para banca.
 *
 * El destino de las pruebas lo decide BASE_URL. Por defecto se levanta el banco
 * demo incluido en el repositorio; para correr contra un ambiente de pruebas
 * real basta exportar BASE_URL y las credenciales (ver .env.example).
 *
 * Las trazas, videos y capturas se conservan en cada falla: en banca esa
 * evidencia es lo que se adjunta al soporte de la liberacion.
 */
export default defineConfig({
  testDir: './tests',
  outputDir: './resultados',

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,

  timeout: 45_000,
  expect: { timeout: 8_000 },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'reportes/html', open: 'never' }],
    ['junit', { outputFile: 'reportes/junit.xml' }],
  ],

  use: {
    baseURL: entorno.baseUrl,
    actionTimeout: 12_000,
    navigationTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    extraHTTPHeaders: { 'x-origen-prueba': 'qa-automation-banca' },
    ...(rutaChromium ? { launchOptions: { executablePath: rutaChromium } } : {}),
  },

  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      use: { baseURL: entorno.baseUrl },
    },
    {
      name: 'ui-chromium',
      testDir: './tests/ui',
      grepInvert: /@movil/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'ui-movil',
      testDir: './tests/ui',
      grep: /@movil/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'a11y',
      testDir: './tests/a11y',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Solo se levanta el banco demo; contra un ambiente real no se administra el SUT.
  webServer: entorno.esBancoDemo
    ? {
        command: 'npm run bank',
        url: `${entorno.baseUrl}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
        stdout: 'ignore',
        stderr: 'pipe',
      }
    : undefined,
});
