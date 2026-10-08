# BRCstudio.
Sitio estático accesible, sin backend, dependencias, claves ni servicios de pago. Se ha elegido HTML/CSS/JS nativo para reducir carga y mantenimiento.

## Publicación en Netlify
Importar este repositorio. `netlify.toml` configura `npm run build` y la carpeta `dist`. También puede subirse `dist` directamente a Netlify Drop.

## Edición
- `dist/index.html`: contenido y SEO.
- `dist/style.css`: diseño responsive.
- `dist/app.js`: carrusel y vídeo. Contacto: enlaces `tel:` y WhatsApp en `dist/index.html`.
- `dist/media`: archivos originales convertidos a WebP. El vídeo H.264 está remultiplexado a MP4, sin recomprimir.

La captura larga de PsyMorph se recibió con solo 121 px de ancho; se conserva sin inventar detalle.
