// src/app/features/login/login.component.ts
import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent {
  form: FormGroup;
  cargando = false;
  error    = '';

  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router) {
    this.form = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      password: ['', [Validators.required, Validators.minLength(4)]],
    });
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.cargando = true;
    this.error    = '';

    const { username, password } = this.form.value;
    this.auth.login(username, password).subscribe({
      next:  () => this.router.navigate(['/analizar']),
      error: (err) => {
        this.error    = err.error?.error || 'Credenciales incorrectas.';
        this.cargando = false;
      },
    });
  }
}
