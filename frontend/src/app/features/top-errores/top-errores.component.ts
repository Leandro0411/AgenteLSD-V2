import { Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeStyle } from '@angular/platform-browser';
import { LsdService } from '../../core/services/lsd.service';

@Component({
  selector: 'app-top-errores',
  templateUrl: './top-errores.component.html',
  styleUrls: ['./top-errores.component.scss']
})
export class TopErroresComponent implements OnInit {
  cargando = true;
  errorCarga = '';
  historialAnalizado = 0;

  pctCriticos = 0;
  pctAdvertencias = 0;
  pctOk = 0;

  topErrores: any[] = [];
  errorExpandido: string | null = null;

  constructor(
    private lsd: LsdService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.lsd.getHistorialCompletoParaMetricas().subscribe({
      next: (res) => {
        try {
          this.procesarMetricas(res.historial || []);
        } catch (err) {
          console.error('[top-errores] Error procesando métricas:', err);
          this.errorCarga = 'Error al procesar los datos del historial.';
        }
        this.cargando = false;
      },
      error: (err) => {
        console.error('[top-errores] Error HTTP al cargar historial:', err);
        this.errorCarga = `No se pudo cargar el historial (HTTP ${err.status}).`;
        this.cargando = false;
      }
    });
  }

  procesarMetricas(historial: any[]): void {
    this.historialAnalizado = historial.length;
    if (!this.historialAnalizado) return;

    let criticosCount = 0;
    let advertenciasCount = 0;
    let okCount = 0;
    const mapaErrores = new Map<string, any>();

    historial.forEach(analisis => {
      // Conteo para la dona de veredictos
      if (analisis.veredicto === 'SERÁ RECHAZADO') criticosCount++;
      else if (analisis.veredicto === 'REVISAR') advertenciasCount++;
      else okCount++;

      const problemas = Array.isArray(analisis.problemas) ? analisis.problemas : [];

      // Set para contar cada error UNA SOLA VEZ por análisis distinto
      // (aunque el mismo error aparezca con N empleados en el mismo archivo)
      const idsVistoEnEsteAnalisis = new Set<string>();

      problemas.forEach((p: any) => {
        if (!p || !p.id) return;

        if (!mapaErrores.has(p.id)) {
          mapaErrores.set(p.id, {
            id: p.id,
            titulo: p.titulo || p.id,
            severidad: p.severidad,
            causa: p.causa || 'Causa no especificada.',
            solucion: p.solucion || 'Sin solución cargada.',
            frecuencia: 0,          // cuántos análisis distintos tuvieron este error
            cuilsAfectadosTotal: 0  // total acumulado de CUILs afectados histórico
          });
        }

        const item = mapaErrores.get(p.id);

        // Incrementar frecuencia solo UNA VEZ por análisis
        if (!idsVistoEnEsteAnalisis.has(p.id)) {
          item.frecuencia += 1;
          idsVistoEnEsteAnalisis.add(p.id);
        }

        // Acumular CUILs de todos los análisis
        item.cuilsAfectadosTotal += (p.cuils_afectados || 0);
      });
    });

    this.pctCriticos     = Math.round((criticosCount     / this.historialAnalizado) * 100);
    this.pctAdvertencias = Math.round((advertenciasCount  / this.historialAnalizado) * 100);
    this.pctOk           = Math.round((okCount            / this.historialAnalizado) * 100);

    this.topErrores = Array.from(mapaErrores.values())
      .sort((a, b) => b.frecuencia - a.frecuencia)
      .slice(0, 10);

    console.log(`[top-errores] ${this.historialAnalizado} análisis procesados → ${this.topErrores.length} errores distintos encontrados`);
  }

  toggleError(id: string): void {
    this.errorExpandido = this.errorExpandido === id ? null : id;
  }

  getDonutGradient(): SafeStyle {
    const pCrit = this.pctCriticos || 0;
    const pAdv  = pCrit + (this.pctAdvertencias || 0);
    const style = `conic-gradient(#EF4444 0% ${pCrit}%, #F59E0B ${pCrit}% ${pAdv}%, #10B981 ${pAdv}% 100%)`;
    return this.sanitizer.bypassSecurityTrustStyle(style);
  }
}