// src/app/core/services/auth.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Usuario {
  username: string;
  rol: 'admin' | 'usuario';
}

interface LoginResponse {
  ok: boolean;
  token: string;
  usuario: Usuario;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly API = `${environment.apiUrl}/auth`;

  // Token y usuario SOLO en memoria: al recargar la página (F5, cerrar la
  // pestaña, volver a abrir la app) este estado se pierde y el AuthGuard
  // vuelve a mandar a /login. Ya no se persiste en localStorage.
  private _token: string | null = null;
  private _usuario$ = new BehaviorSubject<Usuario | null>(null);

  constructor(private http: HttpClient, private router: Router) {}

  get usuario$(): Observable<Usuario | null> {
    return this._usuario$.asObservable();
  }

  get usuario(): Usuario | null {
    return this._usuario$.value;
  }

  get token(): string | null {
    return this._token;
  }

  get esAdmin(): boolean {
    return this.usuario?.rol === 'admin';
  }

  get estaAutenticado(): boolean {
    return !!this.token;
  }

  // ── Cambiar Rol de Usuario ──
  cambiarRolUsuario(usuarioId: string, nuevoRol: string): Observable<any> {
    return this.http.put(`${this.API}/usuarios/${usuarioId}/rol`, { rol: nuevoRol });
  }

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.API}/login`, { username, password }).pipe(
      tap((res) => {
        this._token = res.token;
        this._usuario$.next(res.usuario);
      })
    );
  }

  // 1. Agregamos email y telefono a los parámetros que recibe la función
  registro(username: string, password: string, email: string, telefono?: string): Observable<LoginResponse> {
    
    // 2. Sumamos email y telefono adentro de las llaves { ... } para que viajen al backend
    return this.http.post<LoginResponse>(`${this.API}/register`, { username, password, email, telefono }).pipe(
      tap((res) => {
        // Guardamos la sesión exactamente igual que en el login
        this._token = res.token;
        this._usuario$.next(res.usuario);
      })
    );
  }

  logout(): void {
    this._token = null;
    this._usuario$.next(null);
    this.router.navigate(['/login']);
  }
}