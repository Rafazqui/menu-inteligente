# Sonidos

Archivos de audio que reproducen las pantallas del cliente.

| Sonido | Dónde suena | Cuándo |
|---|---|---|
| `llamar-mesero.ogg` + `llamar-mesero.mp3` | `/mesa/mesero` | Cuando el mesero marca la solicitud como "en camino" |

Cada sonido se entrega en **dos formatos** y el hook elige el primero que el
navegador soporte (`src/hooks/useSound.ts`):

1. **`.ogg` (Opus)** — el principal. Mejor compresión a bitrate bajo: un aviso
   de ~1 s en mono a 32 kbps pesa 3–5 KB. Chrome, Edge, Firefox y Android.
2. **`.mp3`** — el respaldo, para Safari/iOS viejo y cualquier navegador que no
   lea Opus.

Mientras los archivos no existan, el botón funciona igual y simplemente no suena.

## Cómo generarlos

Partiendo de un WAV (`fuente.wav`), con ffmpeg:

```bash
ffmpeg -i fuente.wav -ac 1 -c:a libopus -b:a 32k llamar-mesero.ogg
ffmpeg -i fuente.wav -ac 1 -b:a 64k llamar-mesero.mp3
```

`-ac 1` lo pasa a mono: para un aviso corto no se nota y pesa la mitad.
Que dure menos de 1 segundo; lo cargan celulares con datos móviles.
