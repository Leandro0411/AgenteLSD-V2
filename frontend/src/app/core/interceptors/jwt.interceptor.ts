// src/app/core/interceptors/jwt.interceptor.ts
import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

@Injectable()
export class JwtInterceptor implements HttpInterceptor {
  constructor(private auth: AuthService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // 1. Inyectamos el token si existe
    const token = this.auth.token;
    if (token) {
      req = req.clone({
        setHeaders: { Authorization: `Bearer ${token}` },
      });
    }

    // 2. Manejamos la respuesta
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        // Si el servidor responde con 401 (Token expirado o inválido)
        if (error.status === 401) {
          console.warn('⚠️ Token expirado. Cerrando sesión automáticamente...');
          this.auth.logout(); // Esto limpia el localStorage y te manda al /login
        }
        
        // Dejamos que el error siga su curso por si otro componente quiere leer el mensaje
        return throwError(() => error);
      })
    );
  }
}