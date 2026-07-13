// src/app/core/services/lsd.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface EventoSSE {
  tipo: 'herramienta' | 'validacion_ok' | 'informe_final' | 'error' | 'fin' | 'aviso';
  nombre?:  string;
  label?:   string;
  informe?: any;
  mensaje?: string;
  sessionId?: string;
  errores_criticos?: number;
  advertencias?: number;
}

@Injectable({ providedIn: 'root' })
export class LsdService {
  private readonly API = environment.apiUrl;
  public ultimoInformeCache: any = null;
  public ultimoEstadoCache: string = 'idle';
  public ultimoArchivoCache: string = '';

  constructor(private http: HttpClient) {}

  // ── Upload del TXT ──────────────────────────────────────────────────────────
  uploadArchivo(archivo: File, modo: 'auto' | 'rapido' | 'profundo' = 'auto'): Observable<{ ok: boolean; sessionId: string; archivo: string }> {
    const form = new FormData();
    form.append('archivo', archivo);
    form.append('modo', modo);
    return this.http.post<any>(`${this.API}/analizar/upload`, form);
  }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    });
  }

  // Enviar feedback (estrellas) O ticket de soporte
  enviarFeedbackOTicket(archivo: string, tipo: 'rating' | 'ticket', mensaje: string, estrellas: number = 0, sessionId: string = '') {
    return this.http.post<any>(`${this.API}/tickets`, {
      archivo, 
      tipo, 
      estrellas, 
      mensaje,
      sessionId
    }, { headers: this.getAuthHeaders() });
  }

  descargarArchivoRespuesta(ticketId: string, index: number): Observable<Blob> {
    return this.http.get(`${this.API}/tickets/${ticketId}/archivo-respuesta/${index}`, { 
      responseType: 'blob',
      headers: this.getAuthHeaders()
    });
  }

  getMisTickets(): Observable<{ ok: boolean; data: any[] }> {
    return this.http.get<any>(`${this.API}/tickets/mios`, { headers: this.getAuthHeaders() });
  }

  // ── SSE streaming del análisis ──────────────────────────────────────────────
  // Devuelve un Observable que emite cada evento JSON que Python produce
  streamAnalisis(sessionId: string, token: string): Observable<EventoSSE> {
    return new Observable<EventoSSE>((observer) => {
      const url = `${this.API}/analizar/stream/${sessionId}`;
      const es  = new EventSource(`${url}?token=${token}`);
      // NOTA: EventSource no soporta headers custom en el navegador.
      // Node.js verifica el token via query param en este endpoint.

      es.onmessage = (event) => {
        try {
          const dato = JSON.parse(event.data) as EventoSSE;
          observer.next(dato);
          if (dato.tipo === 'fin' || dato.tipo === 'error') {
            es.close();
            observer.complete();
          }
        } catch (_) {
          // línea no-JSON ignorada (keep-alive ping)
        }
      };

      es.onerror = (err) => {
        es.close();
        observer.error(err);
      };

      // Cleanup si Angular destruye el componente
      return () => es.close();
    });
  }

  // ── Obtener resultado guardado en MongoDB ───────────────────────────────────
  getResultado(sessionId: string): Observable<{ ok: boolean; informe: any }> {
    return this.http.get<any>(`${this.API}/analizar/resultado/${sessionId}`);
  }

  // ── Analítica y Top Errores ─────────────────────────────────────────────────
  getHistorialCompletoParaMetricas() {
    return this.http.get<any>(`${this.API}/admin/historial/mio-completo`);
  }

  // ── Chat contextual ─────────────────────────────────────────────────────────
  chat(messages: any[], sessionId?: string, informe?: any, archivo?: string): Observable<{ respuesta: string }> {
    return this.http.post<any>(`${this.API}/chat`, { messages, sessionId, informe, archivo });
  }

  // ── Historial del usuario actual ────────────────────────────────────────────
  getHistorialMio(): Observable<{ ok: boolean; historial: any[] }> {
    return this.http.get<any>(`${this.API}/admin/historial/mio`);
  }
}
