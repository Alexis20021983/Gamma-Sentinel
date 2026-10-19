# GAMMA Sentinel

Aplicación con un frontend estático, una API Node.js de chat y una base de
conocimiento. Render publica el frontend como **Static Site** y ejecuta la API
como **Web Service**. GitHub almacena el código y ejecuta validaciones en cada
cambio a `main` y en cada pull request.

## Despliegue en Render

1. Sube los cambios a la rama `main` de
   [Alexis20021983/Gamma-Sentinel](https://github.com/Alexis20021983/Gamma-Sentinel).
2. En Render, selecciona **New +** → **Blueprint** y conecta ese repositorio.
   No lo conectes directamente como un único Static Site: eso no ejecutaría la API.
3. Render leerá [`render.yaml`](render.yaml) y creará los dos servicios. Para
   el frontend, el Blueprint requiere `type: web` junto con `runtime: static`;
   `type: static` no es un tipo de servicio válido.
4. El Blueprint enlaza el frontend con el host del backend para que el chat use
   la API. Al terminar, abre la URL del Static Site para acceder a la página.

El Blueprint instala las dependencias de la API con `npm ci`, la inicia con
`npm start` y comprueba su estado en `/health`. Los despliegues posteriores se
activan automáticamente con cada push a la rama configurada en Render.

## Ejecución local

Requiere Node.js y npm:

```bash
npm ci
npm start
```

Abre `http://localhost:3000`. El servidor sirve el sitio localmente y usa el
puerto asignado por Render en producción. La API carga los documentos de
`GAMMA Sentinel/knowledge`.

## GitHub Actions

El workflow de GitHub Actions instala dependencias y comprueba la sintaxis de
JavaScript. Render publica el frontend y el backend; GitHub Pages no se usa en
este despliegue.

## Créditos

Creado por Alexis Afonso - Tecno Accion La Pampa.
