# ⚽ Fútbol Total Manager

Un híbrido entre **FIFA Mobile** y **Football Manager** para navegador: juegas los partidos
en 3D con control arcade y, fuera del campo, diriges el club completo — plantilla, tácticas,
fichajes, finanzas, entrenamiento y liga de 8 equipos a doble vuelta (14 jornadas) con
temporadas encadenadas.

## Objetivo

Lleva a tu club a lo más alto de la liga. Eliges entre 8 clubes ficticios con distinta
categoría; cada jornada puedes **jugar el partido tú mismo** o simularlo. Gana títulos,
haz crecer a tu cantera y no arruines al club: si el presupuesto cae por debajo de
**-250 k€**, entras en quiebra y se acabó la carrera.

## Controles del partido

| Acción | Teclado | Táctil |
|---|---|---|
| Moverse | WASD / flechas | Joystick izquierdo |
| Sprint | Shift (mantener) | Botón SPRINT |
| Pasar | Espacio | PASAR |
| Globo / centro | L | GLOBO |
| Tirar (cargar) | K o Enter (mantener y soltar) | TIRAR (mantener) |
| Entrada | J | ENTRADA |
| Cambiar jugador | Q / Tab | (automático al recuperar) |
| Pausa | Esc | ⏸ |

## Sistemas principales

- **Partidos 3D (Three.js)**: 11 contra 11 con IA por anclas de formación, presión
  configurable, porteros con paradas, córners, saques de banda, celebración con confeti y
  cámara de retransmisión que sigue la jugada.
- **Gestión**: mejor once automático según formación (4-4-2, 4-3-3, 3-5-2, 5-3-2, 4-2-3-1),
  mentalidad, presión (afecta a la IA del partido y al desgaste), entrenamiento semanal,
  mercado renovado cada semana, ventas, salarios, taquilla, patrocinio y premios de liga.
- **Progresión**: los jóvenes crecen hacia su potencial según minutos y plan de
  entrenamiento; los veteranos declinan; hay lesiones, moral y forma física que rinden
  dentro del partido.
- **Liga completa**: clasificación, calendario, Pichichi, campeón de temporada y
  regeneración de plantillas entre temporadas.
- **Guardado local**: la carrera se guarda en `localStorage` de este navegador
  (no se sincroniza entre dispositivos; borrar los datos del navegador la elimina).

## Cómo ejecutar

```bash
npm install
npm run dev     # desarrollo
npm run build   # producción → dist/
```

## Técnicas clave

- Motor de partido propio con bucle de paso fijo (60 Hz), posesión de balón, física de
  bote/rozamiento y steering behaviors para 22 agentes sin allocations en el hot loop.
- Estadio procedural: césped con textura canvas (rayas y líneas reglamentarias),
  público instanciado (InstancedMesh), torres de iluminación y cielo nocturno con estrellas.
- Audio 100% sintetizado con Web Audio: murmullo de grada adaptativo, silbato, golpeos,
  palos y celebración de gol.
- Simulación de resultados Poisson basada en fuerza efectiva (media + moral + forma +
  táctica + factor campo), compartida entre la IA de liga y el botón "Simular".

## Repositorio en GitHub y APK

- El repo contiene el código fuente web completo (React + Three.js + Capacitor).
- Para generar el proyecto Android: `npx cap add android` y luego
  `python3 scripts/generate-android-icons.py` para crear los iconos del lanzador.
  Después `npx cap sync android` y compila con Gradle (`assembleRelease`) usando JDK 21 y el Android SDK.
- La firma de release **no** se incluye: crea tu propio keystore con `keytool` para publicar.
- El APK instalable se distribuye aparte (ver conversación/releases).
