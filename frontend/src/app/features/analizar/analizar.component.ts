// src/app/features/analizar/analizar.component.ts
import { Component, OnDestroy, OnInit, NgZone } from '@angular/core';
import { DomSanitizer, SafeStyle }  from '@angular/platform-browser';
import { Subscription }             from 'rxjs';
import { LsdService, EventoSSE }    from '../../core/services/lsd.service';
import { AuthService }              from '../../core/services/auth.service';
import { AdminService }             from '../../core/services/admin.service';

type EstadoApp = 'idle' | 'uploading' | 'streaming' | 'completado' | 'error';

@Component({
  selector: 'app-analizar',
  templateUrl: './analizar.component.html',
  styleUrls: ['./analizar.component.scss'],
})
export class AnalizarComponent implements OnInit, OnDestroy {
  // ── Estado general ──────────────────────────────────────────────────────────
  estado: EstadoApp = 'idle';
  errorMsg = '';

  // ── Upload ──────────────────────────────────────────────────────────────────
  readonly modo = 'profundo' as const;
  archivoSeleccionado: File | null = null;
  conceptosSeleccionado: File | null = null;
  dragOver = false;

  // ── Análisis en curso ───────────────────────────────────────────────────────
  sessionId     = '';
  nombreArchivo = '';
  pasos: { label: string; completado: boolean }[] = [];
  pasoActual    = '';
  progreso      = 0;

  // ── Resultado ───────────────────────────────────────────────────────────────
  informe: any = null;

  // ── Panel activo en resultado ───────────────────────────────────────────────
  tabActiva: 'resumen' | 'problemas' | 'configuracion' | 'chat' = 'resumen';
  problemaExpandido: string | null = null;

  // ── Chat ────────────────────────────────────────────────────────────────────
  mensajesChat: { role: string; content: string }[] = [];
  mensajeChat  = '';
  chatCargando = false;

  // ── Wiki editor ─────────────────────────────────────────────────────────────
  editorAbierto   = false;
  reglaEditando: any = null;

  private _sub: Subscription | null = null;

  constructor(
    public  auth:      AuthService,
    private lsd:       LsdService,
    private admin:     AdminService,
    private zone:      NgZone,
    private sanitizer: DomSanitizer
  ) {}

  // ── Dona de distribución de empleados ──────────────────────────────────────
  get donutGradient(): SafeStyle {
    const stats = this.informe?.estadisticas;
    if (!stats || !stats.total_empleados) {
      return this.sanitizer.bypassSecurityTrustStyle('conic-gradient(#E2E8F0 0% 100%)');
    }
    const total  = stats.total_empleados;
    const pctOk  = Math.round((stats.empleados_validados           / total) * 100);
    const pctAdv = Math.round((stats.empleados_afectados_advertencia / total) * 100);
    const pctCrit = 100 - pctOk - pctAdv;
    const p1 = pctOk;
    const p2 = pctOk + pctAdv;
    const style = `conic-gradient(#10B981 0% ${p1}%, #F59E0B ${p1}% ${p2}%, #EF4444 ${p2}% 100%)`;
    return this.sanitizer.bypassSecurityTrustStyle(style);
  }

  ngOnInit(): void {
    if ((this.lsd as any).ultimoInformeCache) {
      this.informe = (this.lsd as any).ultimoInformeCache;
      this.estado = (this.lsd as any).ultimoEstadoCache;
      this.nombreArchivo = (this.lsd as any).ultimoArchivoCache;
      this.sessionId = (this.lsd as any).ultimaSessionIdCache || '';
      this.progreso = 100;
    }
  }

  ngOnDestroy(): void { this._sub?.unsubscribe(); }

  // ── Drag & Drop ─────────────────────────────────────────────────────────────
  onDragOver(e: DragEvent): void  { e.preventDefault(); this.dragOver = true;  }
  onDragLeave(): void             { this.dragOver = false; }
  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file) this._seleccionarArchivo(file);
  }
  onFileInput(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) this._seleccionarArchivo(file);
  }
  onConceptosInput(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.txt')) {
      this.errorMsg = 'El archivo de conceptos también debe ser .txt';
      return;
    }
    this.conceptosSeleccionado = file;
    this.errorMsg = '';
  }
  quitarConceptos(e: Event): void {
    e.stopPropagation();
    this.conceptosSeleccionado = null;
  }
  private _seleccionarArchivo(file: File): void {
    if (!file.name.toLowerCase().endsWith('.txt')) {
      this.errorMsg = 'Solo se aceptan archivos .txt';
      return;
    }
    this.archivoSeleccionado = file;
    this.errorMsg = '';
  }

  // ── Iniciar análisis ────────────────────────────────────────────────────────
  iniciarAnalisis(): void {
    if (!this.archivoSeleccionado) return;
    this.estado  = 'uploading';
    this.pasos   = [];
    this.informe = null;
    this.errorMsg = '';

    this.lsd.uploadArchivo(this.archivoSeleccionado, this.modo, this.conceptosSeleccionado).subscribe({
      next: (res) => {
        this.sessionId     = res.sessionId;
        this.nombreArchivo = res.archivo;
        this.estado        = 'streaming';
        this._iniciarStream();
      },
      error: (err) => {
        this.estado   = 'error';
        this.errorMsg = err.error?.error || 'Error al subir el archivo.';
      },
    });
  }

  private _iniciarStream(): void {
    const token = this.auth.token!;
    this._sub = this.lsd.streamAnalisis(this.sessionId, token).subscribe({
      next:     (evento) => this._procesarEvento(evento),
      error:    () => { this.estado = 'error'; this.errorMsg = 'Error en la conexión SSE.'; },
      complete: () => { if (this.estado !== 'completado') this.estado = 'completado'; },
    });
  }

  private _procesarEvento(evento: EventoSSE): void {
    this.zone.run(() => {
      switch (evento.tipo) {
        case 'herramienta':
          this.pasoActual = evento.label || evento.nombre || '';
          this.pasos.push({ label: this.pasoActual, completado: false });
          this.progreso = Math.min(this.progreso + 8, 90);
          break;
        case 'aviso':
          this.pasoActual = evento.mensaje || 'Reintentando...';
          break;
        case 'validacion_ok':
          if (this.pasos.length) this.pasos[this.pasos.length - 1].completado = true;
          break;
        case 'informe_final':
          this.informe  = evento.informe;
          this.progreso = 100;
          this.estado   = 'completado';
          this.tabActiva = 'resumen';
          if (this.pasos.length) this.pasos[this.pasos.length - 1].completado = true;

          // 👇 LÓGICA NUEVA DE CACHÉ AL TERMINAR 👇
          (this.lsd as any).ultimoInformeCache = this.informe;
          (this.lsd as any).ultimoEstadoCache = this.estado;
          (this.lsd as any).ultimoArchivoCache = this.nombreArchivo;
          (this.lsd as any).ultimaSessionIdCache = this.sessionId;
          break;
        case 'error':
          this.estado   = 'error';
          this.errorMsg = evento.mensaje || 'Error desconocido en el análisis.';
          break;
      }
    });
  }

  // ── Reiniciar ───────────────────────────────────────────────────────────────
  reiniciar(): void {
    this.estado              = 'idle';
    this.archivoSeleccionado = null;
    this.conceptosSeleccionado = null;
    this.informe             = null;
    this.pasos               = [];
    this.progreso            = 0;
    this.sessionId           = '';
    this.errorMsg            = '';
    this.mensajesChat        = [];
    this._sub?.unsubscribe();
    this.estrellasRating = 0;
    this.comentarioRating = '';
    this.ratingEnviado = false;
    this.mostrarFormTicket = false;
    this.mensajeTicket = '';
    this.ticketEnviado = false;
    this.hoverEstrellasRating = 0;
    
    // 👇 BORRAMOS CACHÉ SI EL USUARIO TOCA "NUEVO ARCHIVO" 👇
    (this.lsd as any).ultimoInformeCache = null;
    (this.lsd as any).ultimoEstadoCache = 'idle';
    (this.lsd as any).ultimoArchivoCache = '';
    (this.lsd as any).ultimaSessionIdCache = '';
  }

  // ── Helpers informe ─────────────────────────────────────────────────────────
  get problemasCriticos(): any[] {
    return (this.informe?.problemas || []).filter((p: any) => p.severidad === 'CRITICO');
  }
  get problemasAdvertencia(): any[] {
    return (this.informe?.problemas || []).filter((p: any) => p.severidad === 'ADVERTENCIA');
  }
  get problemasConfiguracion(): any[] {
    return (this.informe?.problemas || []).filter((p: any) =>
      p.id?.startsWith('LSD-CONFIG-') || p.causas_probables?.length
    );
  }
  get problemasOperativos(): any[] {
    return (this.informe?.problemas || []).filter((p: any) =>
      !p.id?.startsWith('LSD-CONFIG-')
    );
  }
  get estadoConfiguracion(): 'ok' | 'warning' | 'missing' {
    const cfg = this.informe?.config_conceptos;
    if (!cfg?.presente) return 'missing';
    return cfg.conceptos_faltantes || cfg.duplicados ? 'warning' : 'ok';
  }
  get textoEstadoConfiguracion(): string {
    const cfg = this.informe?.config_conceptos;
    if (!cfg?.presente) return 'No cargado';
    if (cfg.conceptos_faltantes || cfg.duplicados) return 'Revisar';
    return 'OK';
  }
  get conceptosProblematicos(): any[] {
    return this.informe?.diagnostico_configuracion?.conceptos_problematicos || [];
  }
  toggleProblema(id: string): void {
    this.problemaExpandido = this.problemaExpandido === id ? null : id;
  }

  // ── Chat ────────────────────────────────────────────────────────────────────
  enviarChat(): void {
    if (!this.mensajeChat.trim() || this.chatCargando) return;
    const texto = this.mensajeChat.trim();
    this.mensajesChat.push({ role: 'user', content: texto });
    this.mensajeChat  = '';
    this.chatCargando = true;

    this.lsd.chat(this.mensajesChat, this.sessionId, this.informe, this.nombreArchivo).subscribe({
      next: (res) => {
        this.mensajesChat.push({ role: 'assistant', content: res.respuesta });
        this.chatCargando = false;
      },
      error: () => {
        this.mensajesChat.push({ role: 'assistant', content: 'Error al consultar al asistente.' });
        this.chatCargando = false;
      },
    });
  }

  // ── Métricas del Dashboard (CSS-only) ───────────────────────────────────────
  get maxCuilsAfectados(): number {
    if (!this.informe?.problemas?.length) return 1;
    // Buscamos el problema que afecte a más CUILs para usarlo como 100% en las barras relativas
    return Math.max(...this.informe.problemas.map((p: any) => p.cuils_afectados || 0));
  }

  calcularPorcentajeProblema(afectados: number): number {
    const total = this.informe?.estadisticas?.total_empleados || 1;
    // Si un problema afecta a más empleados que el total (por error de datos), lo topeamos en 100
    const pct = (afectados / total) * 100;
    return pct > 100 ? 100 : pct;
  }

  // ── Feedback (Estrellas) ────────────────────────────────────────────────────
  estrellasRating = 0;
  hoverEstrellasRating = 0;
  comentarioRating = '';
  ratingEnviado = false;
  ratingEnviando = false;

  // ── Ticket de Soporte ───────────────────────────────────────────────────────
  mostrarFormTicket = false;
  mensajeTicket = '';
  ticketEnviado = false;
  ticketEnviando = false;

  // ── Wiki Editor ─────────────────────────────────────────────────────────────
  abrirEditor(problema: any): void {
    this.reglaEditando = { ...problema };
    this.editorAbierto = true;
  }
  cerrarEditor(): void { this.editorAbierto = false; this.reglaEditando = null; }

  guardarRegla(): void {
    if (!this.reglaEditando) return;
    this.admin.guardarRegla(this.reglaEditando.id, {
      causa:          this.reglaEditando.causa,
      solucion:       this.reglaEditando.solucion,
      tutorial_pasos: this.reglaEditando.tutorial_pasos,
      videoUrl:       this.reglaEditando.videoUrl,
    }).subscribe({
      next: () => {
        const idx = this.informe?.problemas?.findIndex((p: any) => p.id === this.reglaEditando.id);
        if (idx !== undefined && idx >= 0) {
          this.informe.problemas[idx] = { ...this.informe.problemas[idx], ...this.reglaEditando };
        }
        this.cerrarEditor();
      },
      error: (err) => alert('Error guardando: ' + (err.error?.error || err.message)),
    });
  }

  // Función 1: Enviar Calificación rápida
  enviarRating(): void {
    if (!this.estrellasRating) return; 
    
    this.ratingEnviando = true;
    this.lsd.enviarFeedbackOTicket(this.nombreArchivo, 'rating', this.comentarioRating, this.estrellasRating, this.sessionId)
      .subscribe({
        next: () => {
          this.ratingEnviado = true;
          this.ratingEnviando = false;
        },
        error: (err) => {
          alert('Error al enviar calificación: ' + (err.error?.error || err.message));
          this.ratingEnviando = false;
        }
      });
  }

  // Función 2: Enviar Ticket formal de Soporte
  enviarTicketSoporte(): void {
    if (!this.mensajeTicket.trim()) return;
    
    this.ticketEnviando = true;
    this.lsd.enviarFeedbackOTicket(this.nombreArchivo, 'ticket', this.mensajeTicket, 0, this.sessionId)
      .subscribe({
        next: () => {
          this.ticketEnviado = true;
          this.ticketEnviando = false;
        },
        error: (err) => {
          alert('Error al abrir ticket: ' + (err.error?.error || err.message));
          this.ticketEnviando = false;
        }
      });
  }

}
