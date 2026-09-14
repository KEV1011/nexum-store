#!/usr/bin/env bash
#
# Deja el google-services.json de Firebase donde Gradle lo espera.
#
# Se acepta de las dos formas en que la gente lo pega —el archivo tal cual o su
# base64— porque exigir una sola costó tres builds y media hora de buscar por
# qué, con «base64: invalid input» como única pista. Y cuando aun así no sirve,
# el error DESCRIBE lo que llegó (largo, si menciona project_info, si parece la
# config web o una cuenta de servicio) sin imprimir su contenido: con el secreto
# enmascarado en el log, «invalid input» no deja avanzar a nadie.
#
# Uso:  preparar-google-services.sh VARIABLE PAQUETE DESTINO
#
#   VARIABLE  NOMBRE de la variable de entorno que trae el secreto, no su valor:
#             un valor en argv lo ve cualquiera que corra `ps` en la máquina.
#   PAQUETE   applicationId que el archivo DEBE mencionar.
#   DESTINO   dónde escribirlo.
#
# Salida: 0 hecho, o no había secreto (el build sigue, sin push);
#         1 el secreto está pero no sirve.
set -u

VAR="${1:?falta el nombre de la variable}"
PAQUETE="${2:?falta el paquete esperado}"
DESTINO="${3:?falta el destino}"

VALOR="${!VAR-}"

if [ -z "$VALOR" ]; then
  echo "Sin $VAR — el APK se construye sin Firebase (no recibirá avisos)."
  exit 0
fi

# ── Lo que se pega sin querer ────────────────────────────────────────────────
# El BOM del Bloc de notas y las comillas de alrededor no están en el alfabeto
# base64: con cualquiera de los dos, un secreto correcto se rechazaba.
VALOR="${VALOR#$'\xef\xbb\xbf'}"
case "$VALOR" in
  '"'*'"') VALOR="${VALOR#\"}"; VALOR="${VALOR%\"}" ;;
  "'"*"'") VALOR="${VALOR#\'}"; VALOR="${VALOR%\'}" ;;
esac

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT   # así no queda un temporal a medias en ningún camino

# ── Describir sin enseñar ────────────────────────────────────────────────────
pista() {
  if printf '%s' "$VALOR" | grep -qF "$1"; then echo "  · $2"; fi
}

diagnostico() {
  echo "::error title=Secreto ilegible::$VAR no es un google-services.json ni su base64."
  echo "Qué trae el secreto (su forma, no su contenido):"
  echo "  · largo: ${#VALOR} caracteres"
  # Lo que no puede aparecer en un base64. Si esto es mayor que cero y tampoco
  # es JSON, lo pegado es otra cosa: ni decodificarlo tiene sentido.
  local fuera
  fuera=$(printf '%s' "$VALOR" | tr -d 'A-Za-z0-9+/=_[:space:]-' | wc -c | tr -d ' ')
  echo "  · caracteres imposibles en un base64: $fuera"
  pista 'project_info'   'menciona project_info: es el archivo bueno, pero llegó cortado'
  pista 'firebaseConfig' 'parece la config WEB (el fragmento de JavaScript), no la de Android'
  pista 'apiKey'         'trae apiKey en vez de api_key: eso es la config web'
  pista 'private_key'    'parece una cuenta de servicio — esa va en FIREBASE_SERVICE_ACCOUNT_JSON'
  pista 'BEGIN '         'trae cabeceras tipo -----BEGIN-----: es salida de certutil, no base64 a secas'
  pista 'C:\'            'parece una RUTA a un archivo, no su contenido'
  echo ""
  echo "Se arregla con una de las dos: pega el contenido de google-services.json"
  echo "tal cual (Firebase Console → app Android $PAQUETE → descargar), o su base64:"
  echo '  [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\ruta\google-services.json")) | Set-Clipboard'
}

# ── El archivo tal cual, o base64 ────────────────────────────────────────────
# Se reconoce por el CONTENIDO y no por la llave inicial: un salto de línea
# delante del `{` —que cualquier editor mete al copiar— mandaría el JSON por la
# rama de base64 a morir ahí.
if printf '%s' "$VALOR" | grep -q 'project_info'; then
  printf '%s' "$VALOR" > "$TMP"
  ORIGEN="el archivo pegado tal cual"
else
  # `tr -d` quita los saltos de línea de copiar una cadena larga; `tr '_-' '/+'`
  # acepta el base64 de URL, que algunas herramientas producen; y el relleno de
  # `=` se repone, porque hay quien lo recorta al copiar.
  B64="$(printf '%s' "$VALOR" | tr -d '[:space:]' | tr '_-' '/+')"
  case $(( ${#B64} % 4 )) in
    2) B64="${B64}==" ;;
    3) B64="${B64}=" ;;
  esac
  if ! printf '%s' "$B64" | base64 --decode > "$TMP" 2>/dev/null; then
    diagnostico
    exit 1
  fi
  ORIGEN="base64"
fi

# Que `base64` no proteste no prueba nada: «estonoesnada» está en el alfabeto y
# decodifica a basura sin error. Se comprueba el contenido, en dos pasos, para
# que cada fallo diga lo suyo.
if ! grep -q 'project_info' "$TMP"; then
  diagnostico
  exit 1
fi

# Y que sea un google-services.json no significa que sea EL de esta app: el de
# la otra decodifica perfecto y produce un APK que no recibe un solo aviso, sin
# un error por el camino.
if ! grep -q "\"package_name\": *\"$PAQUETE\"" "$TMP"; then
  echo "::error title=google-services.json de otra app::El archivo no menciona $PAQUETE. Es el de la otra app: son archivos distintos, uno por applicationId."
  exit 1
fi

mkdir -p "$(dirname "$DESTINO")"
cp "$TMP" "$DESTINO"
echo "Firebase configurado para $PAQUETE (desde $ORIGEN)."
