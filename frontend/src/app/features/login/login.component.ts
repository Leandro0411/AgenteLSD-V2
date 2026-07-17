import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  form!: FormGroup;
  cargando = false;
  error    = '';
  
  modo: 'login' | 'registro' = 'login'; 

  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router) {}

  ngOnInit() {
    this.construirFormulario();
  }

  // Validador personalizado para confirmar la contraseña
  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;
    
    // Solo validamos si estamos en modo registro y las contraseñas son distintas
    if (this.modo === 'registro' && password !== confirmPassword) {
      return { passwordMismatch: true };
    }
    return null;
  }

  construirFormulario() {
    this.form = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      password: ['', [Validators.required, Validators.minLength(4)]],
      // Campos extra, empiezan deshabilitados/no requeridos para el login
      email: [''],
      telefono: [''],
      confirmPassword: ['']
    }, { validators: this.passwordMatchValidator.bind(this) }); // Añadimos el validador a nivel de grupo
  }

  toggleModo(): void {
    this.modo = this.modo === 'login' ? 'registro' : 'login';
    this.error = '';
    this.form.reset();

    // Actualizamos las validaciones de los campos dinámicamente
    if (this.modo === 'registro') {
      this.form.get('email')?.setValidators([Validators.required, Validators.email]);
      this.form.get('confirmPassword')?.setValidators([Validators.required]);
    } else {
      this.form.get('email')?.clearValidators();
      this.form.get('confirmPassword')?.clearValidators();
    }
    
    // Reevaluamos el formulario con las nuevas reglas
    this.form.get('email')?.updateValueAndValidity();
    this.form.get('confirmPassword')?.updateValueAndValidity();
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.cargando = true;
    this.error    = '';

    const { username, password, email, telefono } = this.form.value;

    if (this.modo === 'login') {
      this.auth.login(username, password).subscribe({
        next:  () => this.router.navigate(['/analizar']),
        error: (err) => {
          this.error    = err.error?.error || 'Credenciales incorrectas.';
          this.cargando = false;
        },
      });
    } else {
      // ⚠️ IMPORTANTE: Asegurate de que tu auth.service.ts acepte los 4 parámetros en auth.registro()
      this.auth.registro(username, password, email, telefono).subscribe({
        next:  () => this.router.navigate(['/analizar']),
        error: (err) => {
          this.error    = err.error?.error || 'Error al crear la cuenta.';
          this.cargando = false;
        },
      });
    }
  }
}