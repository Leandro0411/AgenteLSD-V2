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

  constructor(public auth: AuthService, private lsd: LsdService) {}

  toggleMenu(): void {
    this.menuAbierto = !this.menuAbierto;
  }

  logout(): void {
    this.auth.logout();
  }

  // ── FUNCIÓN PARA ENVIAR EL CHAT ──
  enviarMensajeGlobal(): void {
    if (!this.mensajeGlobal.trim() || this.cargandoGlobal) return;
    
    const texto = this.mensajeGlobal.trim();
    this.mensajesGlobales.push({ role: 'user', content: texto });
    this.mensajeGlobal = '';
    this.cargandoGlobal = true;

    // Leemos la memoria caché del servicio LsdService
    const sessionId = (this.lsd as any).ultimaSessionIdCache || '';
    const informe = (this.lsd as any).ultimoInformeCache || null;
    const archivo = (this.lsd as any).ultimoArchivoCache || '';

    // Le pasamos los 4 parámetros al backend
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