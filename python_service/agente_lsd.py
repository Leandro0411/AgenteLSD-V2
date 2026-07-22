#!/usr/bin/env python3uidados", "")
# -*- coding: utf-8 -*-
"""
agente_lsd.py — Motor de validación LSD para python_service (Node.js bridge)
=============================================================================
Migrado desde sistema-viejo-py/agente_lsd(viejo).py
Protocolo: emite eventos JSON por stdout, línea a línea.
Invocación: python agente_lsd.py <ruta_archivo.txt> [--modo auto|rapido|profundo]

CAMBIOS RESPECTO AL SISTEMA VIEJO:
  - Eliminadas las dependencias de Flask, google.genai y knowledge_loader.
  - La IA la maneja el backend Node.js (chat.js). Este script solo hace validación determinística.
  - La salida es exclusivamente JSON por stdout (protocolo pythonBridge.js).
  - Se conserva el RULE_CATALOG completo, los parsers completos y las 25+ reglas de validación.
"""

import sys
import os
import json
import re
import time
from collections import defaultdict
from decimal import Decimal, InvalidOperation

# Forzar UTF-8 sin BOM en stdout (crítico para el pythonBridge.js en Windows)
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# ---------------------------------------------------------------------------
# CONSTANTES DE POSICIÓN LSD (0-indexed, spec AFIP LSD v2.x)
# ---------------------------------------------------------------------------

TIPO_START = 0;  TIPO_END   = 2
CUIL_START = 2;  CUIL_END   = 13

REG03_COD_START      = 13; REG03_COD_END      = 20
REG03_CONCEPTO_START = 13; REG03_CONCEPTO_END = 23
REG03_CANTIDAD_START = 23; REG03_CANTIDAD_END = 28
REG03_UNIDAD_START   = 28; REG03_UNIDAD_END   = 29
REG03_IMP_START      = 29; REG03_IMP_END      = 44
REG03_DEB_CRED_START = 44; REG03_DEB_CRED_END = 45
REG03_PERIODO_AJUSTE_START = 45; REG03_PERIODO_AJUSTE_END = 51

REG04_BASE4_START  = 220; REG04_BASE4_END  = 235
REG04_REM10_START  = 340; REG04_REM10_END  = 355
REG04_IMPORTE_DETRACCION_START = 355; REG04_IMPORTE_DETRACCION_END = 370
REG04_BASE10_START = REG04_REM10_START
REG04_BASE10_END   = REG04_REM10_END
REG04_DETRACCION_START = REG04_IMPORTE_DETRACCION_START
REG04_DETRACCION_END   = REG04_IMPORTE_DETRACCION_END

REG01_PERIODO_START    = 15; REG01_PERIODO_END    = 21
REG01_TIPO_LIQ_START   = 21; REG01_TIPO_LIQ_END   = 22
REG01_NRO_LIQ_START    = 22; REG01_NRO_LIQ_END    = 27
REG01_DIAS_BASE_START  = 27; REG01_DIAS_BASE_END  = 29
REG01_CANT_REG04_START = 29; REG01_CANT_REG04_END = 35
REG02_CBU_START        = 73; REG02_CBU_END        = 95
REG02_DIAS_LIQ_START   = 95; REG02_DIAS_LIQ_END   = 98
REG02_FECHA_PAGO_START = 98; REG02_FECHA_PAGO_END = 106
REG02_FECHA_RUB_START  = 106; REG02_FECHA_RUB_END = 114
REG02_FORMA_PAGO_START = 114; REG02_FORMA_PAGO_END = 115
REG04_REM_BRUTA_START  = 160; REG04_REM_BRUTA_END  = 175
REG04_BASE1_START      = 175; REG04_BASE1_END      = 190
REG04_BASE2_START      = 190; REG04_BASE2_END      = 205
REG04_BASE3_START      = 205; REG04_BASE3_END      = 220
REG04_BASE5_START      = 235; REG04_BASE5_END      = 250
REG04_BASE6_START      = 250; REG04_BASE6_END      = 265
REG04_BASE7_START      = 265; REG04_BASE7_END      = 280
REG04_BASE8_START      = 280; REG04_BASE8_END      = 295
REG04_BASE9_START      = 295; REG04_BASE9_END      = 310
REG04_DIF_APORTE_SS_START = 310; REG04_DIF_APORTE_SS_END = 325
REG04_DIF_CONTR_SS_START  = 325; REG04_DIF_CONTR_SS_END  = 340

REG04_BASE_POSICIONES = {
    1:  (REG04_BASE1_START, REG04_BASE1_END),
    2:  (REG04_BASE2_START, REG04_BASE2_END),
    3:  (REG04_BASE3_START, REG04_BASE3_END),
    4:  (REG04_BASE4_START, REG04_BASE4_END),
    5:  (REG04_BASE5_START, REG04_BASE5_END),
    6:  (REG04_BASE6_START, REG04_BASE6_END),
    7:  (REG04_BASE7_START, REG04_BASE7_END),
    8:  (REG04_BASE8_START, REG04_BASE8_END),
    9:  (REG04_BASE9_START, REG04_BASE9_END),
    10: (REG04_REM10_START, REG04_REM10_END),
}

LONGITUDES_REQUERIDAS = {
    '01': 35,
    '02': 115,
    '03': 51,
    '04': 370,
    '05': 65,
}

# ---------------------------------------------------------------------------
# CATÁLOGO DE REGLAS COMPLETO
# ---------------------------------------------------------------------------

RULE_CATALOG = {
    "LSD-REG01-STRUCT-001": {
        "severidad": "CRITICO", "campo": "REG01",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "El archivo debe tener exactamente un REG01 y debe ser la primera línea no vacía.",
        "causa": "El archivo TXT fue editado manualmente o hubo un error en la exportación.",
        "fix_hint": "Regenerar el TXT desde e-Sueldos para reconstruir la cabecera.",
    },
    "LSD-REG02-STRUCT-001": {
        "severidad": "CRITICO", "campo": "REG02",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "El archivo debe incluir registros REG02 de empleados.",
        "causa": "No hay empleados liquidados en el período o la exportación falló.",
        "fix_hint": "Revisar la liquidación y volver a exportar el LSD.",
    },
    "LSD-CUIL-ORPHAN-001": {
        "severidad": "CRITICO", "campo": "CUIL",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "Todo CUIL informado en REG03, REG04 o REG05 debe tener cabecera REG02.",
        "causa": "Error de exportación: se generaron conceptos o bases para un CUIL sin datos de empleado.",
        "fix_hint": "Regenerar el archivo para que cada trabajador tenga su registro de datos generales.",
    },
    "LSD-TIPO-UNKNOWN-001": {
        "severidad": "ADVERTENCIA", "campo": "Tipo de registro",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "El archivo contiene tipos de registro fuera de 01, 02, 03, 04 y 05.",
        "causa": "Se agregaron líneas manualmente o el exportador tiene un error.",
        "fix_hint": "Verificar que el TXT no tenga líneas extra o contenido agregado manualmente.",
    },
    "LSD-REG01-COUNT04-001": {
        "severidad": "CRITICO", "campo": "REG01 cantidad REG04",
        "fuente_pdf": "validaciones.pdf",
        "mensaje": "La cantidad de REG04 declarada en REG01 debe coincidir con los REG04 reales.",
        "causa": "Error en la exportación del TXT.",
        "fix_hint": "Regenerar el TXT desde e-Sueldos para corregir el contador.",
    },
    "LSD-LENGTH-001": {
        "severidad": "CRITICO", "campo": "Longitud de registros",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "Los registros deben respetar el ancho fijo del layout LSD.",
        "causa": "El archivo fue editado manualmente o el exportador generó líneas incompletas.",
        "fix_hint": "No editar el TXT manualmente; regenerarlo desde e-Sueldos.",
    },
    "LSD-REG04-DUP-001": {
        "severidad": "CRITICO", "campo": "REG04",
        "fuente_pdf": "validaciones.pdf",
        "mensaje": "Un CUIL tiene más de un REG04 (Bug A: empleado con dos legajos activos).",
        "causa": "El generador de LSD itera por legajo sin consolidar. ARCA suma todos los REG04 del mismo CUIL → bases duplicadas (ratio 2,0x).",
        "fix_hint": "Consolidar la liquidación del empleado y regenerar el LSD.",
    },
    "LSD-NUM-COMMA-001": {
        "severidad": "CRITICO", "campo": "Campos numéricos",
        "fuente_pdf": "validaciones.pdf",
        "mensaje": "Los campos numéricos no deben contener comas (Bug B, interno #30999).",
        "causa": "El campo 'sinmascaraDec' no estaba definido en el plugin jQuery. El sistema guardó valores con coma argentina en la base de datos.",
        "fix_hint": "Corregir el origen del formato numérico y regenerar el TXT.",
    },
    "LSD-NUM-NEG-001": {
        "severidad": "CRITICO", "campo": "Importes",
        "fuente_pdf": "validaciones.pdf",
        "mensaje": "El LSD no admite importes negativos en campos monetarios.",
        "causa": "Descuentos informados con signo menos en lugar de usar el indicador D/C.",
        "fix_hint": "Informar descuentos con el indicador correspondiente y no como importe negativo.",
    },
    "LSD-NUM-SCI-001": {
        "severidad": "CRITICO", "campo": "Campos numéricos",
        "fuente_pdf": "validaciones.pdf",
        "mensaje": "Los campos numéricos no deben usar notación científica (Bug H: ocurre con Rem. Total > $10.000.000).",
        "causa": "El campo remuneracionTotal era Double y Java usa notación científica para valores >= 10^7.",
        "fix_hint": "Actualizar e-Sueldos (fix commit 9b279e03) y regenerar el archivo.",
    },
    "LSD-NUM-FORMAT-001": {
        "severidad": "CRITICO", "campo": "Campos numéricos",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "Los campos numéricos de ancho fijo deben tener solo dígitos y longitud exacta.",
        "causa": "El campo fue editado manualmente o hay un error en la exportación.",
        "fix_hint": "Regenerar el TXT sin editar importes manualmente ni usar separadores.",
    },
    "LSD-REG03-DEB-CRED-001": {
        "severidad": "CRITICO", "campo": "REG03 débito/crédito",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "El indicador de débito/crédito de REG03 debe ser D o C.",
        "causa": "El concepto tiene un tipo incorrecto configurado en e-Sueldos.",
        "fix_hint": "Corregir la naturaleza del concepto en e-Sueldos y regenerar el TXT.",
    },
    "LSD-REG03-AJUSTE-001": {
        "severidad": "CRITICO", "campo": "REG03 período ajuste",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "El período de ajuste de REG03 debe ser AAAAMM, 000000 o blanco.",
        "causa": "Hay conceptos retroactivos con período de ajuste mal formateado.",
        "fix_hint": "Revisar conceptos retroactivos y regenerar el TXT.",
    },
    "LSD-REG02-CBU-001": {
        "severidad": "CRITICO", "campo": "REG02 CBU",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "Para el nro. liquidacion 1 la CBU es invalida.",
        "causa": "El empleado tiene forma de pago bancaria pero la CBU ingresada no cumple con el algoritmo Módulo 10 de cuenta/sucursal o tiene un formato incorrecto.",
        "fix_hint": "Completar una CBU real y válida para el empleado y regenerar el TXT.",
    },
    "LSD-REG02-CBU-002": {
        "severidad": "CRITICO", "campo": "REG02 CBU",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "Para el nro. liquidacion 1 no corresponde informar la CBU.",
        "causa": "El empleado tiene configurada la forma de pago en Efectivo (1) o Cheque (2), por lo tanto, el campo CBU debe ir obligatoriamente en blanco.",
        "fix_hint": "Borrar la CBU del legajo (o asegurarse de que el exportador la omita) si el empleado cobra en efectivo/cheque y regenerar el TXT.",
    },
    "LSD-REG02-DIAS-001": {
        "severidad": "CRITICO", "campo": "REG02 Días Liquidados",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "Cantidad de dias trabajados invalida",
        "causa": "El campo de días liquidados en el REG02 informa '000', lo cual ARCA rechaza si existen bases imponibles para el empleado.",
        "fix_hint": "Verificar la cantidad de días trabajados en el mes para este legajo y corregirlo antes de volver a exportar.",
    },
    "LSD-REG01-PERIOD-001": {
        "severidad": "CRITICO", "campo": "REG01 período",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "El período de REG01 debe tener formato AAAAMM válido.",
        "causa": "El período, tipo de envío o número de presentación están mal configurados.",
        "fix_hint": "Revisar período, tipo de envío y número de presentación antes de exportar.",
    },
    "LSD-REG01-CUIT-001": {
        "severidad": "CRITICO", "campo": "REG01 CUIT empleador",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "El CUIT empleador de REG01 debe tener 11 dígitos y dígito verificador válido.",
        "causa": "El CUIT de la empresa está mal cargado en e-Sueldos.",
        "fix_hint": "Revisar el CUIT de la empresa configurado en e-Sueldos y regenerar el TXT.",
    },
    "LSD-REG01-LIQ-001": {
        "severidad": "CRITICO", "campo": "REG01 tipo/número de liquidación",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "REG01 debe respetar tipo de liquidación, número de liquidación y días base según el tipo de envío.",
        "causa": "La configuración del tipo de liquidación o días base es incorrecta.",
        "fix_hint": "Revisar el período y la liquidación exportada. Para SJ usar tipo M/Q/D/H y días base 30.",
    },
    "LSD-CUIL-FORMAT-001": {
        "severidad": "CRITICO", "campo": "CUIL",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "Los CUIL informados deben tener 11 dígitos y dígito verificador válido.",
        "causa": "El CUIL del empleado está mal cargado en el sistema.",
        "fix_hint": "Corregir el CUIL del empleado en e-Sueldos y volver a exportar.",
    },
    "LSD-REG02-DUP-001": {
        "severidad": "CRITICO", "campo": "REG02",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "No debe haber más de un REG02 para el mismo CUIL.",
        "causa": "El empleado tiene legajos duplicados o relaciones repetidas en el sistema.",
        "fix_hint": "Revisar legajos duplicados o relaciones repetidas del trabajador y regenerar el TXT.",
    },
    "LSD-EMP-INTEGRITY-001": {
        "severidad": "CRITICO", "campo": "Integridad por empleado",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "Si un empleado tiene conceptos REG03, debe tener bases/atributos REG04.",
        "causa": "El cálculo del LSD está incompleto para este empleado.",
        "fix_hint": "Recalcular el Libro Sueldo Digital para que se generen los atributos del empleado.",
    },
    "LSD-REG02-FECHA-001": {
        "severidad": "CRITICO", "campo": "REG02 fechas",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "La fecha de pago debe tener formato AAAAMMDD válido.",
        "causa": "La fecha de pago o rúbrica tiene un formato incorrecto en la liquidación.",
        "fix_hint": "Corregir fecha de pago/rúbrica en la liquidación y regenerar el TXT.",
    },
    "LSD-REG02-FORMA-PAGO-001": {
        "severidad": "CRITICO", "campo": "REG02 forma de pago",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "La forma de pago debe ser 1 (Efectivo), 2 (Cheque) o 3 (Acreditación en cuenta).",
        "causa": "El empleado tiene una forma de pago inválida o sin configurar.",
        "fix_hint": "Seleccionar una forma de pago válida para el empleado.",
    },
    "LSD-REG03-DEBITO-AJUSTE": {
        "severidad": "CRITICO", "campo": "REG03 Débito Invertido",
        "fuente_pdf": "Errores Validacion AFIP",
        "mensaje": "Concepto de liquidación informado como DÉBITO ('D') anómalo.",
        "causa": "Se exportó un ajuste o concepto salarial con signo negativo (Débito). ARCA rechaza el cálculo de todas las bases imponibles (1 al 8) cuando se restan conceptos que deberían ir como Crédito.",
        "fix_hint": "Revisar si el concepto se usó para descontar dinero indebidamente. Si es un descuento real, verificar que tenga el código ARCA de deducción correcto. Corregir y regenerar el TXT.",
    },
    "LSD-REG04-BASE-001": {
        "severidad": "ADVERTENCIA", "campo": "REG04 bases imponibles",
        "fuente_pdf": "validaciones.pdf",
        "mensaje": "Base 4 en cero con Base 10 con valor (Bug C, Guía N°45 ARCA): posible uso de concepto 560.000 en lugar de 570.000 para docentes No-SIPA.",
        "causa": "Desde el primer trimestre 2026, los docentes No-SIPA deben usar el concepto 570.000. Con 560.000, Base 4 queda en cero y Base 10 acumula incorrectamente.",
        "fix_hint": "Dar de alta el concepto 570.000 con idDenominación correcto y remapear el concepto interno. Ver Guía N°45 ARCA.",
    },
    "LSD-REG04-REM-001": {
        "severidad": "CRITICO", "campo": "REG04 Remuneración/Base 1",
        "fuente_pdf": "validaciones.pdf",
        "mensaje": "La Base 1 (SIPA) no debe superar la remuneración bruta del empleado.",
        "causa": "Error en el cálculo o exportación de las bases imponibles (ticket #27571).",
        "fix_hint": "Recalcular el LSD desde e-Sueldos.",
    },
    "LSD-REG04-BASE-NEG-001": {
        "severidad": "CRITICO", "campo": "REG04 bases imponibles",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "Las bases imponibles y diferenciales no deben ser negativas.",
        "causa": "Error en el cálculo de importes, detracción o bases.",
        "fix_hint": "Revisar importes, detracción y bases calculadas antes de exportar.",
    },
    "LSD-REG04-DETRACCION-001": {
        "severidad": "CRITICO", "campo": "REG04 detracción/base 10",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "Base imponible 10 debe ser coherente con Base 2 menos importe a detraer.",
        "causa": "El cálculo de la detracción Ley 27.430 es incorrecto.",
        "fix_hint": "Recalcular detracción Ley 27.430 y regenerar el LSD.",
    },
    "LSD-REG04-BASE4-BASE5-001": {
        "severidad": "ADVERTENCIA", "campo": "REG04 bases OS/INSSJP",
        "fuente_pdf": "validaciones.pdf",
        "mensaje": "Base 4 (Obra Social) y Base 5 (INSSJP/PAMI) deben coincidir en el REG04.",
        "causa": "Diferencia de centavos por redondeo o mala parametrización de la obra social.",
        "fix_hint": "Recalcular la liquidación y regenerar el LSD desde e-Sueldos.",
    },
    "LSD-REG04-BASE9-001": {
        "severidad": "ADVERTENCIA", "campo": "REG04 Base 9",
        "fuente_pdf": "validaciones.pdf",
        "mensaje": "Base 9 supera Base 1 sin conceptos que justifiquen el incremento.",
        "causa": "Posible error en la parametrización de conceptos no remunerativos o detracción.",
        "fix_hint": "Revisar conceptos no remunerativos, detracción y parametrización de bases antes de exportar.",
    },
    "LSD-REG04-BASE9-002": {
        # Degradado a ADVERTENCIA: ARCA no rechaza solo por base9 > base2
        # (pueden ser distintas por conceptos que aportan a LRT pero no a SIPA)
        "severidad": "ADVERTENCIA", "campo": "REG04 Base 9",
        "fuente_pdf": "validaciones.pdf",
        "mensaje": "Base 9 (LRT) supera Base 2 (contribuciones SIPA) — revisar si hay conceptos que aportan a LRT pero no a SIPA.",
        "causa": "Puede ser correcto si hay conceptos que tributan LRT (ART) pero no SIPA. Verificar parametrización.",
        "fix_hint": "Revisar si la diferencia corresponde a conceptos LRT-exclusivos. Si no, recalcular bases desde e-Sueldos.",
    },
    "LSD-REG04-BASE9-ARCA": {
        "severidad": "CRITICO", "campo": "REG04 Base 9",
        "fuente_pdf": "validaciones.pdf",
        "mensaje": "Base imponible 9 (LRT/ART) informada en REG04 difiere de la determinada desde los conceptos REG03.",
        "causa": "El exportador de e-Sueldos está incluyendo conceptos indemnizatorios o de redondeo en la Base 9, que ARCA excluye al validar.",
        "fix_hint": "Verificar que conceptos indemnizatorios (familia 520xxx: vacaciones no gozadas, indemnización, preaviso, integración mes despido y sus SACs) NO sean sumados a la Base 9 de la ART. Regenerar el TXT corrigiendo la parametrización.",
    },
    "LSD-REG04-BASE9-003": {
        "severidad": "CRITICO", "campo": "REG04 Base 9",
        "fuente_pdf": "validaciones.pdf",
        "mensaje": "Base 9 informa el total sin tope mientras Base 1/4 están topadas con MOPRE.",
        "causa": "El exportador no está aplicando el tope MOPRE a Base 9 correctamente.",
        "fix_hint": "Recalcular detracción/topes y regenerar el REG04 desde e-Sueldos.",
    },
    "LSD-REG04-BASE2-001": {
        "severidad": "ADVERTENCIA", "campo": "REG04 Base 2",
        "fuente_pdf": "validaciones.pdf",
        "mensaje": "Base 2 en cero con Base 4 positiva indica REG04 inconsistente.",
        "causa": "Error en el cálculo: la base de contribuciones no se calculó pero la de obra social sí.",
        "fix_hint": "Regenerar la liquidación completa del empleado y volver a exportar el LSD.",
    },
    "LSD-REG04-REM10-001": {
        "severidad": "CRITICO", "campo": "REG04 Rem10 / detracción",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "Sin importe de detracción, Rem10 (Base imponible 10) debe ser cero (Bug K).",
        "causa": "ARCA valida que si no hay detracción aplicable, Base10 debe ser 0.",
        "fix_hint": "Recalcular detracción Ley 27.430 en e-Sueldos y regenerar el LSD.",
    },
    "LSD-REG04-DETRACCION-MAX": {
        "severidad": "CRITICO", "campo": "REG04 importe a detraer",
        "fuente_pdf": "validaciones.pdf",
        "mensaje": "El importe a detraer supera el tope legal máximo establecido.",
        "causa": "Error de cálculo en e-Sueldos al aplicar la detracción Ley 27.430.",
        "fix_hint": "Ajustar el importe de la detracción para que no supere el tope de la Ley 27.430.",
    },
    "LSD-REG04-TOPE-MAX": {
        "severidad": "CRITICO", "campo": "REG04 Bases",
        "fuente_pdf": "validaciones.pdf",
        "mensaje": "La Base Imponible informada supera el tope máximo legal (MOPRE).",
        "causa": "El sistema de liquidación no aplicó el tope legal a los conceptos remunerativos.",
        "fix_hint": "Configurar el sistema de liquidación para que limite las bases 1, 4 y 5 al tope MOPRE vigente.",
    },
    "LSD-REG04-TOPE-MOPRE-SAC": {
        "severidad": "CRITICO", "campo": "REG04 Bases Imponibles",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "La Base 1 es rechazada por ARCA porque el concepto SAC tiene muy pocos días informados (tope proporcional estricto).",
        "causa": "El concepto SAC fue informado con 1 día en lugar de los días reales del semestre.",
        "fix_hint": "Cambiar el concepto a SAC semestral o informar los días reales del semestre en las unidades.",
    },
    "LSD-REG04-BASE9-INDEM": {
        # Regla de respaldo cuando no hay codigo_arca disponible para la regla ARCA
        "severidad": "CRITICO", "campo": "REG04 Base 9",
        "fuente_pdf": "LS_Conceptos_Basicos_y_Guia_de_Uso_V2.0.pdf",
        "mensaje": "Base 9 inflada erróneamente por sumar indemnizaciones y redondeos que ARCA excluye.",
        "causa": "El exportador de e-Sueldos está inyectando erróneamente conceptos indemnizatorios (ej: 0525, 0536) en la Base 9 de la ART.",
        "fix_hint": "Error de exportación: e-Sueldos está sumando conceptos indemnizatorios a la ART. Revisar parametrización y regenerar el TXT.",
    },
    "LSD-REG04-BASES-CONCEPTOS-001": {
        "severidad": "CRITICO", "campo": "REG03/REG04 bases imponibles",
        "fuente_pdf": "validaciones.pdf",
        "mensaje": "Las bases imponibles informadas en REG04 no son coherentes con conceptos REG03 conocidos por generar diferencias ARCA.",
        "causa": "Hay conceptos no remunerativos o indemnizatorios que están inflando incorrectamente las bases.",
        "fix_hint": "Revisar parametrización de conceptos no remunerativos/detracción y recalcular el LSD desde e-Sueldos.",
    },
    "LSD-REG03-CONCEPTO-001": {
        "severidad": "ADVERTENCIA", "campo": "REG03 concepto ARCA",
        "fuente_pdf": "validaciones.pdf",
        "mensaje": "Concepto ARCA obsoleto o de uso problemático detectado (560.000 detectado).",
        "causa": "Desde la Guía N°45 de ARCA, el concepto 560.000 no aplica para docentes No-SIPA.",
        "fix_hint": "Revisar equivalencias de conceptos según Guía 45.",
    },
    "LSD-REG03-SAC-001": {
        "severidad": "CRITICO", "campo": "REG03 SAC",
        "fuente_pdf": "validaciones.pdf",
        "mensaje": "Conceptos SAC semestrales (120.000-129.999) solo corresponden en junio o diciembre.",
        "causa": "Se usó un concepto SAC semestral en un mes que no es de SAC.",
        "fix_hint": "Usar el concepto proporcional 120.003 con los días correspondientes para SAC complementaria en otros meses.",
    },
}

# ---------------------------------------------------------------------------
# CARGA DE REGLAS PERSONALIZADAS (reglas_custom.json)
# ---------------------------------------------------------------------------

CUSTOM_RULES_FILE = os.path.join(os.path.dirname(__file__), "reglas_custom.json")

def _cargar_reglas_personalizadas():
    if os.path.exists(CUSTOM_RULES_FILE):
        try:
            with open(CUSTOM_RULES_FILE, "r", encoding="utf-8") as f:
                custom_rules = json.load(f)
                for rule_id, custom_data in custom_rules.items():
                    if rule_id in RULE_CATALOG:
                        RULE_CATALOG[rule_id].update(custom_data)
        except Exception:
            pass

_cargar_reglas_personalizadas()

# ---------------------------------------------------------------------------
# CARGA DE REGLAS DINÁMICAS (Desde MongoDB vía Node.js)
# ---------------------------------------------------------------------------
DYN_RULES_FILE = os.path.join(os.path.dirname(__file__), "reglas_dinamicas.json")

def _cargar_reglas_dinamicas() -> list:
    if os.path.exists(DYN_RULES_FILE):
        try:
            with open(DYN_RULES_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return []

REGLAS_DINAMICAS = _cargar_reglas_dinamicas()

# ---------------------------------------------------------------------------
# HELPERS DE PARSEO
# ---------------------------------------------------------------------------

def _slice(linea: str, start: int, end: int) -> str:
    return linea[start:end] if len(linea) > start else ''

def _int_or_none(valor: str) -> int | None:
    valor = (valor or '').strip()
    if not valor or not re.fullmatch(r'-?\d+', valor):
        return None
    return int(valor)

def _decimal_centavos_or_none(valor: str) -> Decimal | None:
    valor = (valor or '').strip()
    if not re.fullmatch(r'-?\d+', valor):
        return None
    try:
        return Decimal(valor) / Decimal(100)
    except InvalidOperation:
        return None

def _money_or_none(valor: str) -> Decimal | None:
    return _decimal_centavos_or_none(valor)

def _campo_numerico_exacto(valor: str, longitud: int, permitir_blanco: bool = False) -> bool:
    if permitir_blanco and not (valor or '').strip():
        return True
    return len(valor) == longitud and valor.isdigit()

def _periodo_yyyymm_valido(valor: str, permitir_blanco: bool = False, permitir_ceros: bool = False) -> bool:
    valor = valor or ''
    if permitir_blanco and not valor.strip():
        return True
    if permitir_ceros and valor == "000000":
        return True
    if not re.fullmatch(r'\d{6}', valor):
        return False
    return 1 <= int(valor[4:6]) <= 12

def _fecha_yyyymmdd_valida(valor: str, permitir_blanco: bool = False) -> bool:
    valor = valor or ''
    if permitir_blanco and not valor.strip():
        return True
    if valor == "00000000":
        return True
    if not re.fullmatch(r'\d{8}', valor):
        return False
    anio = int(valor[:4]); mes = int(valor[4:6]); dia = int(valor[6:8])
    if not (1900 <= anio <= 2100 and 1 <= mes <= 12):
        return False
    dias_mes = [31, 29 if (anio % 400 == 0 or (anio % 4 == 0 and anio % 100 != 0)) else 28,
                31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return 1 <= dia <= dias_mes[mes - 1]

def _cuit_cuil_valido(valor: str) -> bool:
    if not re.fullmatch(r'\d{11}', valor or ''):
        return False
    pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
    suma = sum(int(valor[i]) * pesos[i] for i in range(10))
    resto = suma % 11
    digito = 11 - resto
    if digito == 11: digito = 0
    elif digito == 10: digito = 9
    return digito == int(valor[-1])

def _cbu_valido(cbu: str) -> bool:
    if not re.fullmatch(r'\d{22}', cbu):
        return False
    # Validar primer bloque (Banco + Sucursal)
    banco_suc = cbu[:7]
    vd1 = int(cbu[7])
    suma1 = sum(int(banco_suc[i]) * p for i, p in enumerate([7, 1, 3, 9, 7, 1, 3]))
    if (10 - (suma1 % 10)) % 10 != vd1: return False
    
    # Validar segundo bloque (Cuenta)
    cuenta = cbu[8:21]
    vd2 = int(cbu[21])
    suma2 = sum(int(cuenta[i]) * p for i, p in enumerate([3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]))
    if (10 - (suma2 % 10)) % 10 != vd2: return False
    
    return True

def _sumar_conceptos(conceptos: list[dict], codigos: set[str]) -> Decimal:
    total = Decimal("0")
    for concepto in conceptos:
        if concepto.get("codigo_concepto", "").strip() not in codigos:
            continue
        importe = concepto.get("importe")
        if importe is None:
            continue
        if concepto.get("debito_credito") == "D":
            total -= importe
        else:
            total += importe
    return total

def _raws_conceptos(conceptos: list[dict], codigos: set[str], limite: int = 20) -> list[dict]:
    relacionados = []
    for concepto in conceptos:
        if concepto.get("codigo_concepto", "").strip() not in codigos:
            continue
        relacionados.append({
            "linea": concepto.get("linea"),
            "codigo": concepto.get("codigo_concepto", ""),
            "importe": concepto.get("importe_raw", ""),
            "debito_credito": concepto.get("debito_credito", ""),
        })
        if len(relacionados) >= limite:
            break
    return relacionados

# ---------------------------------------------------------------------------
# PARSERS DE REGISTROS
# ---------------------------------------------------------------------------

def parse_reg01(linea: str, nro_linea: int) -> dict:
    return {
        "tipo": "01", "linea": nro_linea, "raw": linea, "longitud": len(linea),
        "cuit_empleador":   _slice(linea, 2, 13),
        "tipo_envio":       _slice(linea, 13, 15),
        "periodo":          _slice(linea, REG01_PERIODO_START, REG01_PERIODO_END),
        "tipo_liquidacion": _slice(linea, 21, 22),
        "nro_presentacion": _slice(linea, 22, 27),
        "dias_base":        _slice(linea, 27, 29),
        "cantidad_reg04":   _int_or_none(_slice(linea, REG01_CANT_REG04_START, REG01_CANT_REG04_END)),
    }

def parse_reg02(linea: str, nro_linea: int) -> dict:
    return {
        "tipo": "02", "linea": nro_linea, "raw": linea, "longitud": len(linea),
        "cuil":          _slice(linea, 2, 13),
        "legajo":        _slice(linea, 13, 23),
        "dependencia":   _slice(linea, 23, 73),
        "cbu":           _slice(linea, REG02_CBU_START, REG02_CBU_END),
        "dias_liquidados": _slice(linea, 95, 98),
        "fecha_pago":    _slice(linea, 98, 106),
        "fecha_rubrica": _slice(linea, 106, 114),
        "forma_pago":    _slice(linea, REG02_FORMA_PAGO_START, REG02_FORMA_PAGO_END),
    }

def parse_reg03(linea: str, nro_linea: int) -> dict:
    return {
        "tipo": "03", "linea": nro_linea, "raw": linea, "longitud": len(linea),
        "cuil":             _slice(linea, 2, 13),
        "codigo_concepto":  _slice(linea, REG03_CONCEPTO_START, REG03_CONCEPTO_END).strip(),
        "codigo_arca":      _slice(linea, REG03_COD_START, REG03_COD_END).strip(),
        "cantidad":         _slice(linea, REG03_CANTIDAD_START, REG03_CANTIDAD_END).strip(),
        "unidad":           _slice(linea, REG03_UNIDAD_START, REG03_UNIDAD_END).strip(),
        "importe_raw":      _slice(linea, REG03_IMP_START, REG03_IMP_END).strip(),
        "importe":          _money_or_none(_slice(linea, REG03_IMP_START, REG03_IMP_END)),
        "debito_credito":   _slice(linea, REG03_DEB_CRED_START, REG03_DEB_CRED_END).strip(),
        "periodo_ajuste":   _slice(linea, REG03_PERIODO_AJUSTE_START, REG03_PERIODO_AJUSTE_END).strip(),
    }

def parse_reg04(linea: str, nro_linea: int) -> dict:
    return {
        "tipo": "04", "linea": nro_linea, "raw": linea, "longitud": len(linea),
        "cuil":                _slice(linea, 2, 13),
        "rem_bruta_raw":       _slice(linea, REG04_REM_BRUTA_START, REG04_REM_BRUTA_END).strip(),
        "rem_bruta":           _money_or_none(_slice(linea, REG04_REM_BRUTA_START, REG04_REM_BRUTA_END)),
        "base1_raw":           _slice(linea, REG04_BASE1_START, REG04_BASE1_END).strip(),
        "base1":               _money_or_none(_slice(linea, REG04_BASE1_START, REG04_BASE1_END)),
        "base2_raw":           _slice(linea, REG04_BASE2_START, REG04_BASE2_END).strip(),
        "base2":               _money_or_none(_slice(linea, REG04_BASE2_START, REG04_BASE2_END)),
        "base3_raw":           _slice(linea, REG04_BASE3_START, REG04_BASE3_END).strip(),
        "base3":               _money_or_none(_slice(linea, REG04_BASE3_START, REG04_BASE3_END)),
        "base4_raw":           _slice(linea, REG04_BASE4_START, REG04_BASE4_END).strip(),
        "base4":               _money_or_none(_slice(linea, REG04_BASE4_START, REG04_BASE4_END)),
        "base5_raw":           _slice(linea, REG04_BASE5_START, REG04_BASE5_END).strip(),
        "base5":               _money_or_none(_slice(linea, REG04_BASE5_START, REG04_BASE5_END)),
        "base6_raw":           _slice(linea, REG04_BASE6_START, REG04_BASE6_END).strip(),
        "base6":               _money_or_none(_slice(linea, REG04_BASE6_START, REG04_BASE6_END)),
        "base7_raw":           _slice(linea, REG04_BASE7_START, REG04_BASE7_END).strip(),
        "base7":               _money_or_none(_slice(linea, REG04_BASE7_START, REG04_BASE7_END)),
        "base8_raw":           _slice(linea, REG04_BASE8_START, REG04_BASE8_END).strip(),
        "base8":               _money_or_none(_slice(linea, REG04_BASE8_START, REG04_BASE8_END)),
        "base9_raw":           _slice(linea, REG04_BASE9_START, REG04_BASE9_END).strip(),
        "base9":               _money_or_none(_slice(linea, REG04_BASE9_START, REG04_BASE9_END)),
        "dif_aporte_ss_raw":   _slice(linea, REG04_DIF_APORTE_SS_START, REG04_DIF_APORTE_SS_END).strip(),
        "dif_aporte_ss":       _money_or_none(_slice(linea, REG04_DIF_APORTE_SS_START, REG04_DIF_APORTE_SS_END)),
        "dif_contr_ss_raw":    _slice(linea, REG04_DIF_CONTR_SS_START, REG04_DIF_CONTR_SS_END).strip(),
        "dif_contr_ss":        _money_or_none(_slice(linea, REG04_DIF_CONTR_SS_START, REG04_DIF_CONTR_SS_END)),
        "base10_raw":          _slice(linea, REG04_BASE10_START, REG04_BASE10_END).strip(),
        "base10":              _money_or_none(_slice(linea, REG04_BASE10_START, REG04_BASE10_END)),
        "importe_detraer_raw": _slice(linea, REG04_DETRACCION_START, REG04_DETRACCION_END).strip(),
        "importe_detraer":     _money_or_none(_slice(linea, REG04_DETRACCION_START, REG04_DETRACCION_END)),
    }

def parse_reg05(linea: str, nro_linea: int) -> dict:
    return {
        "tipo": "05", "linea": nro_linea, "raw": linea, "longitud": len(linea),
        "cuil":                _slice(linea, 2, 13),
        "categoria_profesional": _slice(linea, 13, 19),
        "puesto":              _slice(linea, 19, 23),
        "fecha_ingreso":       _slice(linea, 23, 31),
        "fecha_egreso":        _slice(linea, 31, 39),
        "importe_raw":         _slice(linea, 39, 54).strip(),
        "importe":             _money_or_none(_slice(linea, 39, 54)),
        "cuit_eventual":       _slice(linea, 54, 65),
    }

def parse_registro(linea: str, nro_linea: int) -> dict:
    tipo = linea[TIPO_START:TIPO_END] if len(linea) >= TIPO_END else '??'
    if tipo == '01': return parse_reg01(linea, nro_linea)
    if tipo == '02': return parse_reg02(linea, nro_linea)
    if tipo == '03': return parse_reg03(linea, nro_linea)
    if tipo == '04': return parse_reg04(linea, nro_linea)
    if tipo == '05': return parse_reg05(linea, nro_linea)
    cuil = linea[CUIL_START:CUIL_END] if len(linea) >= CUIL_END else '?'
    return {"tipo": tipo, "linea": nro_linea, "raw": linea, "longitud": len(linea), "cuil": cuil}

# ---------------------------------------------------------------------------
# LECTURA Y CONSTRUCCIÓN DEL ANÁLISIS
# ---------------------------------------------------------------------------

_ANALISIS_CACHE: dict = {}

def _leer_lineas(ruta: str) -> list[str]:
    for enc in ('utf-8', 'latin-1', 'cp1252'):
        try:
            with open(ruta, encoding=enc) as f:
                return [l.rstrip('\r\n') for l in f]
        except UnicodeDecodeError:
            continue
    raise ValueError(f"No se pudo decodificar {ruta}")

def _construir_analisis(ruta: str) -> dict:
    lineas = _leer_lineas(ruta)
    registros = []
    by_type: dict[str, list[dict]] = defaultdict(list)
    empleados: dict[str, dict] = {}
    conceptos_por_cuil: dict[str, list[dict]] = defaultdict(list)
    bases_por_cuil: dict[str, list[dict]] = defaultdict(list)
    eventuales_por_cuil: dict[str, list[dict]] = defaultdict(list)

    for nro, linea in enumerate(lineas, 1):
        if not linea.strip():
            continue
        reg = parse_registro(linea, nro)
        registros.append(reg)
        by_type[reg["tipo"]].append(reg)
        cuil = reg.get("cuil")
        if reg["tipo"] == "02" and cuil:
            empleados[cuil] = reg
        elif reg["tipo"] == "03" and cuil:
            conceptos_por_cuil[cuil].append(reg)
        elif reg["tipo"] == "04" and cuil:
            bases_por_cuil[cuil].append(reg)
        elif reg["tipo"] == "05" and cuil:
            eventuales_por_cuil[cuil].append(reg)

    analisis = {
        "ruta": os.path.abspath(ruta),
        "size_bytes": os.path.getsize(ruta),
        "total_lineas": len(lineas),
        "lineas_vacias": sum(1 for l in lineas if not l.strip()),
        "registros": registros,
        "by_type": dict(by_type),
        "empleados": empleados,
        "conceptos_por_cuil": dict(conceptos_por_cuil),
        "bases_por_cuil": dict(bases_por_cuil),
        "eventuales_por_cuil": dict(eventuales_por_cuil),
        "registros_por_tipo": {t: len(v) for t, v in by_type.items()},
        "issues": [],
    }
    analisis["issues"] = ejecutar_reglas_deterministicas(analisis)
    return analisis

def obtener_analisis_lsd(ruta: str) -> dict:
    abs_path = os.path.abspath(ruta)
    stat = os.stat(abs_path)
    key = (abs_path, stat.st_mtime, stat.st_size)
    if key not in _ANALISIS_CACHE:
        _ANALISIS_CACHE.clear()
        _ANALISIS_CACHE[key] = _construir_analisis(abs_path)
    return _ANALISIS_CACHE[key]

# ---------------------------------------------------------------------------
# MOTOR DE REGLAS DETERMINÍSTICAS (COMPLETO)
# ---------------------------------------------------------------------------

def _add_issue(issues: list[dict], rule_id: str, **extra) -> None:
    rule = RULE_CATALOG.get(rule_id, {"severidad": "CRITICO", "mensaje": rule_id, "causa": "", "fix_hint": ""})
    issues.append({"id": rule_id, **rule, **extra})

def _add_numeric_issue(issues: list[dict], reg: dict, campo: str, valor: str, longitud: int, permitir_blanco: bool = False) -> None:
    if _campo_numerico_exacto(valor, longitud, permitir_blanco=permitir_blanco):
        return
    _add_issue(
        issues, "LSD-NUM-FORMAT-001",
        linea=reg["linea"], cuil=reg.get("cuil"),
        detalle={
            "tipo": reg["tipo"], "campo": campo, "valor": valor,
            "longitud": len(valor), "longitud_esperada": longitud,
        },
    )

def ejecutar_reglas_deterministicas(analisis: dict) -> list[dict]:
    issues: list[dict] = []
    by_type = analisis["by_type"]
    registros = analisis["registros"]
    reg01s = by_type.get("01", [])
    reg02s = by_type.get("02", [])

    # ── Estructura global ────────────────────────────────────────────────────
    if len(reg01s) != 1:
        _add_issue(issues, "LSD-REG01-STRUCT-001", detalle={"cantidad_reg01": len(reg01s)})
    elif registros and registros[0]["tipo"] != "01":
        _add_issue(issues, "LSD-REG01-STRUCT-001", detalle={"problema": "REG01 no es la primera línea"})

    if not reg02s:
        _add_issue(issues, "LSD-REG02-STRUCT-001", detalle={"cantidad_reg02": 0})

    cuils_02 = set(analisis["empleados"])
    for tipo, index_name in (("03", "conceptos_por_cuil"), ("04", "bases_por_cuil"), ("05", "eventuales_por_cuil")):
        huerfanos = sorted(set(analisis[index_name]) - cuils_02)
        if huerfanos:
            _add_issue(issues, "LSD-CUIL-ORPHAN-001", detalle={"tipo": tipo, "cantidad": len(huerfanos), "cuils": huerfanos[:20]})

    desconocidos = sorted(set(by_type) - {"01", "02", "03", "04", "05"})
    if desconocidos:
        _add_issue(issues, "LSD-TIPO-UNKNOWN-001", detalle={"tipos": desconocidos})

    # ── REG01 detallado ──────────────────────────────────────────────────────
    if len(reg01s) == 1:
        declarado = reg01s[0].get("cantidad_reg04")
        real = len(by_type.get("04", []))
        if declarado is None or declarado != real:
            _add_issue(issues, "LSD-REG01-COUNT04-001", detalle={"declarado": declarado, "real": real})

        periodo    = reg01s[0].get("periodo", "")
        tipo_envio = reg01s[0].get("tipo_envio", "")
        nro_pres   = reg01s[0].get("nro_presentacion", "")
        errores_period = []
        if not re.fullmatch(r'\d{6}', periodo or ''):
            errores_period.append("periodo_no_numerico")
        else:
            mes = int(periodo[4:6])
            if not 1 <= mes <= 12:
                errores_period.append("mes_invalido")
        if tipo_envio not in ("SJ", "RE"):
            errores_period.append("tipo_envio_invalido")
        if not re.fullmatch(r'\d{5}', nro_pres or ''):
            errores_period.append("nro_presentacion_invalido")
        if errores_period:
            _add_issue(issues, "LSD-REG01-PERIOD-001", detalle={"errores": errores_period, "periodo": periodo, "tipo_envio": tipo_envio})

        cuit_emp = reg01s[0].get("cuit_empleador", "")
        if not _cuit_cuil_valido(cuit_emp):
            _add_issue(issues, "LSD-REG01-CUIT-001", detalle={"cuit_empleador": cuit_emp})

        tipo_liq  = reg01s[0].get("tipo_liquidacion", "")
        dias_base = reg01s[0].get("dias_base", "")
        errores_liq = []
        if tipo_envio == "SJ":
            if tipo_liq not in ("M", "Q", "D", "H"):
                errores_liq.append("tipo_liquidacion_invalido_para_sj")
            if dias_base != "30":
                errores_liq.append("dias_base_debe_ser_30")
        elif tipo_envio == "RE":
            if tipo_liq.strip():
                errores_liq.append("tipo_liquidacion_debe_ir_en_blanco_para_re")
        if errores_liq:
            _add_issue(issues, "LSD-REG01-LIQ-001", detalle={"errores": errores_liq, "tipo_envio": tipo_envio, "tipo_liquidacion": tipo_liq, "dias_base": dias_base})

    # ── REG02 ────────────────────────────────────────────────────────────────
    reg02_por_cuil: dict[str, list[dict]] = defaultdict(list)
    for reg in reg02s:
        reg02_por_cuil[reg.get("cuil", "")].append(reg)
    for cuil, regs in reg02_por_cuil.items():
        if len(regs) > 1:
            _add_issue(issues, "LSD-REG02-DUP-001", cuil=cuil, detalle={"cantidad_reg02": len(regs)})

    for reg in reg02s:
        cuil = reg.get("cuil", "")
        if not _cuit_cuil_valido(cuil):
            _add_issue(issues, "LSD-CUIL-FORMAT-001", linea=reg["linea"], cuil=cuil, detalle={"tipo": "02"})
        
        forma_pago = reg.get("forma_pago", "")
        if forma_pago not in ("1", "2", "3"):
            _add_issue(issues, "LSD-REG02-FORMA-PAGO-001", linea=reg["linea"], cuil=cuil, detalle={"forma_pago": forma_pago})
        
        fecha_pago    = reg.get("fecha_pago", "")
        fecha_rubrica = reg.get("fecha_rubrica", "")
        errores_fecha = []
        if not _fecha_yyyymmdd_valida(fecha_pago):
            errores_fecha.append("fecha_pago_invalida")
        if not _fecha_yyyymmdd_valida(fecha_rubrica, permitir_blanco=True):
            errores_fecha.append("fecha_rubrica_invalida")
        if errores_fecha:
            _add_issue(issues, "LSD-REG02-FECHA-001", linea=reg["linea"], cuil=cuil,
                       detalle={"errores": errores_fecha, "fecha_pago": fecha_pago, "fecha_rubrica": fecha_rubrica})

        # CBU Estricto ARCA
        cbu = reg.get("cbu", "")
        cbu_limpio = cbu.strip()
        
        if forma_pago == "3":
            if not _cbu_valido(cbu):
                _add_issue(issues, "LSD-REG02-CBU-001", linea=reg["linea"], cuil=cuil,
                           detalle={"forma_pago": forma_pago, "cbu": cbu, "problema": "CBU inválida (Falla Módulo 10)"})
        elif forma_pago in ("1", "2"):
            if cbu_limpio:  # Si tiene algo escrito y debería estar vacío
                _add_issue(issues, "LSD-REG02-CBU-002", linea=reg["linea"], cuil=cuil,
                           detalle={"forma_pago": forma_pago, "cbu": cbu, "problema": "No corresponde informar CBU"})

    # ── Integridad por empleado ──────────────────────────────────────────────
    for tipo, index_name in (("03", "conceptos_por_cuil"), ("04", "bases_por_cuil"), ("05", "eventuales_por_cuil")):
        for cuil, regs in analisis[index_name].items():
            if cuil and not _cuit_cuil_valido(cuil):
                _add_issue(issues, "LSD-CUIL-FORMAT-001", linea=regs[0]["linea"], cuil=cuil, detalle={"tipo": tipo})

    for cuil, conceptos in analisis["conceptos_por_cuil"].items():
        if conceptos and not analisis["bases_por_cuil"].get(cuil):
            _add_issue(issues, "LSD-EMP-INTEGRITY-001", cuil=cuil,
                       detalle={"conceptos": len(conceptos), "bases": 0})

    # ── Longitudes ───────────────────────────────────────────────────────────
    for reg in registros:
        req = LONGITUDES_REQUERIDAS.get(reg["tipo"])
        if not req:
            continue
        lon = reg["longitud"]
        if reg["tipo"] in ("03", "04"):
            if lon < req:
                _add_issue(issues, "LSD-LENGTH-001", linea=reg["linea"], cuil=reg.get("cuil"),
                           detalle={"tipo": reg["tipo"], "longitud": lon, "minima": req})
        elif lon != req:
            _add_issue(issues, "LSD-LENGTH-001", linea=reg["linea"], cuil=reg.get("cuil"),
                       detalle={"tipo": reg["tipo"], "longitud": lon, "requerida": req})

    # ── Validaciones numéricas campo a campo ─────────────────────────────────
    for reg in reg01s:
        raw = reg["raw"]
        _add_numeric_issue(issues, reg, "cuit_empleador",   _slice(raw, 2, 13),                              11)
        _add_numeric_issue(issues, reg, "periodo",          _slice(raw, REG01_PERIODO_START, REG01_PERIODO_END), 6)
        _add_numeric_issue(issues, reg, "nro_presentacion", _slice(raw, 22, 27),                             5)
        _add_numeric_issue(issues, reg, "cantidad_reg04",   _slice(raw, REG01_CANT_REG04_START, REG01_CANT_REG04_END), 6)

    for reg in reg02s:
        raw = reg["raw"]
        _add_numeric_issue(issues, reg, "cuil",             _slice(raw, 2, 13),     11)
        _add_numeric_issue(issues, reg, "dias_liquidados",  _slice(raw, 95, 98),     3)
        _add_numeric_issue(issues, reg, "fecha_pago",       _slice(raw, 98, 106),    8)
        _add_numeric_issue(issues, reg, "fecha_rubrica",    _slice(raw, 106, 114),   8, permitir_blanco=True)

    for reg in by_type.get("03", []):
        raw = reg["raw"]
        _add_numeric_issue(issues, reg, "cantidad", _slice(raw, REG03_CANTIDAD_START, REG03_CANTIDAD_END), 5)
        _add_numeric_issue(issues, reg, "importe",  _slice(raw, REG03_IMP_START, REG03_IMP_END),         15)
        
        debito_credito = reg.get("debito_credito", "")
        if debito_credito not in ("D", "C"):
            _add_issue(issues, "LSD-REG03-DEB-CRED-001", linea=reg["linea"], cuil=reg.get("cuil"), detalle={"valor": debito_credito})
            
        periodo_ajuste = _slice(raw, REG03_PERIODO_AJUSTE_START, REG03_PERIODO_AJUSTE_END)
        if not _periodo_yyyymm_valido(periodo_ajuste, permitir_blanco=True, permitir_ceros=True):
            _add_issue(issues, "LSD-REG03-AJUSTE-001", linea=reg["linea"], cuil=reg.get("cuil"), detalle={"periodo_ajuste": periodo_ajuste})

        # Detectar Débitos anómalos (Ajustes negativos que ARCA rechaza en bases)
        cod_interno = reg.get("codigo_concepto", "").strip()
        if debito_credito == "D" and cod_interno.isdigit():
            # Si el código es menor a 500 y NO es uno de los permitidos, sumamos el error
            if int(cod_interno) < 500 and int(cod_interno) not in (33, 34, 416, 445, 446, 453, 454):
                _add_issue(issues, "LSD-REG03-DEBITO-AJUSTE", linea=reg["linea"], cuil=reg.get("cuil"),
                           detalle={"concepto": cod_interno, "importe": reg.get("importe")})

    campos_reg04 = [
        ("rem_bruta",    REG04_REM_BRUTA_START, REG04_REM_BRUTA_END),
        ("base1",        REG04_BASE1_START,     REG04_BASE1_END),
        ("base2",        REG04_BASE2_START,     REG04_BASE2_END),
        ("base3",        REG04_BASE3_START,     REG04_BASE3_END),
        ("base4",        REG04_BASE4_START,     REG04_BASE4_END),
        ("base5",        REG04_BASE5_START,     REG04_BASE5_END),
        ("base6",        REG04_BASE6_START,     REG04_BASE6_END),
        ("base7",        REG04_BASE7_START,     REG04_BASE7_END),
        ("base8",        REG04_BASE8_START,     REG04_BASE8_END),
        ("base9",        REG04_BASE9_START,     REG04_BASE9_END),
        ("dif_aporte_ss",REG04_DIF_APORTE_SS_START, REG04_DIF_APORTE_SS_END),
        ("dif_contr_ss", REG04_DIF_CONTR_SS_START,  REG04_DIF_CONTR_SS_END),
        ("base10",       REG04_BASE10_START,    REG04_BASE10_END),
        ("importe_detraer", REG04_DETRACCION_START, REG04_DETRACCION_END),
    ]
    for reg in by_type.get("04", []):
        raw = reg["raw"]
        for campo, start, end in campos_reg04:
            _add_numeric_issue(issues, reg, campo, _slice(raw, start, end), end - start)

    for reg in by_type.get("05", []):
        raw = reg["raw"]
        _add_numeric_issue(issues, reg, "fecha_ingreso",  _slice(raw, 23, 31), 8)
        _add_numeric_issue(issues, reg, "fecha_egreso",   _slice(raw, 31, 39), 8, permitir_blanco=True)
        _add_numeric_issue(issues, reg, "importe",        _slice(raw, 39, 54), 15)
        _add_numeric_issue(issues, reg, "cuit_eventual",  _slice(raw, 54, 65), 11)

    # ── Comas, negativos y notación científica ───────────────────────────────
    for reg in registros:
        if reg["tipo"] in ("03", "04"):
            campos = reg["raw"][13:] if len(reg["raw"]) > 13 else ""
            if "," in campos:
                posiciones = [13 + i for i, c in enumerate(campos) if c == ","]
                _add_issue(issues, "LSD-NUM-COMMA-001", linea=reg["linea"], cuil=reg.get("cuil"),
                           detalle={"tipo": reg["tipo"], "posiciones": posiciones[:10]})
            if re.search(r'\d[eE][+\-]?\d', campos):
                _add_issue(issues, "LSD-NUM-SCI-001", linea=reg["linea"], cuil=reg.get("cuil"),
                           detalle={"tipo": reg["tipo"], "extracto": campos[:80]})
            if "-" in campos:
                _add_issue(issues, "LSD-NUM-NEG-001", linea=reg["linea"], cuil=reg.get("cuil"),
                           detalle={"tipo": reg["tipo"]})
    # ── REG04 duplicados ─────────────────────────────────────────────────────
    for cuil, regs in analisis["bases_por_cuil"].items():
        if len(regs) > 1:
            _add_issue(issues, "LSD-REG04-DUP-001", cuil=cuil,
                       detalle={"cantidad_reg04": len(regs), "lineas": [r["linea"] for r in regs]})

    # ── Cálculo de Base9 según lógica ARCA ──────────────────────────────
    # ARCA determina Base 9 sumando todos los créditos REG03 EXCEPTO los
    # conceptos de naturaleza indemnizatoria (familia AFIP 520xxx) y redondeo.
    # Como el TXT LSD solo lleva el código interno (4 dígitos), usamos un set
    # de los códigos internos más comunes que corresponden a esas familias.
    # Fuente: verificación empírica contra errores de validación reales de ARCA.
    #
    # EXCLUIDOS (familia AFIP 520xxx = indemnizatorios + sus SACs, y 799999 = redondeo):
    #   0525 → ANTIGUEDAD ART 245 LCT (indem por despido)
    #   0533 → VACACIONES NO GOZADAS
    #   0534 → SAC S/VACACIONES NO GOZADAS
    #   0535 → INDEM SUSTITUTIVA PREAVISO
    #   0536 → SAC S/PREAVISO
    #   0537 → INTEGRACION MES DESPIDO
    #   0538 → SAC S/INTEGRACION MES DESPIDO
    #   0539 → SAC NO REMUNERATIVOS (cuando es sobre indem)
    #   0541 → INDEMNIZACION ANTIGUEDAD (variante)
    #   0546 → OMISION PREAVISO
    #   0547 → SAC S/INDEMNIZACION ANTIGUEDAD
    #   0599 → REDONDEO
    CODIGOS_EXCLUIDOS_BASE9_ARCA = {
        "0525", "0533", "0534", "0535", "0536", "0537", "0538", "0539",
        "0541", "0546", "0547", "0599",
    }

    # ── Validaciones de bases REG04 (matemáticas y de negocio) ───────────────
    mes_liq = "01"
    if reg01s:
        per_str = reg01s[0].get("periodo", "")
        if len(per_str) == 6:
            mes_liq = per_str[4:6]

    # Tope de detracción: $7.038,70 mes normal, $10.558,05 en meses SAC (jun/dic)
    tope_detraccion = Decimal("10558.05") if mes_liq in ("06", "12") else Decimal("7038.70")

    for reg in by_type.get("04", []):
        base4  = reg.get("base4")
        base5  = reg.get("base5")
        base9  = reg.get("base9")
        base10 = reg.get("base10")
        base2  = reg.get("base2")
        base1  = reg.get("base1")
        rem    = reg.get("rem_bruta")
        importe_detraer = reg.get("importe_detraer")
        empleado = analisis["empleados"].get(reg["cuil"], {})
        legajo   = (empleado.get("legajo") or "").strip()
        conceptos = analisis["conceptos_por_cuil"].get(reg["cuil"], [])

        # Rastrea si BASE9-ARCA ya detectó error para este CUIL (para suprimir reglas redundantes)
        base9_arca_disparado = False

        if base9 is not None and conceptos:
            # Fórmula ARCA exacta: suma créditos REG03 excluyendo indemnizatorios y redondeo
            base9_determinada = Decimal("0")
            conceptos_excluidos_arca = []
            for c in conceptos:
                if c.get("debito_credito") != "C":
                    continue
                imp = c.get("importe")
                if imp is None:
                    continue
                cod_interno = c.get("codigo_concepto", "").strip()
                if cod_interno in CODIGOS_EXCLUIDOS_BASE9_ARCA:
                    conceptos_excluidos_arca.append({
                        "codigo": cod_interno,
                        "importe": str(imp),
                    })
                else:
                    base9_determinada += imp

            diferencia_base9 = base9 - base9_determinada
            # Solo es error si la base 9 informada es MAYOR a la determinada
            # Si es menor, está bien: el consultor excluyó conceptos válidos.
            if diferencia_base9 > Decimal("1.00"):
                base9_arca_disparado = True
                _add_issue(issues, "LSD-REG04-BASE9-ARCA", linea=reg["linea"], cuil=reg["cuil"],
                           detalle={
                               "base": "9",
                               "informado": str(base9),
                               "determinado": str(base9_determinada),
                               "diferencia": str(diferencia_base9),
                               "conceptos_excluidos_por_arca": conceptos_excluidos_arca[:10],
                               "legajo": legajo,
                           })
        elif base9 is not None and not tiene_cod_arca:
            # Fallback: sin código ARCA disponible, usamos detección por código interno conocido
            conceptos_infladores = {"0525", "0533", "0534", "0535", "0536", "0537", "0538", "0539", "0577", "0599"}
            suma_erronea = _sumar_conceptos(conceptos, conceptos_infladores)
            if suma_erronea > Decimal("50.00"):  # tolerancia $50 para redondeos
                _add_issue(issues, "LSD-REG04-BASE9-INDEM", linea=reg["linea"], cuil=reg["cuil"],
                           detalle={"base": "9", "informado": str(base9),
                                    "determinado": str(base9 - suma_erronea),
                                    "diferencia": str(suma_erronea), "legajo": legajo})

        concepto_0577  = _sumar_conceptos(conceptos, {"0577"})
        concepto_0448  = _sumar_conceptos(conceptos, {"0448"})
        conceptos_no_rem = _sumar_conceptos(conceptos, {"0525", "0535", "0536", "0537", "0538", "0539"})

        # Tope máximo de detracción
        if importe_detraer is not None and importe_detraer > tope_detraccion:
            _add_issue(issues, "LSD-REG04-DETRACCION-MAX", linea=reg["linea"], cuil=reg["cuil"],
                       detalle={"importe_detraer": str(importe_detraer), "tope_maximo": str(tope_detraccion), "mes": mes_liq})



        # Tope proporcional SAC guillotinado (CORREGIDO)
        # Usa códigos internos de SAC: 0026 (SAC semestral) y 0027 (SAC proporcional)
        CODIGOS_SAC = {"0026", "0027"}
        if base1 is not None and base1 > Decimal("1000000.00"):
            for concepto in conceptos:
                imp_con    = concepto.get("importe", Decimal("0"))
                cant_raw   = concepto.get("cantidad", "0")
                cod_int    = concepto.get("codigo_concepto", "").strip()
                deb_cred   = concepto.get("debito_credito", "C")
                if deb_cred == "C" and cod_int in CODIGOS_SAC:
                    if imp_con > Decimal("100000.00") and cant_raw.isdigit():
                        dias = Decimal(cant_raw) / Decimal("100")
                        if Decimal("0") < dias <= Decimal("15"):
                            _add_issue(issues, "LSD-REG04-TOPE-MOPRE-SAC", linea=reg["linea"], cuil=reg["cuil"],
                                       detalle={"base1_informada": str(base1), "importe_sac": str(imp_con), "dias_informados": str(dias)})
                            break

        # Bases negativas
        for campo in ("base1", "base2", "base3", "base4", "base5", "base6", "base7", "base8",
                      "base9", "dif_aporte_ss", "dif_contr_ss", "base10", "importe_detraer"):
            valor = reg.get(campo)
            if valor is not None and valor < Decimal("0"):
                _add_issue(issues, "LSD-REG04-BASE-NEG-001", linea=reg["linea"], cuil=reg["cuil"],
                           detalle={"campo": campo, "valor": reg.get(f"{campo}_raw", "")})

        # Base 4 cero con Base 10 con valor (Bug C / Guía 45)
        if base4 == 0 and base10 not in (None, 0):
            _add_issue(issues, "LSD-REG04-BASE-001", linea=reg["linea"], cuil=reg["cuil"],
                       detalle={"base4": str(base4), "base10": str(base10)})

        # Base 1 > Rem Bruta
        if rem == 0 and base1 and base1 > 0:
            _add_issue(issues, "LSD-REG04-REM-001", linea=reg["linea"], cuil=reg["cuil"],
                       detalle={"rem_bruta": str(rem), "base1": str(base1), "problema": "rem_bruta_cero_base1_con_valor"})
        elif rem and base1 and base1 > rem:
            _add_issue(issues, "LSD-REG04-REM-001", linea=reg["linea"], cuil=reg["cuil"],
                       detalle={"rem_bruta": str(rem), "base1": str(base1), "problema": "base1_supera_rem_bruta"})

        # Coherencia Base10 = Base2 - Detracción
        if base2 is not None and base10 is not None and importe_detraer is not None and importe_detraer > Decimal("0"):
            base10_esperada = max(base2 - importe_detraer, Decimal("0"))
            if abs(base10 - base10_esperada) > Decimal("0.05"):
                _add_issue(issues, "LSD-REG04-DETRACCION-001", linea=reg["linea"], cuil=reg["cuil"],
                           detalle={"base": "10", "informado": str(base10), "determinado": str(base10_esperada),
                                    "diferencia": str(base10 - base10_esperada),
                                    "base2": str(base2), "importe_detraer": str(importe_detraer)})

        # Rem10 sin detracción (Bug K)
        if importe_detraer is not None and base10 is not None:
            if importe_detraer == Decimal("0") and base10 > Decimal("0"):
                _add_issue(issues, "LSD-REG04-REM10-001", linea=reg["linea"], cuil=reg["cuil"],
                           detalle={"importe_detraer": str(importe_detraer), "rem10": str(base10)})

        # Base 4 ≠ Base 5
        if base4 is not None and base5 is not None and abs(base4 - base5) > Decimal("0.05"):
            _add_issue(issues, "LSD-REG04-BASE4-BASE5-001", linea=reg["linea"], cuil=reg["cuil"],
                       detalle={"base4": str(base4), "base5": str(base5),
                                "diferencia": str(abs(base4 - base5))})

        # Base 9 > Base 2 — solo si BASE9-ARCA no lo detectó ya con más precisión
        if not base9_arca_disparado and base9 is not None and base2 is not None and base9 > base2 + Decimal("0.05"):
            if base9 > (base2 + conceptos_no_rem + Decimal("0.05")):
                _add_issue(issues, "LSD-REG04-BASE9-002", linea=reg["linea"], cuil=reg["cuil"],
                           detalle={"base9": str(base9), "base2": str(base2)})

        # Base 9 = Base 2 con Base 1 < Base 2 (tope inconsistente)
        tolerancia = Decimal("0.01")
        if (base9 is not None and base2 is not None and base1 is not None
                and base9 == base2 and base1 < base2 - tolerancia
                and base4 is not None and abs(base4 - base1) <= tolerancia):
            _add_issue(issues, "LSD-REG04-BASE9-003", linea=reg["linea"], cuil=reg["cuil"],
                       detalle={"base": 9, "informado": str(base9), "determinado": str(base1),
                                "diferencia": str(base9 - base1)})

        # Validar Tope MOPRE Máximo para Bases 1, 4 y 5
        tope_mopre_base = Decimal("3183943.80")
        
        # Como en el TXT no viaja el código de AFIP, detectamos el SAC por los días informados.
        # Si algún concepto tiene una cantidad > 30 (ej: 180 días del semestre), asumimos que es SAC.
        tiene_sac = any(Decimal(c.get("cantidad", "0")) / Decimal("100") > Decimal("30") for c in conceptos)
        
        # El tope sube 50% si es mes de SAC (06 o 12) Y el empleado tiene un concepto semestral
        if mes_liq in ("06", "12") and tiene_sac:
            tope_mopre_max = tope_mopre_base * Decimal("1.5")
        else:
            tope_mopre_max = tope_mopre_base
        
        for num_base, valor_base in [("1", base1), ("4", base4), ("5", base5)]:
            if valor_base is not None and valor_base > tope_mopre_max + Decimal("0.05"):
                _add_issue(issues, "LSD-REG04-TOPE-MAX", linea=reg["linea"], cuil=reg["cuil"],
                           detalle={"base": num_base, "informado": str(valor_base), "tope_legal": str(tope_mopre_max)})

        # Base 2 = 0 con Base 4 > 0
        if base2 is not None and base2 == 0 and base4 is not None and base4 > 0:
            _add_issue(issues, "LSD-REG04-BASE2-001", linea=reg["linea"], cuil=reg["cuil"],
                       detalle={"base2": str(base2), "base4": str(base4)})

        # BASES-CONCEPTOS: solo aplica si BASE9-ARCA no capturó ya el problema (evita duplicados)
        if not base9_arca_disparado:
            # Base 9 inflada por concepto 0577 (ASIG NO REM EXTR en empleados ART)
            if base1 is not None and base9 is not None and concepto_0577 > Decimal("0") and base9 > base1:
                _add_issue(issues, "LSD-REG04-BASES-CONCEPTOS-001", linea=reg["linea"], cuil=reg["cuil"],
                           detalle={"patron": "concepto_0577_con_base9_mayor_a_base1", "legajo": legajo,
                                    "base": 9, "informado": str(base9), "determinado": str(base1),
                                    "diferencia": str(base9 - base1), "concepto_0577": str(concepto_0577)})

            # Base 9 inflada por conceptos indemnizatorios detectados sin código ARCA
            if (base1 is not None and base1 > Decimal("0") and base9 is not None
                    and conceptos_no_rem > Decimal("0") and base9 > (base1 * Decimal("2"))):
                _add_issue(issues, "LSD-REG04-BASES-CONCEPTOS-001", linea=reg["linea"], cuil=reg["cuil"],
                           detalle={"patron": "incrementos_no_remunerativos_inflando_base9", "legajo": legajo,
                                    "base": 9, "informado": str(base9), "determinado": str(base1),
                                    "diferencia": str(base9 - base1)})

            # Base 9 inflada por concepto 0448 (NR presentismo sumado a ART)
            if rem is not None and base9 is not None and concepto_0448 > Decimal("0") and base9 > rem:
                _add_issue(issues, "LSD-REG04-BASES-CONCEPTOS-001", linea=reg["linea"], cuil=reg["cuil"],
                           detalle={"patron": "concepto_0448_sumado_indebidamente_a_base9", "legajo": legajo,
                                    "base": 9, "informado": str(base9), "determinado": str(rem),
                                    "diferencia": str(base9 - rem)})

    # ── REG03 conceptos ARCA ─────────────────────────────────────────────────
    periodo_mes = None
    if len(reg01s) == 1 and re.fullmatch(r'\d{6}', reg01s[0].get("periodo", "") or ""):
        periodo_mes = reg01s[0]["periodo"][4:6]

    for reg in by_type.get("03", []):
        cod = reg.get("codigo_arca", "")
        if cod == "5600000":
            _add_issue(issues, "LSD-REG03-CONCEPTO-001", linea=reg["linea"], cuil=reg["cuil"],
                       detalle={"concepto": cod, "problema": "concepto_5600000_obsoleto_guia45"})
        if periodo_mes and periodo_mes not in ("06", "12") and cod.isdigit():
            cod_int = int(cod)
            if 1200000 <= cod_int <= 1299999 and cod != "1200030":
                _add_issue(issues, "LSD-REG03-SAC-001", linea=reg["linea"], cuil=reg["cuil"],
                           detalle={"concepto": cod, "mes": periodo_mes})

    # ── Evaluador de Reglas Dinámicas (Visual Rule Manager) ──────────────────
    for dyn in REGLAS_DINAMICAS:
        if not dyn.get("activa", True):
            continue

        rule_id = f"DYN-{dyn.get('_id', '000')}"
        
        # Inyectamos la regla al catálogo en memoria para que se dibuje bien en Angular
        if rule_id not in RULE_CATALOG:
            RULE_CATALOG[rule_id] = {
                "severidad": dyn.get("severidad", "ADVERTENCIA"),
                "campo": dyn.get("campo", "Personalizado"),
                "mensaje": dyn.get("mensaje", "Inconsistencia detectada por regla visual."),
                "causa": "Regla de validación dinámica creada por el administrador.",
                "fix_hint": "Revisar los parámetros de la liquidación según la nueva normativa."
            }

        target = dyn.get("registroTarget")
        # Recorremos solo los registros a los que apunta la regla (ej: todos los "03")
        for reg in by_type.get(target, []):
            val = reg.get(dyn.get("campo"))
            op  = dyn.get("operador")
            ref = dyn.get("valor")

            if val is None:
                continue

            match = False
            try:
                # Evaluaciones lógicas
                if op == "==": match = str(val).strip() == str(ref).strip()
                elif op == "!=": match = str(val).strip() != str(ref).strip()
                elif op == ">": match = float(val) > float(ref)
                elif op == "<": match = float(val) < float(ref)
                elif op == "contiene": match = str(ref).lower() in str(val).lower()
            except ValueError:
                pass # Si el usuario comparó letras con ">", ignoramos para que no falle

            if match:
                _add_issue(issues, rule_id, linea=reg["linea"], cuil=reg.get("cuil"), 
                           detalle={"valor_encontrado": str(val), "regla": dyn})

    return issues

# ---------------------------------------------------------------------------
# FUNCIÓN PÚBLICA: ejecutar_validaciones_deterministicas
# ---------------------------------------------------------------------------

def ejecutar_validaciones_deterministicas(ruta: str) -> dict:
    analisis = obtener_analisis_lsd(ruta)
    issues = analisis.get("issues", [])
    criticos = [i for i in issues if i.get("severidad") == "CRITICO"]
    advertencias = [i for i in issues if i.get("severidad") == "ADVERTENCIA"]
    
    analisis["errores_criticos"] = len(criticos)
    analisis["advertencias"] = len(advertencias)
    analisis["catalogo_reglas"] = RULE_CATALOG
    analisis["ok"] = (len(criticos) == 0)
    
    return analisis

def _informe_deterministico(validacion: dict) -> dict:
    agrupados: dict[str, list] = defaultdict(list)
    for issue in validacion.get("issues", []):
        agrupados[issue.get("id", "otro")].append(issue)

    errores_criticos = validacion.get("errores_criticos", 0)
    advertencias     = validacion.get("advertencias", 0)
    veredicto = "SERÁ RECHAZADO" if errores_criticos > 0 else "REVISAR" if advertencias > 0 else "PRESENTABLE"

    total_emp = len(validacion.get("empleados", {}))
    cuils_crit = {i.get("cuil") for i in validacion.get("issues", []) if i.get("severidad") == "CRITICO" and i.get("cuil")}
    cuils_adv  = {i.get("cuil") for i in validacion.get("issues", []) if i.get("severidad") == "ADVERTENCIA" and i.get("cuil")}
    cuils_adv_solo = cuils_adv - cuils_crit

    # ── Formato de moneda ──────────────────────────────────────────────────────
    def _fmt_money(v):
        if v is None or v == "—": return "—"
        try:
            n = float(str(v).replace(",", "."))
            return f"${n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        except Exception:
            return str(v)

    # ── Construcción de filas_tabla por regla ─────────────────────────────────
    ESQUEMAS = {
        "bases": {
            "ids": {
                "LSD-REG04-DETRACCION-001", "LSD-REG04-BASE9-003",
                "LSD-REG04-BASES-CONCEPTOS-001", "LSD-REG04-BASE9-INDEM",
                "LSD-REG04-TOPE-MOPRE-SAC",
            },
            "columnas": ["Línea", "CUIL", "Legajo", "Base", "Informado $", "Correcto $", "Diferencia $"],
            "extractor": lambda item: {
                "Línea":        str(item.get("linea") or "—"),
                "CUIL":         item.get("cuil") or "—",
                "Legajo":       (item.get("detalle") or {}).get("legajo") or "—",
                "Base":         f"Base {(item.get('detalle') or {}).get('base', '—')}",
                "Informado $":  _fmt_money((item.get("detalle") or {}).get("informado")),
                "Correcto $":   _fmt_money((item.get("detalle") or {}).get("determinado")),
                "Diferencia $": _fmt_money((item.get("detalle") or {}).get("diferencia")),
            }
        },
        "detraccion_max": {
            "ids": {"LSD-REG04-DETRACCION-MAX"},
            "columnas": ["Línea", "CUIL", "Importe Detraer $", "Tope Máximo $", "Exceso $"],
            "extractor": lambda item: {
                "Línea":            str(item.get("linea") or "—"),
                "CUIL":             item.get("cuil") or "—",
                "Importe Detraer $":_fmt_money((item.get("detalle") or {}).get("importe_detraer")),
                "Tope Máximo $":    _fmt_money((item.get("detalle") or {}).get("tope_maximo")),
                "Exceso $": _fmt_money(
                    str(float(str((item.get("detalle") or {}).get("importe_detraer") or 0).replace(",", "."))
                        - float(str((item.get("detalle") or {}).get("tope_maximo") or 0).replace(",", ".")))
                    if (item.get("detalle") or {}).get("importe_detraer") and (item.get("detalle") or {}).get("tope_maximo") else None
                ),
            }
        },
        "base4_base5": {
            "ids": {"LSD-REG04-BASE4-BASE5-001"},
            "columnas": ["Línea", "CUIL", "Base 4 (OS) $", "Base 5 (PAMI) $", "Diferencia $"],
            "extractor": lambda item: {
                "Línea":          str(item.get("linea") or "—"),
                "CUIL":           item.get("cuil") or "—",
                "Base 4 (OS) $":  _fmt_money((item.get("detalle") or {}).get("base4")),
                "Base 5 (PAMI) $":_fmt_money((item.get("detalle") or {}).get("base5")),
                "Diferencia $":   _fmt_money((item.get("detalle") or {}).get("diferencia")),
            }
        },
        "base9_base2": {
            "ids": {"LSD-REG04-BASE9-002"},
            "columnas": ["Línea", "CUIL", "Base 9 (LRT) $", "Base 2 (Contr.) $", "Exceso $"],
            "extractor": lambda item: {
                "Línea":              str(item.get("linea") or "—"),
                "CUIL":               item.get("cuil") or "—",
                "Base 9 (LRT) $":     _fmt_money((item.get("detalle") or {}).get("base9")),
                "Base 2 (Contr.) $":  _fmt_money((item.get("detalle") or {}).get("base2")),
                "Exceso $": _fmt_money(
                    str(float(str((item.get("detalle") or {}).get("base9") or 0).replace(",", "."))
                        - float(str((item.get("detalle") or {}).get("base2") or 0).replace(",", ".")))
                    if (item.get("detalle") or {}).get("base9") and (item.get("detalle") or {}).get("base2") else None
                ),
            }
        },
        "rem_base1": {
            "ids": {"LSD-REG04-REM-001"},
            "columnas": ["Línea", "CUIL", "Rem. Bruta $", "Base 1 (SIPA) $", "Problema"],
            "extractor": lambda item: {
                "Línea":          str(item.get("linea") or "—"),
                "CUIL":           item.get("cuil") or "—",
                "Rem. Bruta $":   _fmt_money((item.get("detalle") or {}).get("rem_bruta")),
                "Base 1 (SIPA) $":_fmt_money((item.get("detalle") or {}).get("base1")),
                "Problema":       {
                    "rem_bruta_cero_base1_con_valor": "Rem. Bruta = $0 pero Base 1 tiene valor",
                    "base1_supera_rem_bruta": "Base 1 supera la Rem. Bruta",
                }.get((item.get("detalle") or {}).get("problema", ""), (item.get("detalle") or {}).get("problema", "—")),
            }
        },
        "dup_reg04": {
            "ids": {"LSD-REG04-DUP-001"},
            "columnas": ["CUIL", "Cantidad REG04", "Líneas del archivo"],
            "extractor": lambda item: {
                "CUIL":              item.get("cuil") or "—",
                "Cantidad REG04":    str((item.get("detalle") or {}).get("cantidad_reg04", "—")),
                "Líneas del archivo":str((item.get("detalle") or {}).get("lineas", "—")),
            }
        },
        "cbu": {
            "ids": {"LSD-REG02-CBU-001"},
            "columnas": ["Línea", "CUIL", "Forma de Pago", "CBU informado", "Problema"],
            "extractor": lambda item: {
                "Línea":          str(item.get("linea") or "—"),
                "CUIL":           item.get("cuil") or "—",
                "Forma de Pago":  (item.get("detalle") or {}).get("forma_pago", "—"),
                "CBU informado":  (item.get("detalle") or {}).get("cbu", "—"),
                "Problema":       (item.get("detalle") or {}).get("problema", "Longitud inválida o no numérico"),
            }
        },
        "sac": {
            "ids": {"LSD-REG03-SAC-001"},
            "columnas": ["Línea", "CUIL", "Concepto ARCA", "Mes de la liquidación"],
            "extractor": lambda item: {
                "Línea":                str(item.get("linea") or "—"),
                "CUIL":                 item.get("cuil") or "—",
                "Concepto ARCA":        (item.get("detalle") or {}).get("concepto", "—"),
                "Mes de la liquidación":(item.get("detalle") or {}).get("mes", "—"),
            }
        },
        "longitud": {
            "ids": {"LSD-LENGTH-001"},
            "columnas": ["Línea", "CUIL", "Tipo", "Longitud actual", "Longitud requerida"],
            "extractor": lambda item: {
                "Línea":              str(item.get("linea") or "—"),
                "CUIL":               item.get("cuil") or "—",
                "Tipo":               f"REG{(item.get('detalle') or {}).get('tipo', '?')}",
                "Longitud actual":    str((item.get("detalle") or {}).get("longitud") or (item.get("detalle") or {}).get("minima") or "—"),
                "Longitud requerida": str((item.get("detalle") or {}).get("requerida") or (item.get("detalle") or {}).get("minima") or "—"),
            }
        },
        "formato_num": {
            "ids": {"LSD-NUM-COMMA-001", "LSD-NUM-NEG-001", "LSD-NUM-SCI-001", "LSD-NUM-FORMAT-001"},
            "columnas": ["Línea", "CUIL", "Tipo reg.", "Campo / Posiciones", "Valor problemático"],
            "extractor": lambda item: {
                "Línea":              str(item.get("linea") or "—"),
                "CUIL":               item.get("cuil") or "—",
                "Tipo reg.":          f"REG{(item.get('detalle') or {}).get('tipo', '?')}",
                "Campo / Posiciones": str((item.get("detalle") or {}).get("campo") or (item.get("detalle") or {}).get("posiciones") or "—"),
                "Valor problemático": str((item.get("detalle") or {}).get("valor") or (item.get("detalle") or {}).get("extracto") or "—")[:60],
            }
        },
        "rem10": {
            "ids": {"LSD-REG04-REM10-001"},
            "columnas": ["Línea", "CUIL", "Importe Detraer (raw)", "Base 10 / Rem10 (raw)"],
            "extractor": lambda item: {
                "Línea":                  str(item.get("linea") or "—"),
                "CUIL":                   item.get("cuil") or "—",
                "Importe Detraer (raw)":  (item.get("detalle") or {}).get("importe_detraer", "—"),
                "Base 10 / Rem10 (raw)":  (item.get("detalle") or {}).get("rem10", "—"),
            }
        },
        "base2_base4": {
            "ids": {"LSD-REG04-BASE2-001"},
            "columnas": ["Línea", "CUIL", "Base 2 (Contrib.) $", "Base 4 (OS) $"],
            "extractor": lambda item: {
                "Línea":               str(item.get("linea") or "—"),
                "CUIL":                item.get("cuil") or "—",
                "Base 2 (Contrib.) $": _fmt_money((item.get("detalle") or {}).get("base2")),
                "Base 4 (OS) $":       _fmt_money((item.get("detalle") or {}).get("base4")),
            }
        },
        "base4_base10": {
            "ids": {"LSD-REG04-BASE-001"},
            "columnas": ["Línea", "CUIL", "Base 4 (OS) - raw", "Base 10 (Rem10) - raw"],
            "extractor": lambda item: {
                "Línea":               str(item.get("linea") or "—"),
                "CUIL":                item.get("cuil") or "—",
                "Base 4 (OS) - raw":   (item.get("detalle") or {}).get("base4", "—"),
                "Base 10 (Rem10) - raw":(item.get("detalle") or {}).get("base10", "—"),
            }
        },
        "debito_ajuste": {
            "ids": {"LSD-REG03-DEBITO-AJUSTE"},
            "columnas": ["Línea", "CUIL", "Concepto Interno", "Importe Restado (D) $"],
            "extractor": lambda item: {
                "Línea": str(item.get("linea") or "—"),
                "CUIL": item.get("cuil") or "—",
                "Concepto Interno": (item.get("detalle") or {}).get("concepto", "—"),
                "Importe Restado (D) $": _fmt_money((item.get("detalle") or {}).get("importe")),
            }
        },
    }

    _rule_esquema: dict[str, dict] = {}
    for esq in ESQUEMAS.values():
        for rid in esq["ids"]:
            _rule_esquema[rid] = esq

    problemas = []
    for rule_id, items in agrupados.items():
        cuils = sorted({i.get("cuil") for i in items if i.get("cuil")})
        first = items[0]
        regla = RULE_CATALOG.get(rule_id, {})
        esq   = _rule_esquema.get(rule_id)

        if esq:
            columnas_tabla = esq["columnas"]
            filas_tabla    = []
            for item in items:
                try:
                    fila = esq["extractor"](item)
                    filas_tabla.append(fila)
                except Exception:
                    filas_tabla.append({"CUIL": item.get("cuil") or "—", "Error": "sin detalle"})
        else:
            columnas_tabla = ["Línea", "CUIL", "Detalle"]
            filas_tabla = [
                {
                    "Línea":   str(i.get("linea") or "—"),
                    "CUIL":    i.get("cuil") or "—",
                    "Detalle": json.dumps(i.get("detalle") or {}, ensure_ascii=False)[:120],
                }
                for i in items
            ]

        mensaje  = regla.get("mensaje") or first.get("mensaje", "")
        fix_hint = regla.get("fix_hint") or first.get("fix_hint", "")
        fuente   = regla.get("fuente_pdf", "")
        tutorial = [
            {"paso": 1, "titulo": "Revisar el origen",    "instruccion": mensaje or "Revisá el dato indicado.", "referencia": fuente},
            {"paso": 2, "titulo": "Corregir en e-Sueldos","instruccion": fix_hint or "Corregí el dato en e-Sueldos.", "referencia": fuente},
            {"paso": 3, "titulo": "Recalcular",            "instruccion": "Recalculá la liquidación o el Libro Sueldo Digital desde e-Sueldos.", "referencia": fuente},
            {"paso": 4, "titulo": "Validar nuevamente",    "instruccion": "Volvé a exportar el LSD y validalo de nuevo con el Agente.", "referencia": fuente},
        ]

        problemas.append({
            "id":                    rule_id,
            "severidad":             regla.get("severidad") or first.get("severidad", "INFO"),
            "titulo":                mensaje,
            "descripcion":           mensaje,
            "cuils_afectados":       len(cuils),
            "todos_los_cuils_afectados": cuils,
            "ejemplos_cuil":         cuils[:5],
            "causa":                 regla.get("causa") or "El sistema detectó una inconsistencia según los parámetros de AFIP.",
            "solucion":              fix_hint,
            "tutorial_pasos":        tutorial,
            "diagnostico_cruce":     "",
            "columnas_tabla":        columnas_tabla,
            "filas_tabla":           filas_tabla,
            "detalles":              items,
            "detalle_tecnico": {
                "regla_id":         rule_id,
                "severidad":        first.get("severidad"),
                "campo":            regla.get("campo") or first.get("campo"),
                "fuente_pdf":       regla.get("fuente_pdf") or first.get("fuente_pdf"),
                "total_evidencias": len(items),
                "evidencias":    items[:30],
            },
        })

    if veredicto == "PRESENTABLE":
        resumen = "El archivo respeta todas las reglas determinísticas del layout LSD validadas por el agente."
        veredicto_razon = f"Los {total_emp} empleados del archivo pasaron las validaciones determinísticas."
    elif veredicto == "REVISAR":
        resumen = "El archivo no tiene errores críticos determinísticos, pero conviene revisar las advertencias antes de presentar."
        veredicto_razon = f"{len(cuils_adv_solo)} empleado(s) con advertencia · {len([p for p in problemas if p['severidad']=='ADVERTENCIA'])} tipo(s) de problema."
    else:
        tipos_crit = len([p for p in problemas if p.get("severidad") == "CRITICO"])
        resumen = (
            f"Se detectaron inconsistencias en {tipos_crit} tipo(s) de regla. "
            "Corregilas en e-Sueldos y regenerá el LSD antes de presentar a ARCA."
        )
        veredicto_razon = (
            f"{len(cuils_crit)} de {total_emp} empleados con error crítico · "
            f"{tipos_crit} tipo(s) de problema · {errores_criticos} detecciones"
        )

    return {
        "resumen":          resumen,
        "veredicto":        veredicto,
        "veredicto_razon":  veredicto_razon,
        "modo_analisis":    "motor_deterministico_completo",
        "estadisticas": {
            "total_empleados":               total_emp,
            "total_conceptos":               validacion.get("registros_por_tipo", {}).get("03", 0),
            "empleados_afectados_critico":   len(cuils_crit),
            "empleados_afectados_advertencia": len(cuils_adv_solo),
            "empleados_validados":           max(total_emp - len(cuils_crit | cuils_adv_solo), 0),
            "errores_criticos":              errores_criticos,
            "advertencias":                  advertencias,
        },
        "errores_arca": {"presente": False, "total": 0, "resumen": ""},
        "problemas":    problemas,
        # Campo extra para el chat contextual
        "validacion_deterministica": validacion,
    }

# ---------------------------------------------------------------------------
# PROTOCOLO DE COMUNICACIÓN CON NODE.JS (stdout JSON)
# ---------------------------------------------------------------------------

def emitir(tipo: str, **kwargs):
    """Emite un evento JSON por stdout. El pythonBridge.js lo parsea línea a línea."""
    print(json.dumps({"tipo": tipo, **kwargs}, ensure_ascii=False, default=str), flush=True)

# ---------------------------------------------------------------------------
# PUNTO DE ENTRADA PRINCIPAL
# ---------------------------------------------------------------------------

def ejecutar_analisis_completo(ruta_txt: str, modo: str = "auto"):
    emitir("herramienta", nombre="validacion_deterministica",
           label="Ejecutando motor de validación determinística...")

    try:
        deterministico = ejecutar_validaciones_deterministicas(ruta_txt)
    except FileNotFoundError:
        emitir("error", mensaje=f"Archivo no encontrado: {ruta_txt}")
        return
    except Exception as e:
        emitir("error", mensaje=f"Error al validar el archivo: {e}")
        return

    emitir("validacion_ok",
           errores_criticos=deterministico.get("errores_criticos", 0),
           advertencias=deterministico.get("advertencias", 0),
           total_empleados=len(deterministico.get("empleados", {})),
           registros_por_tipo=deterministico.get("registros_por_tipo", {}))

    # Construir informe final
    informe = _informe_deterministico(deterministico)

    emitir("informe_final", informe=informe)


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description="Agente LSD — Motor de validación determinística")
    parser.add_argument("ruta", help="Ruta al archivo TXT de LSD")
    parser.add_argument("--modo", choices=["auto", "rapido", "profundo"], default="auto",
                        help="Modo de análisis (default: auto)")
    args = parser.parse_args()

    ejecutar_analisis_completo(args.ruta, args.modo)