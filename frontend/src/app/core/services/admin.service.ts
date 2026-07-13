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

  // ── Wiki Reglas ─────────────────────────────────────────────────────────────
  getReglas(): Observable<{ ok: boolean; reglas: any[] }> {
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

  // ── Health ──────────────────────────────────────────────────────────────────
  getHealth(): Observable<any> {
    return this.http.get<any>(`${this.API}/admin/health`);
  }
}
