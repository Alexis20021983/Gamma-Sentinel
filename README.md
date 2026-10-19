# GAMMA Sentinel

Aplicación Node.js con sitio web estático, API de chat y base de conocimiento.
El servidor entrega el frontend y la API desde un único servicio de Render.
GitHub almacena el código y ejecuta validaciones en cada cambio a `main` y en
cada pull request.

## Despliegue en Render

1. Sube los cambios a la rama `main` de
   [Alexis20021983/Gamma-Sentinel](https://github.com/Alexis20021983/Gamma-Sentinel).
2. En Render, selecciona **New +** → **Blueprint** y conecta ese repositorio.
3. Render leerá [`render.yaml`](render.yaml) y creará el servicio web.
4. Al finalizar el primer despliegue, abre la URL que Render asigne. El sitio y
   el chat estarán disponibles en esa misma URL.

El Blueprint instala dependencias con `npm ci`, inicia el servicio con
`npm start` y comprueba su estado en `/health`. Los despliegues posteriores se
activan automáticamente con cada push a la rama configurada en Render.

## Ejecución local

Requiere Node.js y npm:

```bash
npm ci
npm start
```

Abre `http://localhost:3000`. El servidor usa el puerto asignado por Render en
producción y carga los documentos de `GAMMA Sentinel/knowledge`.

## GitHub Actions

El workflow de GitHub Actions instala dependencias y comprueba la sintaxis de
JavaScript. Render es quien publica la aplicación; GitHub Pages no se usa para
este despliegue porque el frontend necesita la API de chat.

## Créditos

Creado por Alexis Afonso - Tecno Accion La Pampa.
