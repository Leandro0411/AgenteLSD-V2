// src/app/core/services/admin.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly API = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ── Usuarios ────────────────────────────────────────────────────────────────
  getUsuarios(): Observable<{ ok: boolean; usuarios: any[] }> {
    return this.http.get<any>(`${this.API}/admin/usuarios`);
  }

  crearUsuario(data: { username: string; password: string; rol: string }): Observable<any> {
    return this.http.post<any>(`${this.API}/admin/usuarios`, data);
  }

  cambiarPassword(username: string, nuevaPassword: string): Observable<any> {
    return this.http.put<any>(`${this.API}/admin/usuarios/${username}/password`, { nuevaPassword });
  }

  eliminarUsuario(username: string): Observable<any> {
    return this.http.delete<any>(`${this.API}/admin/usuarios/${username}`);
  }

  // ── Normativas (PDFs) ───────────────────────────────────────────────────────
  getNormativas(): Observable<{ ok: boolean; pdfs: any[] }> {
    return this.http.get<any>(`${this.API}/admin/normativas`);
  }

  subirNormativa(pdf: File): Observable<any> {
    const form = new FormData();
    form.append('pdf', pdf);
    return this.http.post<any>(`${this.API}/admin/normativas`, form);
  }

  // ── Tickets ─────────────────────────────────────────────────────────────────
  getTickets(): Observable<{ ok: boolean; data: any[] }> {
    return this.http.get<any>(`${this.API}/tickets`);
  }

  cerrarTicket(ticketId: string): Observable<any> {
    return this.http.post<any>(`${this.API}/tickets/${ticketId}/cerrar`, {});
  }

  enviarTicket(data: { archivo: string; tipo: string; estrellas?: number; mensaje?: string }): Observable<any> {
    return this.http.post<any>(`${this.API}/tickets`, data);
  }

  responderTicket(ticketId: string, texto: string, archivo?: File): Observable<any> {
    const form = new FormData();
    form.append('texto', texto);
    if (archivo) form.append('archivo', archivo);
    return this.http.post<any>(`${this.API}/tickets/${ticketId}/responder`, form);
  }

  descargarArchivoOriginal(ticketId: string): Observable<Blob> {
    return this.http.get(`${this.API}/tickets/${ticketId}/archivo-original`, { responseType: 'blob' });
  }

  previewArchivoOriginal(ticketId: string): Observable<{ ok: boolean; nombreArchivo: string; totalLineas: number; truncado: boolean; contenido: string }> {
    return this.http.get<any>(`${this.API}/tickets/${ticketId}/archivo-original/preview`);
  }

  // ── Wiki Reglas (legacy) ───────────────────────────────────────────────
  getReglasWiki(): Observable<{ ok: boolean; reglas: any[] }> {
    return this.http.get<any>(`${this.API}/wiki/reglas`);
  }

  getRegla(ruleId: string): Observable<{ ok: boolean; regla: any }> {
    return this.http.get<any>(`${this.API}/wiki/reglas/${ruleId}`);
  }

  guardarRegla(ruleId: string, data: any): Observable<any> {
    return this.http.post<any>(`${this.API}/wiki/reglas/${ruleId}`, data);
  }

  // ── Historial ───────────────────────────────────────────────────────────────
  getHistorial(): Observable<{ ok: boolean; historial: any[] }> {
    return this.http.get<any>(`${this.API}/admin/historial`);
  }

  getEstadisticas() {
    return this.http.get<any>(`${this.API}/admin/estadisticas`);
  }

  // ── Base de Conocimiento (Reglas) ──────────────────────────────────────────
  getReglas(page = 1, limit = 50): Observable<{ ok: boolean; reglas: any[]; total: number; page: number; pages: number }> {
    return this.http.get<any>(`${this.API}/admin/reglas?page=${page}&limit=${limit}`);
  }

  crearRegla(data: { titulo: string; pregunta: string; respuesta: string; fuente?: string }): Observable<any> {
    return this.http.post<any>(`${this.API}/admin/reglas`, data);
  }

  actualizarRegla(id: string, data: { titulo?: string; pregunta?: string; respuesta?: string; activa?: boolean }): Observable<any> {
    return this.http.put<any>(`${this.API}/admin/reglas/${id}`, data);
  }

  eliminarRegla(id: string): Observable<any> {
    return this.http.delete<any>(`${this.API}/admin/reglas/${id}`);
  }

  // ── Motor Visual de Reglas ──────────────────────────────────────────────────
  getMotorReglas() { return this.http.get<any>(`${this.API}/admin/motor-reglas`); }
  crearMotorRegla(regla: any) { return this.http.post<any>(`${this.API}/admin/motor-reglas`, regla); }
  toggleMotorRegla(id: string, activa: boolean) { return this.http.put<any>(`${this.API}/admin/motor-reglas/${id}/toggle`, { activa }); }
  eliminarMotorRegla(id: string) { return this.http.delete<any>(`${this.API}/admin/motor-reglas/${id}`); }

  // ── Health ─────────────────────────────────────────────────────────────────
  getHealth(): Observable<any> {
    return this.http.get<any>(`${this.API}/admin/health`);
  }
}
