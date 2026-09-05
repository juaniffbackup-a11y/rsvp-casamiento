/**
 * Recibe las confirmaciones de la web y las escribe en la planilla.
 * Pegar en Extensiones > Apps Script de la planilla.
 *
 * ACTUALIZADO 05/09/2026: la web se simplifico y quedaron siete columnas
 * huerfanas (cuantos, severa, dietaAcomp, menores, menoresDetalle,
 * accesibilidad, extra). Se sacan. Ahora se pide UN FORMULARIO POR PERSONA,
 * asi que los cubiertos son la cantidad de confirmaciones, no una suma.
 */

const HOJA = 'Respuestas';

const COLUMNAS = ['fecha','nombre','contacto','asiste','dieta',
                  'detalle','cancion','mensaje'];

function doPost(e) {
  // Sin lock, dos invitados que confirman en el mismo segundo se pisan la fila.
  // Con 275 personas recibiendo el link a la vez, eso pasa de verdad.
  //
  // Medido el 26/08/2026 con 30 envios simultaneos: el ultimo de la cola
  // espero 27,8 s. Con 30000 estabamos a dos segundos de que empezara a
  // fallar. 60 s da margen para un pico mayor sin acercarse al limite de
  // 6 minutos por ejecucion que impone Apps Script.
  const lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    const d = JSON.parse(e.postData.contents);

    // Trampa para bots. El campo esta fuera de pantalla y sin tabulacion: una
    // persona no lo ve. Si viene con algo, es un bot.
    //
    // Se responde ok a proposito. Si devolvieramos error, el bot reintentaria;
    // creyendo que funciono, se va. El 29/08/2026 entro uno que marco las nueve
    // opciones de dieta, puso 6 cubiertos y repitio un pitch comercial en cada
    // campo de texto. Los 6 cubiertos falsos rompieron el total del resumen.
    if (String(d.trampa || '').trim() !== '') {
      console.warn('Descartado por la trampa anti-bot: ' + JSON.stringify(d).slice(0, 300));
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const libro = SpreadsheetApp.getActiveSpreadsheet();
    let hoja = libro.getSheetByName(HOJA);
    if (!hoja) hoja = libro.insertSheet(HOJA);
    if (hoja.getLastRow() === 0) {
      hoja.appendRow(COLUMNAS);
      hoja.getRange(1, 1, 1, COLUMNAS.length).setFontWeight('bold');
      hoja.setFrozenRows(1);
    }
    hoja.appendRow(COLUMNAS.map(c => d[c] || ''));
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    // queda en el log de ejecuciones de Apps Script
    console.error(err);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Lo usa el latido de vigilancia, y sirve para probar el deploy a mano.
 *
 * No alcanza con responder "estoy vivo": eso lo hace Apps Script aunque el
 * script no pueda tocar la planilla. Aca se intenta LEER la hoja de verdad,
 * que es lo mismo que hace falta para escribirla. Si esto responde ok, el
 * POST tambien va a poder guardar.
 */
function doGet() {
  try {
    const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA);
    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      hoja: HOJA,
      existe: !!hoja,
      confirmaciones: hoja ? Math.max(0, hoja.getLastRow() - 1) : 0
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      ok: false, error: String(err)
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Deja la hoja de Respuestas con las columnas nuevas. Correr UNA VEZ.
 *
 * Las filas viejas tienen quince columnas y las nuevas ocho: si se mezclan,
 * los datos quedan corridos y ninguna formula del Resumen sirve. Como todo
 * lo cargado hasta hoy son pruebas mas el spam del 29/08, se borra entero.
 * Antes de borrar se guarda una copia en una hoja aparte, por las dudas.
 */
function reiniciarRespuestas() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = libro.getSheetByName(HOJA);

  if (hoja && hoja.getLastRow() > 0) {
    const respaldo = 'Respaldo ' + Utilities.formatDate(new Date(), 'GMT-3', 'dd-MM HH.mm');
    hoja.copyTo(libro).setName(respaldo);
    console.log('Copia guardada en la hoja "' + respaldo + '"');
    libro.deleteSheet(hoja);
  }

  const nueva = libro.insertSheet(HOJA);
  nueva.appendRow(COLUMNAS);
  nueva.getRange(1, 1, 1, COLUMNAS.length).setFontWeight('bold');
  nueva.setFrozenRows(1);
  nueva.setColumnWidth(1, 150);
  nueva.setColumnWidth(2, 180);
  console.log('Hoja "' + HOJA + '" reiniciada con ' + COLUMNAS.length + ' columnas: ' + COLUMNAS.join(', '));
}

/**
 * Arma la pestaña "Resumen". Correr DESPUES de reiniciarRespuestas().
 *
 * EL PROBLEMA DEL SEPARADOR (26/08/2026, dos intentos fallidos):
 * en una planilla en español el separador de argumentos es ';' y no ','.
 * Ni setValues() ni setFormula() traducen: escriben el texto tal cual, y
 * todo lo que tuviera mas de un argumento daba #ERROR. COUNTA funcionaba
 * de casualidad, porque lleva uno solo.
 * Solucion: se lee el locale de la planilla y se arma el separador correcto.
 */
function armarResumen() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const loc = libro.getSpreadsheetLocale();          // ej: 'es_ES', 'en_US'
  const C = loc.toLowerCase().indexOf('en_') === 0 ? ',' : ';';

  let h = libro.getSheetByName('Resumen');
  if (h) libro.deleteSheet(h);
  h = libro.insertSheet('Resumen', 0);

  // A=fecha B=nombre C=contacto D=asiste E=dieta F=detalle G=cancion H=mensaje
  const R = "'" + HOJA + "'";
  const A = R + '!A2:A', B = R + '!B2:B', C_ = R + '!C2:C', D = R + '!D2:D';
  const E = R + '!E2:E', F = R + '!F2:F', G = R + '!G2:G', H = R + '!H2:H';

  const textos = [
    ['CONFIRMACIONES'], ['Mica & Juani · 28 de noviembre de 2026'], [''],
    ['CUBIERTOS CONFIRMADOS'], [''],
    ['Respuestas recibidas'], ['Confirmaron que vienen'], ['Dijeron que no'],
    ['Última respuesta'], [''],
    ['REVISAR'], ['Nombres repetidos'], [''], [''],
    ['RESTRICCIONES PARA LA COCINA'], [''], [''], [''],
    ['CANCIONES PEDIDAS'], [''], [''],
    ['MENSAJES'], ['']
  ];
  h.getRange(1, 1, textos.length, 1).setValues(textos);
  h.getRange('B13').setValue('Cada persona manda su propio formulario. Si alguien aparece dos veces acá, está contado doble.');
  h.getRange('B17').setValue('Solo los que NO marcaron "Ninguna". Lo que dice "Otra" viene detallado al lado.');

  const f = {
    // un formulario por persona: los cubiertos son las confirmaciones, no una suma
    'B4':  `=COUNTIF(${D}${C}"Sí")`,
    'B6':  `=COUNTA(${B})`,
    'B7':  `=COUNTIF(${D}${C}"Sí")`,
    'B8':  `=COUNTIF(${D}${C}"No")`,
    // INDEX(rango, 0) NO devuelve "la fila cero": devuelve la columna entera,
    // que no entra en una celda y da #REF. Con la hoja vacia COUNTA da 0, asi
    // que hay que preguntar ANTES si hay filas.
    'B9':  `=IF(COUNTA(${A})=0${C}"todavía ninguna"${C}INDEX(${A}${C}COUNTA(${A})))`,
    'B12': `=IFERROR(IF(COUNTA(${B})=0${C}"—"${C}TEXTJOIN(", "${C}TRUE${C}FILTER(UNIQUE(${B})${C}COUNTIF(${B}${C}UNIQUE(${B}))>1)))${C}"ninguno")`,
    'B16': `=IFERROR(TEXTJOIN(CHAR(10)${C}TRUE${C}FILTER(${B}&" — "&${E}&IF(${F}=""${C}""${C}" ("&${F}&")")${C}${E}<>""${C}${E}<>"Ninguna"))${C}"ninguna")`,
    'B20': `=IFERROR(TEXTJOIN(CHAR(10)${C}TRUE${C}FILTER(${B}&" — "&${G}${C}${G}<>""))${C}"ninguna")`,
    'B23': `=IFERROR(TEXTJOIN(CHAR(10)${C}TRUE${C}FILTER(${B}&": "&${H}${C}${H}<>""))${C}"ninguno")`
  };
  for (const celda in f) h.getRange(celda).setFormula(f[celda]);

  h.setColumnWidth(1, 230);
  h.setColumnWidth(2, 560);
  h.getRange('A1').setFontSize(16).setFontWeight('bold');
  h.getRange('A2').setFontStyle('italic').setFontColor('#666666');
  h.getRange('A4:B4').setFontWeight('bold').setFontSize(14).setBackground('#F0E9DB');
  ['A11', 'A15', 'A19', 'A22'].forEach(c =>
    h.getRange(c).setFontWeight('bold').setFontColor('#73302F'));
  h.getRange('B13').setFontSize(9).setFontStyle('italic').setFontColor('#888888');
  h.getRange('B17').setFontSize(9).setFontStyle('italic').setFontColor('#888888');
  h.getRange('B1:B30').setWrap(true).setVerticalAlignment('top');
  h.setFrozenRows(2);

  // se deja constancia de con que separador se armo, para no volver a adivinar
  console.log('Resumen armado. Locale: ' + loc + ' | separador usado: "' + C + '"');
  console.log('Ejemplo de formula generada: ' + f['B7']);
}
