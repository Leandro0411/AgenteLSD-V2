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

  constructor(private lsd: LsdService) {}

  ngOnInit(): void {
    this.cargarHistorial();
  }

  cargarHistorial(): void {
    this.lsd.getHistorialMio().subscribe({
      next: (res) => {
        this.historial = res.historial || [];
        this.cargando = false;
      },
      error: () => {
        this.error = 'Error al cargar tu historial.';
        this.cargando = false;
      }
    });
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