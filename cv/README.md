# CV Lautaro Herrera 2026

Fuente del CV (versión "H") con el diseño original replicado en HTML.

- `cv_lautaro_herrera_2026.html` — fuente editable
- `foto.jpeg` — foto del encabezado
- `CV_Lautaro_Herrera_2026.pdf` — PDF final (1 página, A4)

## Regenerar el PDF

```bash
chromium --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf=CV_Lautaro_Herrera_2026.pdf cv_lautaro_herrera_2026.html
```

Tipografías usadas: EB Garamond (títulos) y Carlito, métricamente compatible con
Calibri (cuerpo).
