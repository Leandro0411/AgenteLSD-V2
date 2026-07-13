// src/app/app.module.ts
import { NgModule }              from '@angular/core';
import { BrowserModule }         from '@angular/platform-browser';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { ReactiveFormsModule, FormsModule }    from '@angular/forms';

import { AppRoutingModule }   from './app-routing.module';
import { AppComponent }       from './app.component';

import { HistorialComponent } from './features/historial/historial.component';
// Core
import { JwtInterceptor }     from './core/interceptors/jwt.interceptor';

// Features
import { LoginComponent }     from './features/login/login.component';
import { AnalizarComponent }  from './features/analizar/analizar.component';
import { AdminComponent }     from './features/admin/admin.component';
import { TopErroresComponent } from './features/top-errores/top-errores.component';
import { MisTicketsComponent } from './features/mis-tickets/mis-tickets.component';

// Shared
import { LayoutComponent }    from './shared/components/layout/layout.component';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    AnalizarComponent,
    AdminComponent,
    LayoutComponent,
    HistorialComponent,
    TopErroresComponent,
    MisTicketsComponent,
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    ReactiveFormsModule,
    FormsModule,
    AppRoutingModule,
  ],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: JwtInterceptor, multi: true },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
