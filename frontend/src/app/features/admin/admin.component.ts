// src/app/features/admin/admin.component.ts
import { Component, OnInit } from '@angular/core';
import { AdminService } from '../../core/services/admin.service';

type AdminTab = 'usuarios' | 'tickets' | 'normativas' | 'historial' | 'conocimiento';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
})
export class AdminComponent implements OnInit {
  tabActiva: AdminTab = 'usuarios';

  // ── Usuarios ────────────────────────────────────────────────────────────────
  usuarios: any[]   = [];
  nuevoUsuario      = { username: '', password: '', rol: 'usuario' };
  usuarioCargando   = false;
  usuarioError      = '';
  usuarioOk         = '';

  // ── Tickets ─────────────────────────────────────────────────────────────────
  tickets: any[]    = [];
  ticketsCargando   = false;

  subTabTickets: 'soporte' | 'ratings' = 'soporte';

  // ── Respuestas a Tickets ──────────────────────────────────────────────────
  textoRespuesta: { [id: string]: string } = {};
  archivoRespuesta: { [id: string]: File | null } = {};
  respondiendoTicket: { [id: string]: boolean } = {};

  onArchivoRespuestaChange(e: Event, ticketId: string): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    this.archivoRespuesta[ticketId] = file || null;
  }

  enviarRespuesta(ticketId: string): void {
    const texto = this.textoRespuesta[ticketId];
    if (!texto) return;

    this.respondiendoTicket[ticketId] = true;
    const archivo = this.archivoRespuesta[ticketId] || undefined;

    this.admin.responderTicket(ticketId, texto, archivo).subscribe({
      next: () => {
        this.textoRespuesta[ticketId] = '';
        this.archivoRespuesta[ticketId] = null;
        this.respondiendoTicket[ticketId] = false;
        this.cargarTickets(); // Recargar para ver la respuesta
      },
      error: (err) => {
        alert('Error enviando respuesta: ' + (err.error?.error || err.message));
        this.respondiendoTicket[ticketId] = false;
      }
    });
  }

  descargarOriginal(ticket: any): void {
    this.admin.descargarArchivoOriginal(ticket.ticketId).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = ticket.archivo || 'original.txt';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => alert('El archivo original ya no se encuentra en el servidor.')
    });
  }

  get ticketsDeSoporte() {
    return this.tickets.filter(t => t.tipo === 'ticket');
  }

  get ticketsDeRating() {
    return this.tickets.filter(t => t.tipo === 'rating');
  }

  // ── Normativas ───────────────────────────────────────────────────────────────
  normativas: any[] = [];
  pdfSeleccionado: File | null = null;
  normativaCargando = false;
  normativaMsg      = '';
  dragOverNormativa = false;

  // ── Historial ────────────────────────────────────────────────────────────────
  historial: any[]  = [];

  // ── Base de Conocimiento (Reglas) ────────────────────────────────────────────
  reglas: any[]        = [];
  reglasCargando       = false;
  reglasTotal          = 0;
  reglasPagina         = 1;
  reglasPages          = 1;
  reglaEditando: any   = null;
  reglaEditandoCopia: any = null;
  mostrarFormNuevaRegla = false;
  nuevaRegla = { titulo: '', pregunta: '', respuesta: '', fuente: 'Manual' };
  reglaMsg   = '';

  constructor(private admin: AdminService) {}

  ngOnInit(): void {
    this.cargarUsuarios();
  }

  // ── Tabs ────────────────────────────────────────────────────────────────────
  cambiarTab(tab: AdminTab): void {
    this.tabActiva = tab;
    if (tab === 'tickets'      && !this.tickets.length)    this.cargarTickets();
    if (tab === 'normativas'   && !this.normativas.length) this.cargarNormativas();
    if (tab === 'historial'    && !this.historial.length)  this.cargarHistorial();
    if (tab === 'conocimiento' && !this.reglas.length)     this.cargarReglas();
  }

  // ── Usuarios ────────────────────────────────────────────────────────────────
  cargarUsuarios(): void {
    this.admin.getUsuarios().subscribe({ next: (r) => (this.usuarios = r.usuarios || []) });
  }

  crearUsuario(): void {
    if (!this.nuevoUsuario.username || !this.nuevoUsuario.password) return;
    this.usuarioCargando = true;
    this.usuarioError    = '';
    this.usuarioOk       = '';

    this.admin.crearUsuario(this.nuevoUsuario).subscribe({
      next: (r) => {
        this.usuarioOk       = r.mensaje;
        this.usuarioCargando = false;
        this.nuevoUsuario    = { username: '', password: '', rol: 'usuario' };
        this.cargarUsuarios();
      },
      error: (err) => {
        this.usuarioError    = err.error?.error || 'Error creando usuario.';
        this.usuarioCargando = false;
      },
    });
  }

  eliminarUsuario(username: string): void {
    if (!confirm(`¿Eliminar al usuario "${username}"?`)) return;
    this.admin.eliminarUsuario(username).subscribe({ next: () => this.cargarUsuarios() });
  }

  // ── Tickets ─────────────────────────────────────────────────────────────────
  cargarTickets(): void {
    this.ticketsCargando = true;
    this.admin.getTickets().subscribe({
      next: (r) => { this.tickets = r.data || []; this.ticketsCargando = false; },
      error: () => { this.ticketsCargando = false; },
    });
  }

  cerrarTicket(ticketId: string): void {
    this.admin.cerrarTicket(ticketId).subscribe({ next: () => this.cargarTickets() });
  }

  // ── Normativas ───────────────────────────────────────────────────────────────
  cargarNormativas(): void {
    this.admin.getNormativas().subscribe({ next: (r) => (this.normativas = r.pdfs || []) });
  }

  // ── Drag & Drop Normativas ──────────────────────────────────────────────────
  onDragOverNormativa(e: DragEvent): void { 
    e.preventDefault(); 
    this.dragOverNormativa = true;  
  }
  
  onDragLeaveNormativa(): void { 
    this.dragOverNormativa = false; 
  }
  
  onDropNormativa(e: DragEvent): void {
    e.preventDefault();
    this.dragOverNormativa = false;
    const file = e.dataTransfer?.files[0];
    if (file) this._seleccionarPdf(file);
  }

  onPdfInput(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) this._seleccionarPdf(file);
  }

  private _seleccionarPdf(file: File): void {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      this.normativaMsg = 'Error: Solo se aceptan archivos .pdf';
      return;
    }
    this.pdfSeleccionado = file;
    this.normativaMsg = '';
  }

  subirNormativa(): void {
    if (!this.pdfSeleccionado) return;
    this.normativaCargando = true;
    this.normativaMsg      = '';
    this.admin.subirNormativa(this.pdfSeleccionado).subscribe({
      next: (r) => {
        this.normativaMsg      = r.mensaje;
        this.normativaCargando = false;
        this.pdfSeleccionado   = null;
        this.cargarNormativas();
      },
      error: (err) => {
        this.normativaMsg      = err.error?.error || 'Error subiendo el PDF.';
        this.normativaCargando = false;
      },
    });
  }

  // ── Historial ────────────────────────────────────────────────────────────────
  cargarHistorial(): void {
    this.admin.getHistorial().subscribe({ next: (r) => (this.historial = r.historial || []) });
  }

  // ── Base de Conocimiento (Reglas) ──────────────────────────────────────────
  cargarReglas(pagina = 1): void {
    this.reglasCargando = true;
    this.reglaMsg = '';
    this.admin.getReglas(pagina).subscribe({
      next: (r) => {
        this.reglas       = r.reglas   || [];
        this.reglasTotal  = r.total    || 0;
        this.reglasPagina = r.page     || 1;
        this.reglasPages  = r.pages    || 1;
        this.reglasCargando = false;
      },
      error: () => { this.reglasCargando = false; },
    });
  }

  editarRegla(regla: any): void {
    this.reglaEditando     = regla;
    this.reglaEditandoCopia = { ...regla }; // backup para cancelar
  }

  cancelarEdicion(): void {
    if (this.reglaEditando && this.reglaEditandoCopia) {
      // Restaurar valores originales
      Object.assign(this.reglaEditando, this.reglaEditandoCopia);
    }
    this.reglaEditando     = null;
    this.reglaEditandoCopia = null;
  }

  guardarEdicionRegla(): void {
    if (!this.reglaEditando) return;
    this.admin.actualizarRegla(this.reglaEditando._id, {
      titulo:    this.reglaEditando.titulo,
      pregunta:  this.reglaEditando.pregunta,
      respuesta: this.reglaEditando.respuesta,
    }).subscribe({
      next: () => {
        this.reglaMsg = '✅ Regla guardada.';
        this.reglaEditando     = null;
        this.reglaEditandoCopia = null;
        setTimeout(() => this.reglaMsg = '', 3000);
      },
      error: (err) => { this.reglaMsg = '❌ ' + (err.error?.error || 'Error guardando.'); },
    });
  }

  toggleActiva(regla: any): void {
    this.admin.actualizarRegla(regla._id, { activa: !regla.activa }).subscribe({
      next: (r) => { regla.activa = r.regla.activa; },
    });
  }

  eliminarRegla(regla: any): void {
    if (!confirm(`¿Eliminar la regla "${regla.titulo}"? Esta acción no se puede deshacer.`)) return;
    this.admin.eliminarRegla(regla._id).subscribe({
      next: () => { this.reglas = this.reglas.filter(r => r._id !== regla._id); this.reglasTotal--; },
      error: (err) => { this.reglaMsg = '❌ ' + (err.error?.error || 'Error eliminando.'); },
    });
  }

  crearReglaManual(): void {
    const { titulo, pregunta, respuesta } = this.nuevaRegla;
    if (!titulo.trim() || !pregunta.trim() || !respuesta.trim()) return;
    this.admin.crearRegla(this.nuevaRegla).subscribe({
      next: (r) => {
        this.reglas.unshift(r.regla);
        this.reglasTotal++;
        this.nuevaRegla = { titulo: '', pregunta: '', respuesta: '', fuente: 'Manual' };
        this.mostrarFormNuevaRegla = false;
        this.reglaMsg = '✅ Regla creada.';
        setTimeout(() => this.reglaMsg = '', 3000);
      },
      error: (err) => { this.reglaMsg = '❌ ' + (err.error?.error || 'Error creando.'); },
    });
  }
}
