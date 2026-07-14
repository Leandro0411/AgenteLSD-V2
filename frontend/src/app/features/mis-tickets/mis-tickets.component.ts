import { Component, OnInit } from '@angular/core';
import { LsdService } from '../../core/services/lsd.service';

@Component({
  selector: 'app-mis-tickets',
  templateUrl: './mis-tickets.component.html',
  styleUrls: ['./mis-tickets.component.scss']
})
export class MisTicketsComponent implements OnInit {
  tickets: any[] = [];
  cargando = true;
  filtroEstado: 'todos' | 'abierto' | 'cerrado' = 'todos';

  constructor(private lsd: LsdService) {}

  ngOnInit(): void {
    this.lsd.getMisTickets().subscribe({
      next: (res) => { 
        this.tickets = (res.data || []).filter((t: any) => t.tipo === 'ticket'); 
        this.cargando = false; 
      },
      error: () => this.cargando = false
    });
  }

  get ticketsFiltrados() {
    return this.tickets.filter(t => 
      this.filtroEstado === 'todos' || t.estado === this.filtroEstado
    );
  }

  descargarArchivo(ticketId: string, index: number, nombre: string): void {
    this.lsd.descargarArchivoRespuesta(ticketId, index).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombre;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => alert('El archivo ya no se encuentra disponible.')
    });
  }
}