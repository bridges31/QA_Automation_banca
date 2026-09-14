# Pruebas de carga

## Antes de ejecutar: autorizacion

Generar carga contra un sistema es indistinguible de un ataque de denegacion de
servicio. Antes de apuntar a cualquier ambiente que no sea el local:

1. Confirme por escrito con el responsable del sistema.
2. Acuerde una ventana de ejecucion.
3. Avise al proveedor de infraestructura si aplica (algunos exigen notificacion previa).
4. Nunca ejecute contra produccion sin esa ventana, ni contra un sitio de terceros.

El runner rechaza cualquier destino que no este declarado en `LOAD_ALLOWED_HOSTS`.
Por defecto solo admite `127.0.0.1` y `localhost`.

## Escenarios

| Escenario | Pregunta que responde | Perfil | Umbrales |
|---|---|---|---|
| `smoke` | ¿El ambiente y el guion responden? | 1 VU, 10 s | 0% error, p95 < 600 ms |
| `carga` | ¿Aguanta la concurrencia de un dia normal? | 5 → 20 → 5 VUs, 50 s | < 1% error, p95 < 1 s |
| `estres` | ¿Dónde empieza a degradarse? | 10 → 30 → 60 → 100 VUs, 60 s | < 5% error, p95 < 3 s |
| `pico` | ¿Sobrevive una avalancha y se recupera? | 5 → 80 → 5 VUs, 40 s | < 3% error, p95 < 2,5 s |

Un escenario que incumple su umbral termina con codigo de salida 1, de modo que
el pipeline lo marca en rojo.

## Ejecucion

```bash
npm run load:smoke      # verificacion rapida
npm run load:carga      # carga sostenida
npm run load:estres     # escalones crecientes
npm run load:pico       # avalancha y recuperacion
```

Cada corrida deja el detalle en `reportes/carga-<escenario>.json`.

## Recorrido que ejecuta cada usuario virtual

Ingreso → consulta de productos → consulta de movimientos → transferencia.
Tres lecturas por cada escritura, que es el perfil tipico del trafico en banca
en linea.

Cada usuario virtual recibe su **propio cliente y sus propias cuentas**. Si todos
compartieran una cuenta, la contencion sobre ese registro seria un artefacto del
montaje y no un hallazgo real, y el limite diario de transferencias cortaria la
corrida a los pocos segundos.

## ¿Cuando pasar a k6?

Este motor corre sobre el cliente HTTP de Playwright: comparte lenguaje y
dependencias con el resto de la suite y rinde bien hasta unos cientos de usuarios
virtuales desde una sola maquina.

Por encima de eso conviene [k6](https://grafana.com/docs/k6/latest/): corre sobre
Go, aprovecha varios nucleos y permite generacion distribuida. En `k6/escenarios.js`
estan los mismos escenarios ya traducidos:

```bash
k6 run -e BASE_URL=http://127.0.0.1:4010 load/k6/escenarios.js
k6 run -e ESCENARIO=estres load/k6/escenarios.js
```

## Como leer los resultados

- **p95** es la cifra que importa, no el promedio: dice que experiencia tiene el
  95% de los clientes. Un promedio bajo puede esconder que uno de cada veinte
  usuarios espera diez segundos.
- **Tasa de error creciente con la concurrencia** indica agotamiento de un recurso
  (conexiones a base de datos, hilos, memoria), no lentitud.
- **p95 que crece pero errores en cero** es saturacion: el sistema responde, pero
  encolando.
- En el escenario `pico` lo relevante no es el maximo alcanzado sino si las
  metricas **vuelven a su nivel base** en la ultima etapa. Si no vuelven, hay algo
  que no se libera.
