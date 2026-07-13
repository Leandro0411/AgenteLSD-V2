// src/app/features/admin/admin.component.ts
import { Component, OnInit } from '@angular/core';
import { AdminService } from '../../core/services/admin.service';

type AdminTab = 'usuarios' | 'tickets' | 'normativas' | 'historial';

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

  constructor(private admin: AdminService) {}

  ngOnInit(): void {
    this.cargarUsuarios();
  }

  // ── Tabs ────────────────────────────────────────────────────────────────────
  cambiarTab(tab: AdminTab): void {
    this.tabActiva = tab;
    if (tab === 'tickets'    && !this.tickets.length)    this.cargarTickets();
    if (tab === 'normativas' && !this.normativas.length) this.cargarNormativas();
    if (tab === 'historial'  && !this.historial.length)  this.cargarHistorial();
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
}
