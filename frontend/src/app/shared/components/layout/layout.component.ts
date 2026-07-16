import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { LsdService } from '../../../core/services/lsd.service';

@Component({
  selector: 'app-layout',
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent {
  menuAbierto = false;

  // ── ESTADO DEL CHAT GLOBAL ──
  chatAbierto = false;
  mensajeGlobal = '';
  cargandoGlobal = false;
  
  mensajesGlobales: { role: string; content: string }[] = [
    { role: 'assistant', content: '¡Hola! Soy tu asistente de ARCA. Consultame sobre topes MOPRE, reglas de e-Sueldos o la Ley 27.430.' }
  ];

  // 👇 NUEVO: Chips de sugerencias iniciales
  sugerenciasPrompts: string[] = [
    '📄 Resumime los errores del archivo',
    '❓ ¿Qué significa el error del Concepto 560.000?',
    '✉️ Redactame un mail para RRHH'
  ];

  constructor(public auth: AuthService, private lsd: LsdService) {
    document.addEventListener('cargar-chat-historico', (event: any) => {
      this.mensajesGlobales = event.detail;
      this.sugerenciasPrompts = []; // Limpiamos sugerencias si es historial viejo
      this.chatAbierto = true; 
    });
  }

  toggleMenu(): void {
    this.menuAbierto = !this.menuAbierto;
  }

  logout(): void {
    (this.lsd as any).ultimoInformeCache = null;
    (this.lsd as any).ultimoEstadoCache = 'idle';
    (this.lsd as any).ultimoArchivoCache = '';
    (this.lsd as any).ultimaSessionIdCache = '';
    this.auth.logout();
  }

  // Interceptamos la apertura del chat para hacerlo Predictivo
  toggleChat(): void {
    this.chatAbierto = !this.chatAbierto;

    if (this.chatAbierto) {
      const informe = (this.lsd as any).ultimoInformeCache;
      
      // Si hay un informe con errores críticos y el chat está vacío (solo saludo inicial)...
      if (informe && informe.estadisticas?.errores_criticos > 0 && this.mensajesGlobales.length === 1) {
        
        const errores = informe.estadisticas.errores_criticos;
        const nombre = informe.nombreArchivo || 'actual';
        
        // ¡Mensaje proactivo!
        const msgPredictivo = `¡Uy! Veo que tenés ${errores} error(es) crítico(s) en el archivo "${nombre}". Si los presentás así, ARCA te los va a rechazar. ¿Querés que te explique cómo solucionar el principal?`;
        
        this.mensajesGlobales.push({ role: 'assistant', content: msgPredictivo });

        // Actualizamos los botones rápidos al contexto del error
        this.sugerenciasPrompts = [
          '💡 Sí, explicame cómo solucionarlo',
          '📊 Haceme un resumen de los afectados',
          '✉️ Redactame un mail avisando del rechazo'
        ];
      }
    }
  }

  // Dispara el mensaje al hacer clic en un "chip"
  usarSugerencia(texto: string): void {
    this.mensajeGlobal = texto;
    this.sugerenciasPrompts = []; // Ocultamos los botones una vez usados
    this.enviarMensajeGlobal();
  }

  // ── FUNCIÓN PARA ENVIAR EL CHAT ──
  enviarMensajeGlobal(): void {
    if (!this.mensajeGlobal.trim() || this.cargandoGlobal) return;
    
    const texto = this.mensajeGlobal.trim();
    this.mensajesGlobales.push({ role: 'user', content: texto });
    this.mensajeGlobal = '';
    this.cargandoGlobal = true;
    this.sugerenciasPrompts = []; // Ocultar chips tras enviar algo

    const sessionId = (this.lsd as any).ultimaSessionIdCache || '';
    const informe = (this.lsd as any).ultimoInformeCache || null;
    const archivo = (this.lsd as any).ultimoArchivoCache || '';

    this.lsd.chat(this.mensajesGlobales, sessionId, informe, archivo).subscribe({
      next: (res) => {
        this.mensajesGlobales.push({ role: 'assistant', content: res.respuesta });
        this.cargandoGlobal = false;
      },
      error: () => {
        this.mensajesGlobales.push({ role: 'assistant', content: 'Error de conexión con Gemini.' });
        this.cargandoGlobal = false;
      }
    });
  }
}