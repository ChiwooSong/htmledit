# Guía de HTMLEdit

[English](../../README.md) · [한국어](README.ko.md) · [Español](README.es.md) · [日本語](README.ja.md) · [Português (Brasil)](README.pt-BR.md)

Edita visualmente HTML creado por IA, deja notas en elementos concretos y pide a Claude Code o Codex que las aplique. HTMLEdit funciona localmente, sin cuenta ni clave de API de IA. La versión 1.4.0 añade la inserción de imágenes. Windows con Chrome/Edge sigue siendo el entorno principal. Linux/macOS son experimentales: las pruebas automáticas con Chrome pasaron en Ubuntu 24.04 WSL2 y macOS 15.6.1 Apple Silicon; el candidato 1.5.1 también pasó la edición en Safari 18.6 real y la aplicación de notas conjuntas con Claude. Las comprobaciones manuales de entrada coreana y las pruebas anteriores de selectores nativos se distinguen en el [registro por entorno](../SAFARI_150_INTEGRATION.md).

## Una solicitud para varios elementos

Una **nota conjunta** vincula una sola solicitud a varios elementos. Por ejemplo: «Intercambia la posición de estos dos títulos y conserva su texto».

1. Selecciona el primer título y añade el segundo con **Ctrl+clic** (**Cmd+clic** en Mac).
2. Pulsa **Añadir una nota a los elementos seleccionados**, escribe la solicitud y añade la nota. Ambos títulos muestran el mismo número.
3. Pulsa **Guardar y copiar solicitud para IA** y pega el texto en Claude Code o Codex. El botón guarda primero el archivo; tú envías la solicitud en la conversación con la IA.
4. La IA aplica la solicitud mediante el skill. En modo conectado, el editor se actualiza automáticamente si no hay cambios sin guardar. No necesitas buscar y abrir otro archivo de resultado.

### Verificado con la versión publicada 1.5.1

El orden **First → Second** cambió a **Second → First**. Los dos marcadores verdes **1** corresponden a la misma nota conjunta completada; los textos y el párrafo restante se conservaron.

![HTMLEdit 1.5.1 después de que Codex intercambiara los títulos; ambos marcadores verdes indican la nota conjunta 1](https://raw.githubusercontent.com/ChiwooSong/htmledit/90426598ece364c2dc9f88ca8204646acd341d5f/docs/verification/1.5.1/codex-after.png)

**Codex en Windows Chrome** y **Claude Code autenticado en Ubuntu WSLg Chrome** interpretaron y aplicaron la solicitud en ejecuciones independientes. Ambas pasaron la actualización automática, la conservación de destinos y del original, la comprobación exacta del respaldo y la exportación final. Las acciones del navegador fueron automatizadas; la intervención de ambas IA fue real. Consulta el [resultado de Claude](https://raw.githubusercontent.com/ChiwooSong/htmledit/90426598ece364c2dc9f88ca8204646acd341d5f/docs/verification/1.5.1/claude-after.png) y el [registro 1.5.1 con HTML anterior/posterior y alcance de las pruebas](../PUBLISHED_1.5.1_VERIFICATION.md).

## Instalar y abrir

Necesitas Node.js **22.12+** y Claude Code o Codex ejecutándose en tu equipo. Ejecuta estos comandos fuera del repositorio del código fuente de HTMLEdit:

```sh
npx --yes @woody_s/htmledit@latest install --agent all
npx --yes @woody_s/htmledit@latest open "./document.html"
```

Usa `--agent claude` o `--agent codex` para instalar un solo skill. En Claude Code, invoca `/htmledit`; en Codex, `$htmledit`. También puedes pedir que abra tu HTML con HTMLEdit. Si el skill no aparece, inicia una nueva sesión de IA. Se crea `document.review.html` junto al original, que se conserva. Si ya existe, abre directamente ese archivo de trabajo.

## Idioma

El menú **Idioma** ofrece coreano, inglés, español, japonés y portugués de Brasil. **Automático** usa el primer idioma compatible de las preferencias del navegador; si ninguno coincide, usa inglés. Las variantes regionales se agrupan: `es-MX → es`, `pt-PT → pt-BR`.

La selección manual se conserva entre documentos y puertos en modo conectado. En modo descarga se guarda para la dirección actual del navegador. Cambiar el idioma conserva la selección, los textos y notas sin aplicar, el historial y el trabajo sin guardar. No traduce el HTML del usuario, su atributo `lang`, los nombres de archivo ni las notas. Los ejemplos usan el idioma seleccionado al abrirlos.

La CLI prioriza `--lang`, la selección manual guardada, el idioma del sistema y, por último, inglés. `open --lang` configura solo el idioma inicial de esa apertura:

```sh
npx --yes @woody_s/htmledit@latest open "./document.html" --lang es
npx --yes @woody_s/htmledit@latest --help --lang es
```

Valores: `ko`, `en`, `es`, `ja`, `pt-BR`; también se reconocen sus variantes regionales. Los comandos, claves JSON, códigos de error e ID no cambian. La preferencia se guarda en `~/.htmledit/preferences.json` o en `HTMLEDIT_HOME`. Si falla el guardado de la preferencia, se conservan las ediciones, pero el idioma podría no mantenerse en la siguiente sesión.

## Editar y aplicar notas

1. Haz clic en un elemento para editar texto, color y tamaño. Haz doble clic para editar texto en pantalla. Ctrl+Enter aplica y Esc cancela; se conserva la composición IME, el énfasis y los enlaces anidados.
2. Usa **Seleccionar elemento padre** para elegir una tarjeta. Puedes eliminar elementos o reemplazar imágenes PNG, JPEG, WebP y GIF. La imagen nueva se integra en el HTML y sustituye también las fuentes de imágenes adaptables.
3. Elige **Añadir notas**, selecciona un elemento y la posición **Este elemento / Antes / Después / Dentro**. Describe el cambio. Usa notas para elementos nuevos y cambios de diseño. Los marcadores numerados enlazan con la lista.
4. Aplica el texto y añade o guarda la nota antes de pulsar **Guardar y copiar solicitud para IA**. En modo conectado se guarda el archivo de trabajo y se copia la solicitud con su ruta. **Guardar archivo de trabajo** solo guarda. En modo descarga, adjunta el HTML de revisión junto con la solicitud.
5. Pega la solicitud en la conversación con la IA. El skill ejecuta `status → checkout → editar candidato → apply → status`. Apply verifica la revisión, crea una copia de seguridad y actualiza el archivo. El editor se actualiza automáticamente si no hay cambios sin guardar.
6. Revisa el resultado y las notas completadas. **Guardar HTML final** descarga `document.edited.html` sin notas ni ID del editor. Ese archivo no permite recuperar las notas anteriores.

Puedes editar, eliminar, completar, reabrir y reasignar notas. No se adivinan los destinos ausentes o duplicados. Una eliminación completada puede dejar una nota marcada **Sin destino**. La aplicación no determina por sí sola si una solicitud se cumplió.

La copia se interrumpe si hay entradas sin aplicar, errores de guardado, conflictos o cambios durante el guardado. Si se guarda pero falla el portapapeles, copia la solicitud desde la ayuda.

## Cambiar documentos, interactuar y recuperar

**Abrir otro documento** pregunta si deseas guardar y abre el selector del sistema. Cancelar o fallar el guardado mantiene el documento actual. Los archivos de revisión existentes no se sobrescriben; los servidores y copias anteriores se conservan. Los botones estándar del selector siguen el idioma del sistema operativo.

Usa **Interactuar** con documentos de confianza para navegar por menús y pestañas. Cambia a **Editar directamente** o **Añadir notas** en la pantalla deseada. **Volver a la primera pantalla** reinicia la navegación sin descartar ediciones ni notas. Se admiten cambios de clase, estilo y visibilidad de elementos originales; no la edición de elementos generados por scripts, valores de formularios ni lienzos. La navegación y el desplazamiento solo duran durante la sesión. Los scripts originales se conservan al exportar.

El HTML de revisión incluye notas e ID invisibles y un comentario de instrucciones para la IA en inglés. En un navegador normal solo aparece el documento. Los metadatos dañados o incompatibles bloquean el guardado. Conserva el original antes de elegir **Excluir notas ilegibles**. Los archivos guardados desde la vista de código fuente del navegador se restauran como documentos; las muestras de código normales se conservan.

En modo conectado, borradores, candidatos y copias exactas de seguridad se guardan junto al documento en `.htmledit/`. Se verifican las revisiones al escribir. Si aparecen cambios externos mientras editas, usa **Guardar mis cambios por separado** antes de **Abrir versión del disco**. Otros programas no respetan el bloqueo de escritura: la IA debe usar `apply`, nunca sobrescribir directamente el archivo de revisión.

El modo descarga guarda un borrador reciente en IndexedDB para la dirección actual tras unos 0,6 segundos. Guarda un HTML para conservar tu trabajo a largo plazo. Deshacer/rehacer conserva 50 cambios durante la sesión. Restaurar borradores o cargar resultados de IA no recupera el historial anterior; usa las copias de seguridad para versiones previas.

## Actualizar, detener y desinstalar

Repite el comando de instalación para actualizar y abre una nueva sesión del editor. Los entornos de ejecución se fijan en `~/.htmledit/versions/<version>` y sobreviven a la limpieza de la caché npm. Los skills modificados están protegidos: copia primero la carpeta indicada en el error y vuelve a instalar.

Runner de Codex: `~/.agents/skills/htmledit/scripts/run.mjs`. Runner de Claude Code: `~/.claude/skills/htmledit/scripts/run.mjs`.

```sh
node "<skill-directory>/scripts/run.mjs" status --file "./document.review.html" --json
node "<skill-directory>/scripts/run.mjs" stop --file "./document.review.html"
node "<skill-directory>/scripts/run.mjs" uninstall --agent all
```

Detén primero los servidores activos. La desinstalación elimina los skills administrados, pero conserva documentos, copias, preferencias, entornos y servidores en ejecución. Una IA en una nube independiente no puede acceder directamente a los archivos de tu PC. La compatibilidad se limita a los entornos verificados; otras distribuciones Linux, Mac Intel y otras versiones de macOS no están verificadas.

## Archivos compatibles y datos

Usa un HTML estático UTF-8 con CSS e imágenes integrados: hasta 25MB por HTML, 10MB por imagen reemplazada y 5000 notas de 1–20 000 caracteres. La sintaxis HTML puede normalizarse al guardar. Las URL de recursos externos se conservan y no se recopilan carpetas locales asociadas. Las aplicaciones React, gráficos dinámicos y scripts de ejecución de Tailwind quedan fuera del alcance. Las vistas de escritorio, 768px y 390px permiten revisar diseños adaptables.

Los modos de edición y notas bloquean scripts. Interactuar ejecuta scripts internos en un origen aislado, sin exponer el almacenamiento del editor ni el token de conexión. Se bloquean scripts externos, fetch/XHR, formularios, ventanas emergentes y navegación superior. Los scripts del documento aún pueden leer la vista previa y enviar datos mediante imágenes, estilos o navegación de su propio marco. Usa Interactuar solo con documentos de confianza. Si la navegación del marco desconecta la interacción, vuelve a la primera pantalla.

El servidor escucha en `127.0.0.1` y accede al archivo elegido. No compartas su URL: contiene un token de edición. HTMLEdit no llama a la IA ni recopila telemetría de uso. Si pides a una IA que procese el documento, se aplican sus tarifas y políticas de datos.

## Desarrollo y referencias

```sh
npm ci
npm run build
npm start
npm test
npm run test:e2e
npm run test:package
```

El modo descarga usa `http://127.0.0.1:5173`. En Windows, `start.cmd` instala, compila y abre el editor; cierra la terminal o pulsa Ctrl+C para detenerlo. Usa `npm run dev` para desarrollar. Las pruebas requieren Chrome en todos los entornos y Edge además en Windows. La verificación con Safari real se registra por separado.

Ejemplos: `public/examples/<language>/` en el código y `dist/examples/<language>/` en el paquete. [Formato de notas](REVIEW_FORMAT.es.md), [terminología](GLOSSARY.md), [historial de verificación](../SKILLS_VERIFICATION.md). Licencia MIT.

## Preparación por sistema

Ubuntu y WSLg requieren Chrome, zenity y xdg-utils. Instala las herramientas con `sudo apt-get install zenity xdg-utils`. WSL necesita una sesión WSLg y Node y Chrome para Linux. El acceso desde un navegador Windows se comprueba por separado. macOS usa su selector integrado; utiliza Cmd en lugar de Ctrl para los atajos de edición.

Por SSH o sin interfaz gráfica, ejecuta `open "./document.html" --no-browser --json`. La URL pertenece al equipo servidor. Usa un túnel SSH de bucle local al puerto indicado; no expongas el servidor públicamente. El selector se muestra en el escritorio del servidor. Sin escritorio o selector, abre otro archivo mediante la CLI. No publiques el token de la URL en registros compartidos.

[Verification / 검증 기록](../SKILLS_VERIFICATION.md)

## Insertar imágenes

Selecciona un elemento y pulsa **Insertar imagen**. Elige **Antes**, **Después** o **Al final, dentro**. El marcador y la vista previa muestran el resultado antes de aplicarlo. En tablas o listas, selecciona una celda, un elemento de lista o un contenedor adecuado.

Elige un archivo local PNG, JPEG, WebP o GIF, arrástralo al panel, pega una imagen con Ctrl+V / Cmd+V en el área de pegado, o carga una URL directa HTTP/HTTPS. Se admite una imagen a la vez, de hasta 10MB, que pueda decodificarse. La descarga por URL no envía credenciales, tiene un límite de 15 segundos y respeta las restricciones de acceso del navegador. Si el sitio bloquea el acceso, usa un archivo descargado o pega la imagen. No se admiten SVG ni fragmentos HTML del portapapeles.

Configura el tamaño original (limitado al ancho disponible) o un ancho del 1 al 100% del contenedor, la alineación izquierda/centro/derecha y el texto alternativo. **Aplicar imagen** incluye los datos en el HTML y crea un paso de deshacer. La vista previa no modifica el archivo guardado ni el historial. El HTML completo, incluidas las imágenes, no puede superar 25MB. No se comprimen ni convierten los formatos.

La imagen insertada queda seleccionada. Usa **Tamaño y alineación de imagen** para ajustarla después, o añade una nota para que la IA cambie la distribución. **Reemplazar imagen** utiliza las mismas entradas y conserva los estilos de distribución existentes. Aplica o cancela el panel antes de guardar y copiar la solicitud para la IA. Se mantienen checkout/apply y el formato review v1.

## Selección múltiple y tecla Supr

Haz clic para seleccionar un elemento. Ctrl+clic (Cmd+clic en Mac) añade o quita elementos. Cada destino muestra un borde. **Añadir una nota a los elementos seleccionados** crea una sola solicitud conjunta con el mismo número en todos los destinos. La lista permite visitar cada destino y muestra los ausentes. Reasignar sustituye los destinos por la selección actual.

**Supr** elimina los elementos seleccionados sin confirmación. **Ctrl+Z / Cmd+Z** restaura toda la eliminación en un paso. Las notas se conservan. Este atajo no elimina elementos mientras escribes texto o notas, editas texto en línea, usas un diálogo o el modo Interactuar. No se puede eliminar el cuerpo del documento.

La edición directa con selección múltiple permite eliminar en conjunto. Selecciona un elemento para editar texto, color, tamaño o imagen; no se incluye estilo masivo. Las notas de un solo destino siguen usando review v1; los archivos con notas conjuntas usan v2. Actualiza el editor y el runtime de IA antes de usarlas. Las versiones anteriores rechazan v2 para evitar perder destinos.

## Importar solicitudes de cambio (vista previa de desarrollo)

Pegue instrucciones, notas personales, comentarios o actas, o importe TXT/MD UTF-8 o DOCX. Guarde y copie el pedido de análisis para su conversación de IA existente. Revise las propuestas, sus elementos y las citas originales; solo las aprobadas se convierten en notas. El siguiente pedido desde ese panel aplica únicamente esas notas.

Requiere el modo local conectado y el editor y skill de desarrollo correspondientes. El original y el historial permanecen en `.htmledit/`, fuera del HTML exportado. Todavía no está publicado en npm. [Formato y límites](../CHANGE_REQUESTS_FORMAT.md) · [Verificación](../CHANGE_REQUESTS_VERIFICATION.md).
