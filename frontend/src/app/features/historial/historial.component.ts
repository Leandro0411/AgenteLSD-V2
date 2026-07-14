import { Component, OnInit } from '@angular/core';
import { LsdService } from '../../core/services/lsd.service';

@Component({
  selector: 'app-historial',
  templateUrl: './historial.component.html',
  styleUrls: ['./historial.component.scss']
})

export class HistorialComponent implements OnInit {
  historial: any[] = [];
  cargando = true;
  error = '';

  filaExpandida: number | null = null;

  limiteHistorial = 10;
  historialCompleto = false;
  cargandoMas = false;

  constructor(private lsd: LsdService) {}

  ngOnInit(): void {
    this.cargarHistorial();
  }

  cargarHistorial(): void {
    this.lsd.getHistorialMio(this.limiteHistorial).subscribe({
      next: (res) => {
        this.historial = res.historial || [];
        this.cargando = false;
        this.cargandoMas = false;

        // Si la base nos devuelve menos registros de los que pedimos, llegamos al final
        if (this.historial.length < this.limiteHistorial) {
          this.historialCompleto = true;
        }
      },
      error: () => {
        this.error = 'Error al cargar tu historial.';
        this.cargando = false;
        this.cargandoMas = false;
      }
    });
  }

  cargarMas(): void {
    this.cargandoMas = true;
    this.limiteHistorial += 10;
    this.cargarHistorial();
  }

  toggleFila(index: number): void {
    this.filaExpandida = this.filaExpandida === index ? null : index;
  }
  
  /**
   * Extrae el array de problemas del registro de historial.
   * El campo `problemas` viene directo del modelo MongoDB.
   * Solo filtra los que tienen al menos id o titulo para no mostrar entradas vacías.
   */
  getProblemas(h: any): any[] {
    const lista = Array.isArray(h.problemas) ? h.problemas : [];
    return lista.filter((p: any) => p && (p.id || p.titulo));
  }
}