// src/app/core/guards/auth.guard.ts
import { Injectable } from '@angular/core';
import { CanActivate, CanActivateChild, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate, CanActivateChild {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(): boolean {
    return this.verificarAcceso();
  }

  canActivateChild(): boolean {
    return this.verificarAcceso();
  }

  private verificarAcceso(): boolean {
    // Si tiene sesión activa, pasa directo
    if (this.auth.estaAutenticado) {
      return true;
    }
    
    // Si no tiene sesión, lo pateamos sin escalas al login
    this.router.navigate(['/login']);
    return false;
  }
}