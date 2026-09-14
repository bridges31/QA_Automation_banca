# QA Automation Banca

Suite de automatizacion de pruebas para canales digitales bancarios, construida
con **Playwright + TypeScript**. Cubre tres capas:

- **UI** — los flujos que ve el cliente: ingreso, consulta de productos,
  transferencias, pago de servicios, apertura de cuenta.
- **API (no-UI)** — reglas de negocio, calculos monetarios, codigos de rechazo y
  control de acceso, sin pasar por el navegador.
- **Carga y estres** — comportamiento del servicio bajo concurrencia.

Mas pruebas de **accesibilidad** (WCAG 2.1 AA con axe) y de **humo del sitio
publico**.

## Arranque rapido

```bash
npm install
npx playwright install chromium
npm test
```

No hace falta configurar nada mas: el proyecto incluye un **banco demo** que se
levanta solo y sirve de sistema bajo prueba.

```bash
npm run test:api        # solo la capa de servicios
npm run test:ui         # solo interfaz
npm run test:a11y       # solo accesibilidad
npm run test:smoke      # solo lo etiquetado @smoke
npm run report          # abrir el reporte HTML
npm run load:carga      # prueba de carga
```

## Por que hay un banco demo en el repositorio

Apuntar la suite a un sitio bancario publico de terceros tiene tres problemas:
las pruebas dependen de la disponibilidad de un sistema ajeno, no se pueden
sembrar datos conocidos, y las pruebas de carga contra infraestructura de otro
son, en la practica, un ataque de denegacion de servicio.

El banco demo (`demo-bank/`) resuelve los tres: replica los flujos y las reglas
de negocio relevantes —GMF del 4x1000, limite diario, bloqueo por intentos
fallidos, idempotencia, control de acceso entre clientes— y es un destino de
carga legitimo.

## Apuntar a un ambiente real

El destino lo decide `BASE_URL`. Copie `.env.example` a `.env` y ajuste:

```bash
BASE_URL=https://pruebas.subanco.com.co
API_URL=https://pruebas.subanco.com.co/api
USUARIO_QA=usuario_de_pruebas
CLAVE_QA=clave_de_pruebas
```

Con un `BASE_URL` remoto la suite deja de administrar el SUT (no lo levanta ni lo
apaga). Dos puntos que si hay que adaptar:

1. **Aprovisionamiento de datos.** `aprovisionarBanca()` en
   `src/fixtures/prueba.ts` usa un endpoint del banco demo. Contra un ambiente
   real, reemplacelo por el mecanismo de carga de datos que ofrezca ese ambiente.
2. **Selectores.** Los Page Objects localizan por `data-test`. Si la aplicacion
   real no expone ese atributo, ese es el primer acuerdo a cerrar con el equipo
   de desarrollo (ver mas abajo).

## Estructura

```
demo-bank/            Sistema bajo prueba: API REST + interfaz web
  dominio.ts          Reglas de negocio (GMF, limites, validaciones)
  server.ts           Servidor HTTP
  public/             Interfaz web

src/
  api/                Cliente de la API, para pruebas de servicio y montaje de datos
  pages/              Page Objects
  data/               Generacion de datos sinteticos
  utils/              Configuracion de ambiente y calculos monetarios
  fixtures/           Fixtures de Playwright

tests/
  api/                Pruebas de la capa de servicios
  ui/                 Pruebas de interfaz, por flujo de negocio
  a11y/               Accesibilidad

load/                 Motor de carga, escenarios y umbrales
.github/workflows/    Integracion continua
```

## Decisiones de diseno

**Selectores por `data-test`, no por XPath ni por clases CSS.** Es lo que
distingue una suite que sobrevive de una que hay que reescribir en cada
despliegue. La leccion viene de automatizar plataformas low-code como Appian,
donde el HTML generado cambia entre versiones: alli el equivalente es la
propiedad `testLabel` de los componentes SAIL. Si va a automatizar sobre Appian,
negocie eso con desarrollo **antes** de escribir la primera prueba.

**El oraculo no comparte codigo con el sistema bajo prueba.** El GMF esperado se
calcula en `src/utils/dinero.ts`, derivado de la norma. Si las pruebas usaran la
funcion del SUT, un error de calculo se replicaria en el valor esperado y la
prueba pasaria estando mal.

**Cada prueba trabaja con su propio cliente.** Nada de datos semilla compartidos:
las pruebas corren en paralelo sin pisarse y ninguna depende del orden de
ejecucion. Los saldos, el acumulado diario y el bloqueo por intentos fallidos son
todos por cliente.

**Autenticacion por API cuando no es lo que se esta probando.** El fixture
`portal` inyecta la sesion en vez de navegar el formulario. Es mas rapido y evita
que una falla del login tumbe cincuenta pruebas que verifican otra cosa.

**Montos como enteros.** El COP no maneja centavos en la operacion cotidiana y
los enteros evitan los errores de punto flotante que terminan en descuadres.

## Cumplimiento normativo

- **Datos personales (Ley 1581 de 2012).** Ningun dato real de clientes en
  pruebas. Todo lo que la suite envia al SUT sale de `src/data/sinteticos.ts`.
- **Evidencia para auditoria.** Cada falla conserva traza, video y captura
  (`resultados/`), y cada corrida genera reporte HTML y JUnit XML
  (`reportes/`). Es el soporte que pide la Circular Externa 007 de 2018 de la
  Superintendencia Financiera para cambios sobre canales digitales.
- **Accesibilidad.** Las pruebas de `tests/a11y/` verifican WCAG 2.1 AA, exigido
  por la Resolucion 1519 de 2020.
- **Credenciales.** Nunca en el repositorio. `.env` esta ignorado; en CI van como
  secretos del repositorio.

## Integracion continua

`.github/workflows/ci.yml` corre la suite completa en cada push y PR, mas un humo
diario de lunes a viernes a las 6:00 (hora de Bogota). El reporte queda como
artefacto por 30 dias; la evidencia de fallas, tambien. Las pruebas de carga
corren solo en la rama principal o bajo demanda.

## Ejecutar desde VS Code

Instale la extension oficial **Playwright Test for VSCode** (`ms-playwright.playwright`).
Agrega un panel de pruebas en la barra lateral desde el que se puede:

- correr una sola prueba o un archivo, sin pasar por la terminal;
- poner un punto de interrupcion y depurar paso a paso;
- marcar *Show browser* para ver el navegador mientras corre;
- abrir la traza de una falla con un clic.

La extension levanta el banco demo por su cuenta, igual que `npm test`.

Requisitos: **Node 20 o superior** (`node -v`).

Las pruebas de carga si necesitan el banco arriba de antemano, en dos terminales:

```bash
npm run bank        # terminal 1: queda ocupada
npm run load:carga  # terminal 2
```

## Navegador

En una maquina normal no hay que configurar nada: `npx playwright install chromium`
descarga el navegador que corresponde a la version de Playwright del proyecto.

La variable `PLAYWRIGHT_CHROMIUM_PATH` es **opcional** y existe solo para maquinas
donde la politica corporativa impide esa descarga, o para contenedores que ya traen
un Chromium propio. Si la define apuntando a una version que no corresponde, las
pruebas pueden fallar por incompatibilidad de protocolo:

```bash
export PLAYWRIGHT_CHROMIUM_PATH=/ruta/al/chrome   # solo si hace falta
```

## Si algo falla

| Sintoma | Causa probable | Solucion |
|---|---|---|
| `Executable doesn't exist` | Falta el navegador | `npx playwright install chromium` |
| `EADDRINUSE :4010` | Otro proceso ocupa el puerto | `PUERTO_BANCO=4020 BASE_URL=http://127.0.0.1:4020 npm test` |
| `El ambiente no responde` al correr carga | El banco demo no esta arriba | `npm run bank` en otra terminal |
| Pruebas lentas o inestables | Pocos recursos para el paralelismo | `npx playwright test --workers=2` |

## Convencion de nombres

Directorios en ingles (`pages`, `tests`, `utils`), que es lo estandar en
herramientas de QA. Dominio, pruebas y comentarios en espanol, que es el idioma
del negocio y de quien lee los reportes.
