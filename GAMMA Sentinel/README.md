# GAMMA Sentinel

Sitio web estático para presentar **GAMMA Sentinel** como landing + demo informativa del sistema.

## Estructura del proyecto

- `index.html`
- `css/styles.css`
- `js/main.js`
- `assets/`
- `.github/workflows/deploy-pages.yml`

## Primer deploy en GitHub Pages

Este proyecto ya incluye un workflow para desplegar automáticamente en GitHub Pages.

### 1. Asegurate de que el código esté en la rama `main`

Ejecuta estos comandos desde la carpeta del proyecto:

```bash
git add .
git commit -m "Add GitHub Pages workflow"
git push origin main
```

### 2. Activar GitHub Pages desde GitHub

1. Abre el repositorio: https://github.com/Alexis20021983/Gamma-Sentinel
2. Ve a **Settings**
3. Click en **Pages**
4. En **Build and deployment**, selecciona **GitHub Actions**
5. Guarda la configuración

### 3. Esperar el deployment

1. Ve a **Actions**
2. Ejecuta o espera el workflow **Deploy GitHub Pages**
3. Cuando termine, GitHub te mostrará la URL pública del sitio

### 4. URL final esperada

Luego del primer deploy, la URL será algo similar a:

- `https://Alexis20021983.github.io/Gamma-Sentinel/`

## Workflow incluido

El archivo [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) hace lo siguiente:

- Se ejecuta al hacer `push` en `main`
- Puede dispararse manualmente desde **Actions**
- Sube el sitio como artefacto
- Lo despliega automáticamente con **GitHub Pages**

## Personalización

- Puedes editar el contenido en `index.html`
- Los estilos se gestionan desde `css/styles.css`
- La interacción suave del scroll y el año dinámico están en `js/main.js`

## Créditos

Creado por **Alexis Afonso - Tecno Accion La Pampa**.
