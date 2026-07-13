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
  private readonly TOKEN_KEY = 'lsd_token';
  private readonly USER_KEY  = 'lsd_user';

  private _usuario$ = new BehaviorSubject<Usuario | null>(this._usuarioGuardado());

  constructor(private http: HttpClient, private router: Router) {}

  get usuario$(): Observable<Usuario | null> {
    return this._usuario$.asObservable();
  }

  get usuario(): Usuario | null {
    return this._usuario$.value;
  }

  get token(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  get esAdmin(): boolean {
    return this.usuario?.rol === 'admin';
  }

  get estaAutenticado(): boolean {
    return !!this.token;
  }

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.API}/login`, { username, password }).pipe(
      tap((res) => {
        localStorage.setItem(this.TOKEN_KEY, res.token);
        localStorage.setItem(this.USER_KEY, JSON.stringify(res.usuario));
        this._usuario$.next(res.usuario);
      })
    );
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this._usuario$.next(null);
    this.router.navigate(['/login']);
  }

  private _usuarioGuardado(): Usuario | null {
    try {
      const raw = localStorage.getItem(this.USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
