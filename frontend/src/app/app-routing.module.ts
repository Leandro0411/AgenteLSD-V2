// src/app/app-routing.module.ts
import { NgModule }             from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HistorialComponent } from './features/historial/historial.component';
import { AuthGuard }          from './core/guards/auth.guard';
import { AdminGuard }         from './core/guards/admin.guard';
import { LoginComponent }     from './features/login/login.component';
import { AnalizarComponent }  from './features/analizar/analizar.component';
import { AdminComponent }     from './features/admin/admin.component';
import { LayoutComponent }    from './shared/components/layout/layout.component';
import { TopErroresComponent } from './features/top-errores/top-errores.component';
import { MisTicketsComponent } from './features/mis-tickets/mis-tickets.component';

const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    canActivateChild: [AuthGuard],
    children: [
      { path: '',        redirectTo: 'analizar', pathMatch: 'full' },
      { path: 'analizar', component: AnalizarComponent },
      { path: 'admin',    component: AdminComponent, canActivate: [AdminGuard] },
      { path: 'historial', component: HistorialComponent },
      { path: 'top-errores', component: TopErroresComponent },
      { path: 'mis-tickets', component: MisTicketsComponent },
    ],
  },
  { path: '**', redirectTo: 'login' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
